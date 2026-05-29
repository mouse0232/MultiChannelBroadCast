# Worker API 缓存策略设计文档

## 1. 架构背景与目标
**背景**：项目从 HTTP 调用切换为 **Service Binding (Pages 直连 Worker)** 模式。此模式绕过了 Cloudflare 公网 CDN 的自动拦截逻辑，导致 D1 数据库请求量激增。D1 在休眠唤醒时存在 **1s - 2s** 冷启动延迟，导致页面加载变慢。
**目标**：在 Worker 内部（入口处）增加基于 Cloudflare Cache API 的缓存层，减少 D1 唤醒频率，提升 API 响应速度。

## 2. 技术选型：Cloudflare Cache API (`caches.default`)
**为什么不用 Worker 本地内存？**
*   **风险高**：Worker 内存限制 128MB，缓存大量帖子 JSON 极易导致 OOM (内存溢出崩溃)。
*   **隔离性**：Worker 实例之间内存不共享，并发高时命中率低。
*   **控制复杂**：需要手动管理过期时间、LRU 淘汰算法等。

**为什么选择 Cache API？**
*   **稳定安全**：不消耗 Worker 实例内存，由 Cloudflare 托管，天然支持 LRU 和容量淘汰。
*   **跨实例共享**：在 Cloudflare 全球边缘网络中共享命中率。
*   **原生支持**：基于标准的 HTTP `Cache-Control` 语义，开发维护成本低。

## 3. 缓存分层策略 (Cache Tiers)

根据数据实时性要求，将 API 分为三个层级进行处理：

| 层级 | 接口 (路径) | 业务特征 | TTL 策略 (边缘缓存时间) | 改造方式 |
| :--- | :--- | :--- | :--- | :--- |
| **L1 静态层** | `/api/channels` | 频道列表，变化极少 | 2 小时 | **写入缓存** (GET only) |
| **L2 内容层** | `/api/posts` | 帖子列表/单贴，高频读取 | 3 - 5 分钟 | **写入缓存** (GET only) |
| **L2 内容层** | `/api/search` | 搜索接口，计算压力大 | 10 分钟 | **写入缓存** (GET only) |
| **L3 动态层** | `/img-proxy` | 图片代理，超大文件 | 永久 (R2 持久化) | **保持现状** (已用 R2) |
| **L4 实时层** | Webhooks / 管理 | 数据更新、推送 | **不缓存** | **禁止缓存** (POST/Dynamic) |

## 4. 接口参数梳理 (API Parameter Registry)

在改造代码前，必须明确每个接口使用的参数，以便在生成 Cache Key 时**精准保留核心参数**并**剔除干扰参数**。

| 接口 (路径) | 请求方式 | 参数名 | 是否核心业务 (影响数据) | 干扰/随机参数 |
| :--- | :--- | :--- | :--- | :--- |
| `/api/regrab` | POST | `limit` | ✅ 是 (限制抓取数) | 无 |
| `/api/init` | POST | 无 | N/A | 无 |
| `/img-proxy` | GET | `url` | ✅ 是 (目标图链接) | 无 (不走 CDN 缓存，走 R2) |
| `/static/...` | GET | 路径中的 Host/File | ✅ 是 | 无 (视频/音频流) |
| **`/api/post/<id>`** | GET | 路径中的 `<id>` (如 `channel/123`) | ✅ **是** (单篇帖子) | 无 |
| **`/api/posts/search`** | GET | `q` (关键词) | ✅ **是** | 无 |
| | | `channel` (频道名) | ✅ **是** | 无 |
| | | `limit` (条数) | ✅ **是** | 无 |
| **`/api/posts`** | GET | `channel` (频道名) | ✅ **是** | 无 |
| | | `limit` (每页条数) | ✅ **是** | 无 |
| | | `before` (上一页游标) | ✅ **是** | 无 |
| | | `after` (下一页游标) | ✅ **是** | 无 |
| **`/api/channels`** | GET | 无 | 获取全量列表 | 无 |

## 5. URL 规范化与缓存 Key 设计
缓存的命中率直接依赖于 Key 的唯一性。为了避免因参数顺序不同导致“重复缓存”（同一份数据存了两份），必须在 `match` 之前对 URL 进行规范化。

*   **问题**：`/api/posts?channel=abc&limit=20` 和 `/api/posts?limit=20&channel=abc&_t=123` 本应是同一个请求。
*   **方案**：
    1.  **保留核心参数 (绝对不可剔除)**：业务与分页参数（如 `channel`, `page`, `limit`, `cursor`, `id`）决定数据内容，**必须完整保留**。
    2.  **剔除干扰项**：前端防缓存随机数（如 `_t`, `_bust`）或追踪参数（如 `utm_*`, `ref`）会导致 Key 永远不命中，**必须剔除**。
    3.  **参数排序**：将剩余的核心参数按字母表顺序重排。
    4.  **构建新 URL**：用清洗后的参数生成标准的 `fakeUrl`，专门用于 Cloudflare Cache 的 `match` 和 `put`。

## 6. 缓存失效机制：混合策略 (Hybrid Expiration Strategy)

针对不同接口的数据量级与更新频率，本项目采用 **"版本号+短 TTL" 混合失效策略**。

### 6.1 Worker 内存版本号映射策略 (核心 - 列表)
本策略适用于：**频道列表接口** (`/api/posts?channel=xxx`) 与 **频道列表接口** (`/api/channels`)。
**原理**：利用 Worker 全局内存（Module 变量）维护版本号清单，实现极速匹配与定时回源。
**版本号源**：D1 `channel_meta` 中的 `last_msg_id` 天然作为版本号。
*   **内存版本映射清单 (内存对象)**：
    *   **结构**：存储于 Worker 顶层的全局对象（如 `VERSION_CACHE = { ts: 0, versions: {} }`）。
    *   **更新频率**：**按需+定时触发**。若内存数据超过 60 秒（TTL），则触发一次 D1 查询以更新版本号。
    *   **Key 格式**：包含具体频道和聚合标记。
        *   `"__ALL__": "1701000001"` (代表全站聚合列表，取所有频道中最大的 last_msg_id)
        *   `"banlan": "12345"` (单频道)
    *   **主动失效 (Invalidation)**：当用户触发 `/api/regrab` (POST) 等数据写入操作时，**立即清空** `VERSION_CACHE` 的时间戳 (`ts = 0`)，强制下一次 GET 请求从 D1 获取最新状态，确保数据更新后缓存能迅速感知变化。

**Key 拼装公式：生成虚拟 Key (Virtual Key)**
*   **机制**：**不修改浏览器请求的真实 URL**。Worker 在内部提取版本号后，拼接成虚拟字符串作为 Cache API Key。
    *   真实请求：`GET /api/posts?channel=banlan`
    *   **虚拟缓存 Key**：`"12345-/api/posts?channel=banlan"`
*   **逻辑闭环**：
    *   版本号变了 -> 虚拟 Key 变了 -> 旧缓存 Key 不匹配 -> 穿透回源查库。
    *   版本号没变 -> 虚拟 Key 没变 -> 命中缓存 -> 极速返回。

**失效策略说明 (复杂场景处理)**
1.  **聚合首页 (channel=all)**：
    *   **机制**：在版本清单中维护一个 `__ALL__` 聚合版本键（任何频道有新帖，该值即递增）。
    *   **拼接**：`"1701000001-/api/posts?channel=all&limit=20"`。
    *   **效果**：只要站内任何一个频道更新，全站首页缓存立刻失效。
2.  **频道翻页 (Pagination)**：
    *   **机制**：翻页参数（如 `limit`, `before`）直接保留在真实 URL 中。
    *   **拼接**：`"12345-/api/posts?channel=banlan&limit=20&before=2024-01-01"`。
    *   **效果**：版本号一旦刷新，该频道的**所有分页缓存**将同时失效（Key 变更），强制回源获取最新分页数据。

### 6.2 短 TTL 策略 (辅助 - 搜索 & 单帖)
本策略适用于：`/api/post/<id>`（单帖详情）与 `/api/posts/search`（搜索接口）。
**原因**：
1.  **帖子详情**：ID 数量庞大（十万级），无法维护版本。
2.  **搜索接口**：跨频道混合，无法确定单一版本号。
**策略 (Stale-While-Revalidate)**：
*   **单帖**：`max-age=600` (10分钟)，`stale-while-revalidate=3600` (1小时)。
*   **搜索**：`max-age=1800` (30分钟)。

### 6.3 为什么混合策略是唯一正解？
1.  **极速与精准**：列表走 Worker 内存版本号，匹配耗时 **0ms**。通过 `__ALL__` 处理聚合页，谁变谁更新，用户无延迟感。
2.  **零冲突**：Cron 只负责改 D1 里的 `last_msg_id`，不需要管缓存系统。缓存系统只需在 Worker 运行时按需读一下 D1，实现了解耦。
3.  **轻量化**：单帖和搜索回归 TTL，保护数据库不因数十万次 ID 查询而崩溃。

## 7. 风险控制与注意事项

### 6.1 严禁缓存 POST 请求
*   **原则**：所有修改数据的接口（POST/PUT）一律跳过缓存层。
*   **原因**：POST 请求的结果通常包含“操作成功”等状态信息，缓存这些无意义且会导致逻辑混乱。

### 6.2 Stale-While-Revalidate (过期后重新验证)
*   **策略**：利用 Cloudflare 的 `stale-while-revalidate` 特性。
*   **做法**：在 response 头里加上 `stale-while-revalidate=600`。
*   **好处**：即使缓存超时了，Cloudflare 也会先把旧数据返回给用户（秒开），然后在后台悄悄请求 Worker 刷新缓存。用户完全感知不到数据库查询的延迟。

### 6.3 并发穿透 (Stampeding Herd)
*   **现象**：缓存失效瞬间，100 个请求同时打进来，全部穿透到 D1。
*   **解决**：
    1.  利用 CF 自带的请求合并（Request Coalescing）。
    2.  对于未命中缓存的请求，利用 `ctx.waitUntil(cache.put(...))` 确保数据先入库，再返回，避免重复 IO。

## 7. 缓存监控与排查 (Cache Observability)

由于 API 走 Service Binding (内网)，且 HTML 输出可能被 CDN/构建工具压缩丢失，**唯一可靠的监控方案是 Worker 运行日志 (Tail Logs)**。

### 7.1 Cloudflare Worker 日志
在 Worker 代码中打印结构化日志，每次 API 请求结束后自动输出：

```text
[API Cache] HIT - GET /api/posts?channel=xxx&limit=20 (Time: 5ms)
[API Cache] MISS - GET /api/posts?channel=yyy&limit=20 (Time: 1.2s)
```

**排查指引**：
1. 在 Cloudflare Worker 面板打开 **Tail Logs**。
2. 刷新页面，观察日志：
   * 如果频繁看到 **MISS** 且耗时很长，说明缓存未生效。
   * 如果看到 **HIT** 且耗时 < 50ms，说明缓存生效，性能达标。
   * **注意**：不再观察 PURGE 日志，因为我们已放弃主动清除，缓存更新仅靠 TTL 过期自动触发。

## 8. 实施优先级 (Implementation Plan)

为了降低风险，分步实施：

*   **第一步（低风险）**：实现 `/api/channels` 缓存。这是全局入口，访问量大且不常变。
*   **第二步（中风险）**：实现 `/api/posts` 缓存。这是首页和频道页的核心，需验证参数排序逻辑是否正确。
*   **第三步（验证监控）**：观察 Tail Logs 确认 TTL 过期后的自动刷新逻辑正常运行即可。
