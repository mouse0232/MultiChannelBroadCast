# Service Bindings 额度优化设计文档

## 1. 背景

### 1.1 问题描述

当前项目采用 **Cloudflare Pages (Astro SSR) + Cloudflare Worker (mcb-crawler)** 架构。当用户访问 SSR 页面时，Astro 在服务端通过 HTTP 公网请求调用 mcb-crawler Worker 的 API 端点获取数据。

每次页面渲染都会产生 **双重额度消耗**：
1. Pages SSR 执行消耗（必须）
2. Pages → Worker API 的 HTTP 请求消耗（可优化）

mcb-crawler Worker 的免费额度为 **10 万次/天**的请求限制。当 SSR 页面访问量较高时，API 调用会迅速消耗这部分额度，影响实际业务功能（Cron 抓取、Queue 消费、API 接口响应）。

### 1.2 现状架构

```
用户请求
  ↓
Cloudflare Pages (Astro) —— 公网 HTTP 请求 ——→ mcb-crawler Worker
  │                                              ↓
  │                                        D1 / KV / Queue
  │
 Pages 函数 (Pages Functions)
  ├── src/lib/d1-client.js     →  GET /api/channels
  │                              GET /api/posts
  │
  ├── src/pages/posts/[...id].astro  →  GET /api/post/:id
  └── src/pages/search/[q].astro     →  GET /api/posts/search
```

**4 个 API 调用点：**

| 文件 | 调用位置 | 当前实现 |
|------|----------|----------|
| `src/lib/d1-client.js` | `getChannels()` | `fetch(baseUrl + '/api/channels')` |
| `src/lib/d1-client.js` | `getPosts()` | `fetch(baseUrl + '/api/posts?...')` |
| `src/pages/posts/[...id].astro` | 第 19 行 | `fetch(baseUrl + '/api/post/' + id)` |
| `src/pages/search/[q].astro` | 第 18 行 | `fetch(baseUrl + '/api/posts/search?q=...')` |

Worker URL 来源：`src/lib/d1-client.js` 第 8 行
```js
export function getWorkerBaseUrl(Astro) {
  return getEnv(import.meta.env, Astro, 'WORKER_URL') || 'https://mcb-crawler.mouse0232.workers.dev'
}
```

---

## 2. Service Bindings 方案

### 2.1 方案原理

Cloudflare Service Bindings 允许一个 Worker/Pages 调用另一个 Worker，**无需经过公网 URL，且不消耗目标 Worker 的请求额度**。

关键特性（来自官方文档）：
- **免费调用**：不消耗被调用 Worker 的 10 万次/天请求额度
- **零延迟**：两个 Worker 运行在同一线程的同一台 Cloudflare 服务器上
- **安全**：不暴露公网端点
- **兼容现有 fetch API**：`env.BINDING.fetch(request)` 返回标准 Response

### 2.2 优化后架构

```
用户请求
  ↓
Cloudflare Pages (Astro)
  │
  ├── env.MCB_CRAWLER.fetch()  ← Service Binding（免费）
  │         ↓
  │   mcb-crawler Worker
  │         ↓
  │   D1 / KV / Queue
  │
  └── 降级：fetch(WORKER_URL)  ← 公网 HTTP（binding 不可用时）
             ↓
        mcb-crawler Worker
```

额度节省对比：

| 调用类型 | 改动前 | 改动后 |
|----------|--------|--------|
| 用户 → Pages | 消耗 Pages 额度 | 消耗 Pages 额度（不变） |
| Pages → mcb-crawler API | 消耗 Worker 请求额度 | **免费**（Service Binding） |
| mcb-crawler Cron/Queue | 免费 | 免费 |

---

## 3. 详细设计

### 3.1 改动文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `wrangler-pages.toml` | 新增 | 声明 Service Binding |
| `src/lib/d1-client.js` | 修改 | 加入 `callWorkerApi()` 辅助函数 |
| `src/pages/posts/[...id].astro` | 修改 | 改用 `callWorkerApi()` |
| `src/pages/search/[q].astro` | 修改 | 改用 `callWorkerApi()` |
| `src/lib/env.js` | 修改 | 增加 `runtime env` 获取支持 |

### 3.2 wrangler-pages.toml

当前文件为空。写入以下内容以声明 Service Binding：

```toml
# mcb-crawler Worker Service Binding
# 让 Pages Functions 能够免费调用 mcb-crawler Worker 的 API
[[services]]
binding = "MCB_CRAWLER"
service = "mcb-crawler"
```

**参数说明：**
- `binding`：在 Pages 运行环境中暴露的变量名，通过 `env.MCB_CRAWLER` 访问
- `service`：目标 Worker 的名称，必须与 `wrangler.toml` 中的 `name` 字段一致

### 3.3 请求来源标识

为了便于定位问题，在 Pages 调用 Worker API 时，通过透传 `X-Request-Source` 请求头标识调用来源：

| Header 值 | 含义 |
|-----------|------|
| `service-binding` | Service Binding 内部调用（免费） |
| `http` | HTTP 公网请求（降级路径） |

Pages 端设置：
```js
// 在 callWorkerApi 中根据路径自动设置
headers['X-Request-Source'] = 'service-binding'  // 或 'http'
```

Worker 端读取（`cache-worker.js`）：
```js
const requestSource = request.headers.get('x-request-source') || 'direct'
// 'direct' 表示非 Pages 调用（如 Cron、Queue、浏览器直连）
```

Worker 日志中 `source` 字段取值对比：

| 来源 | `source` 值 | 说明 |
|------|------------|------|
| Cron 触发器 / Queue 消费者 | `direct` | mcb-crawler 自身触发，非外部调用 |
| Pages 通过 Service Binding 调用 | `service-binding` | 优化路径（免费） |
| Pages 通过 HTTP 降级调用 | `http` | 降级路径（消耗额度） |
| 浏览器/curl 直接访问 Worker | `direct`（或无此 header） | 正常情况，Worker API 有 Secret 保护 |

### 3.4 callWorkerApi 辅助函数

在 `src/lib/d1-client.js` 中新增 `callWorkerApi()` 函数，统一管理所有 Worker API 调用。

```js
/**
 * 统一调用 Worker API
 * 优先使用 Service Binding（免费），降级为 HTTP 公网请求（兼容模式）
 * 
 * @param {string} pathname  - API 路径，如 '/api/channels'、'/api/posts?q=test'
 * @param {object} ctx       - Astro 上下文 (Astro 对象)
 * @param {object} options   - 可选配置
 * @param {object} options.headers - 额外请求头
 * @returns {Promise<Response>} fetch Response
 */
export async function callWorkerApi(pathname, ctx, { headers = {} } = {}) {
  // 1. 尝试从 Astro 运行时获取 Service Binding
  const runtimeEnv = ctx?.locals?.runtime?.env ?? ctx?.locals?.cfContext?.env ?? {}
  const binding = runtimeEnv.MCB_CRAWLER ?? null

  if (binding) {
    // Service Binding 模式（免费）
    const req = new Request(`https://mcb-crawler.internal${pathname}`, {
      headers: {
        ...headers,
        'X-Request-Source': 'service-binding',
      },
    })
    return binding.fetch(req)
  }

  // 2. 降级为 HTTP 公网请求（兼容模式）
  const baseUrl = getEnv(import.meta.env, ctx, 'WORKER_URL') 
               || 'https://mcb-crawler.mouse0232.workers.dev'
  return fetch(`${baseUrl}${pathname}`, {
    headers: {
      ...headers,
      'X-Request-Source': 'http',
    },
  })
}
```

调用模式对比：

| 模式 | 代码路径 | 触发条件 |
|------|----------|----------|
| **Service Binding** (免费) | `binding.fetch(request)` → `mcb-crawler` | `env.MCB_CRAWLER` 存在 |
| **HTTP 降级** (兼容) | `fetch(WORKER_URL + pathname)` | `env.MCB_CRAWLER` 不存在 |

### 3.5 Worker 端日志增强

在 `workers/cache-worker.js` 的 API 处理入口（`/api/posts`、`/api/posts/search`），读取 `X-Request-Source` header 并加入 debug 日志：

改前（`cache-worker.js` 第 957-977 行）：
```js
if (loggingEnabled) {
  const realUserIP = request.headers.get('x-real-user-ip') || request.headers.get('cf-connecting-ip')
  console.log('API Debug:', {
    timestamp: new Date().toISOString(),
    path: url.pathname,
    method: request.method,
    realUserIP: realUserIP,
    ...
  })
}
```

改后：
```js
if (loggingEnabled) {
  const realUserIP = request.headers.get('x-real-user-ip') || request.headers.get('cf-connecting-ip')
  const requestSource = request.headers.get('x-request-source') || 'direct'
  console.log('API Debug:', {
    timestamp: new Date().toISOString(),
    path: url.pathname,
    method: request.method,
    source: requestSource,          // ← 新增字段
    realUserIP: realUserIP,
    ...
  })
}
```

`source` 字段含义：
- `'service-binding'` — Pages 通过 Service Binding 调用（免费）
- `'http'` — Pages 通过 HTTP 降级调用（消耗额度）
- `'direct'` — 非 Pages 调用（Cron、Queue 或浏览器直连）

两个 API 端点都需要修改：
1. `/api/posts` — 第 1021-1044 行
2. `/api/posts/search` — 第 954-978 行

### 3.6 环境变量获取增强

当前 `env.js` 的 `getEnv` 函数已支持多种运行时环境获取。但 Service Binding 本身通过 `context.locals.runtime.env`（Astro v12）或 `Astro.locals.cfContext.env`（Astro v13+）获取。

需要在 `callWorkerApi` 内部做兼容处理：

```js
// Binding 获取优先级（兼容不同 Astro 版本）
const runtimeEnv = ctx?.locals?.runtime?.env ?? ctx?.locals?.cfContext?.env ?? {}
const binding = runtimeEnv.MCB_CRAWLER ?? null
```

### 3.5 各调用点的修改

#### 3.5.1 `getChannels()` 修改

改前：
```js
export async function getChannels(Astro) {
  const baseUrl = getWorkerBaseUrl(Astro)
  const secret = Astro.locals?.runtime?.env?.API_SECRET_KEY || ...
  const res = await fetch(`${baseUrl}/api/channels`, {
      headers: { 'X-API-Secret': secret }
  })
  ...
}
```

改后：
```js
export async function getChannels(Astro) {
  const secret = Astro.locals?.runtime?.env?.API_SECRET_KEY || ...
  const res = await callWorkerApi('/api/channels', Astro, {
      headers: { 'X-API-Secret': secret }
  })
  ...
}
```

**移除内容**：不再需要 `getWorkerBaseUrl(Astro)` 调用。

#### 3.5.2 `getPosts()` 修改

改前：
```js
export async function getPosts(Astro, { channel = 'all', limit = 20, before = '', after = '' } = {}) {
  const baseUrl = getWorkerBaseUrl(Astro)
  const secret = Astro.locals?.runtime?.env?.API_SECRET_KEY || ...
  ...
  const params = new URLSearchParams({ channel, limit: String(limit) })
  if (before) params.set('before', before)
  if (after) params.set('after', after)
  
  const headers = { 'X-API-Secret': secret }
  if (realIP) headers['X-Real-User-IP'] = realIP

  const res = await fetch(`${baseUrl}/api/posts?${params}`, { headers })
  ...
}
```

改后：
```js
export async function getPosts(Astro, { channel = 'all', limit = 20, before = '', after = '' } = {}) {
  const secret = Astro.locals?.runtime?.env?.API_SECRET_KEY || ...
  ...
  const params = new URLSearchParams({ channel, limit: String(limit) })
  if (before) params.set('before', before)
  if (after) params.set('after', after)
  
  const headers = { 'X-API-Secret': secret }
  if (realIP) headers['X-Real-User-IP'] = realIP

  const res = await callWorkerApi(`/api/posts?${params}`, Astro, { headers })
  ...
}
```

#### 3.5.3 `src/pages/posts/[...id].astro` 修改

改前：
```js
const baseUrl = getWorkerBaseUrl(Astro)
const secret = Astro.locals?.runtime?.env?.API_SECRET_KEY || ...
const res = await fetch(`${baseUrl}/api/post/${encodeURIComponent(decodedId)}`, {
  headers: { 'X-API-Secret': secret }
})
```

改后：
```js
// 需要增加导入
import { callWorkerApi } from '../../lib/d1-client'

const secret = Astro.locals?.runtime?.env?.API_SECRET_KEY || ...
const res = await callWorkerApi(`/api/post/${encodeURIComponent(decodedId)}`, Astro, {
  headers: { 'X-API-Secret': secret }
})
```

**移除导入**：可以移除 `getWorkerBaseUrl` 的 import（如果该文件不再需要）。

#### 3.5.4 `src/pages/search/[q].astro` 修改

改前：
```js
const baseUrl = getWorkerBaseUrl(Astro)
const res = await fetch(`${baseUrl}/api/posts/search?q=${encodeURIComponent(q)}&channel=${channelName}`, { ... })
```

改后：
```js
// 需要增加导入
import { callWorkerApi } from '../../lib/d1-client'

const res = await callWorkerApi(`/api/posts/search?q=${encodeURIComponent(q)}&channel=${channelName}`, Astro, { ... })
```

#### 3.5.4 `src/pages/posts/[...id].astro` 修改

改前：
```js
// src/pages/posts/[...id].astro
const baseUrl = getWorkerBaseUrl(Astro)
...
const res = await fetch(`${baseUrl}/api/post/${encodeURIComponent(decodedId)}`, {
  headers: { 'X-API-Secret': secret }
})
```

改后：
```js
import { callWorkerApi } from '../../lib/d1-client'
// 移除 getWorkerBaseUrl 的导入

const secret = Astro.locals?.runtime?.env?.API_SECRET_KEY || ...
const res = await callWorkerApi(`/api/post/${encodeURIComponent(decodedId)}`, Astro, {
  headers: { 'X-API-Secret': secret }
})
```

#### 3.5.5 `src/pages/search/[q].astro` 修改

改前：
```js
// src/pages/search/[q].astro  
import { getWorkerBaseUrl } from '../../lib/d1-client'

const baseUrl = getWorkerBaseUrl(Astro)
const res = await fetch(`${baseUrl}/api/posts/search?q=${encodeURIComponent(q)}&channel=${channelName}`, {...})
```

改后：
```js
import { callWorkerApi } from '../../lib/d1-client'
// 移除 getWorkerBaseUrl 的导入

const res = await callWorkerApi(`/api/posts/search?q=${encodeURIComponent(q)}&channel=${channelName}`, Astro, {...})
```

---

## 4. 兼容性设计

### 4.1 降级策略

Service Binding 作为**优先路径**，**HTTP fetch** 作为降级路径。确保以下场景下应用仍然可用：

| 场景 | Binding 可用？ | 行为 |
|------|---------------|------|
| 生产环境（Dashboard 已配置） | ✅ 是 | 使用 Service Binding（免费） |
| 生产环境（忘记配置 Dashboard） | ❌ 否 | 降级为 HTTP fetch（原有行为） |
| 本地 `astro dev` | ❌ 否 | 降级为 HTTP fetch（原有行为） |
| CI/CD preview 部署 | ❌ 否 | 降级为 HTTP fetch（原有行为） |

**关键保证**：即使忘了在 Dashboard 配置 Service Binding，也不会报错，只是走 HTTP 降级路径。

### 4.2 Astro 版本兼容性

项目当前使用 `@astrojs/cloudflare@^12.6.12`（Astro 5.x）。在 Astro 5.x / v12 中：

- 运行时环境变量通过 `Astro.locals.runtime.env` 获取
- 未来升级到 Astro 6 / v13+ 后，需要改为从 `cloudflare:workers` 的 `env` 导入

`callWorkerApi` 内部已处理多版本环境变量的查找链：
```js
const env = ctx?.locals?.runtime?.env ?? ctx?.locals?.cfContext?.env ?? {}
```

### 4.3 Worker URL 环境变量保留

`WORKER_URL` 环境变量**不移除**，作为降级路径的兜底值。即使配置了 Service Binding，环境变量仍然保留。

---

## 5. 风险分析与缓解

### 5.1 部署顺序依赖

**描述**：Service Binding 要求目标 Worker `mcb-crawler` **必须先部署**。如果 Pages 先部署但 Worker 还没部署，Pages 部署会报错。

**缓解措施**：
- 部署流程确保 `mcb-crawler` 先部署，Page 后部署
- 降级策略保证 binding 不可用时应用仍可运行（不阻断正常流程）

### 5.2 API 调用点遗漏

**描述**：当前有 4 个独立的 API 调用点。如有遗漏，该页面仍走 HTTP，额度优化不完整。

**缓解措施**：
- 统一使用 `callWorkerApi()` 辅助函数，而非各页面独立实现
- 修改前运行 `grep -r 'getWorkerBaseUrl\|WORKER_URL' src/` 确认所有调用点

### 5.3 本地开发流程变化

**描述**：本地验证 Service Binding 需要两个终端同时运行 Worker 和 Pages，比原来复杂。

**缓解措施**：
- 降级机制保证 `astro dev` 无需改动，仍然正常工作
- Service Binding 验证不是开发必需步骤，可通过部署后验证

### 5.4 Dashboard 配置错误

**描述**：在 Cloudflare Dashboard 的 **Pages 项目 > Settings > Bindings** 中需要手动配置 Service Binding。配置错误会导致 binding 不可用。

**错误类型：**
- 忘记配置：降级为 HTTP（不影响功能）
- 变量名拼错（如 `MCB_CRAWLER` 写成 `MCB_CRAWL`）：降级为 HTTP
- 指向错误的 Worker：可能返回错误响应或超时

**缓解措施**：
- 部署后检查 `callWorkerApi` 日志，确认走了哪条路径
- 配置完成后在 Pages 设置页面复核

### 5.5 请求上下文变化

**描述**：Service Binding 转发请求时，某些请求头会变化：
- `cf-connecting-ip`：可能从用户真实 IP 变为 Pages 的内部 IP
- `cf-ray`：变为 Pages 的 ray ID（不再是 Worker 的）

**影响评估**：Worker 中 `X-Real-User-IP` 和 `cf-connecting-ip` 仅用于 API 调试日志（第 957-977 行），不影响核心功能。调试时 IP 可能显示为内部地址。

### 5.6 版本兼容性

**描述**：Astro 6 / `@astrojs/cloudflare` v13+ 中，环境变量获取方式有变化：
- v12: `Astro.locals.runtime.env`
- v13+: 不再支持 `runtime`，改为从 `cloudflare:workers` 导入

**缓解措施**：
- `callWorkerApi` 已处理多运行时查找链
- 未来升级时，只需修改环境变量导入，不改 `callWorkerApi` 逻辑

---

## 6. 部署指南

### 6.1 前提条件

- `mcb-crawler` Worker 已部署并可访问
- 拥有 Cloudflare Dashboard 管理权限

### 6.2 部署步骤

1. **推送代码改动**：将修改后的代码推送到 Git 仓库

2. **等待 Pages 自动部署**：触发 Pages 构建

3. **配置 Service Binding**（部署完成后）：
   - 进入 Cloudflare Dashboard → Workers & Pages
   - 选择 Pages 项目
   - 进入 **Settings > Bindings**
   - 点击 **Add**，选择 **Service**
   - 配置：
     - **Variable name**: `MCB_CRAWLER`
     - **Service**: `mcb-crawler`
   - 保存

4. **重新部署 Pages**：配置绑定后需触发一次新的部署（re-deploy）以生效

5. **验证**：访问网站页面，检查 Worker 调用是否走了 Service Binding 路径

### 6.3 wrangler-pages.toml

`[[services]]` 配置写入 `wrangler-pages.toml` 后，本地开发使用 `wrangler pages dev` 时可自动生效（前提是本地也在运行目标 Worker）。Dashboard 中的绑定配置**不受 wrangler 文件影响**，需要另外设置。

---

## 7. 本地开发指南

### 7.1 默认开发模式（无需 Service Binding）

```bash
# 正常开发流程，无变化
pnpm dev
```

此时 `callWorkerApi` 使用降级路径（HTTP fetch），行为与现有完全一致。

### 7.2 验证 Service Binding（可选）

需要在本地同时运行 Worker 和 Pages 两个 dev 服务：

```bash
# 终端 1：启动 mcb-crawler Worker
cd path/to/worker
npx wrangler dev

# 终端 2：构建 Pages 并启动，同时传递 Service Binding
pnpm build
npx wrangler pages dev dist --service MCB_CRAWLER=mcb-crawler
```

Pages dev 成功时，输出会显示：
```
- Services:
  - MCB_CRAWLER: mcb-crawler [connected]
  - MCB_CRAWLER: mcb-crawler [connected]
```

---

## 8. 验证方法

### 8.1 生产验证

部署完成后，通过以下方法确认：

1. **Cloudflare Dashboard 访问日志**：检查 mcb-crawler Worker 的请求计数。如果优化生效，API 相关请求数应显著下降（Cron/Queue 请求仍会显示）

2. **Worker 日志检查**：mcb-crawler Worker 的日志中，如果看到请求来自 Pages 的内部请求头（如异常的 `cf-connecting-ip`），表明走了 Service Binding 路径

### 8.2 本地验证

在 `callWorkerApi` 函数中临时加入日志（开发阶段）：

```js
if (binding) {
  console.log('[callWorkerApi] ✓ Using Service Binding')
  ...
} else {
  console.log('[callWorkerApi] ↓ Using HTTP fallback')
  ...
}
```

---

## 9. 附录

### 9.1 相关文档

- [Cloudflare Service Bindings 官方文档](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Pages Functions Bindings 官方文档](https://developers.cloudflare.com/pages/platform/functions/bindings/)

### 9.2 变更文件汇总

| # | 文件 | 操作 | 关键改动 |
|---|------|------|----------|
| 1 | `wrangler-pages.toml` | **写入** | `[[services]]` 声明 |
| 2 | `src/lib/d1-client.js` | **修改** | 添加 `callWorkerApi()`，修改 `getChannels()`、`getPosts()` |
| 3 | `src/pages/posts/[...id].astro` | **修改** | 移除 `getWorkerBaseUrl` import，改用 `callWorkerApi()` |
| 4 | `src/pages/search/[q].astro` | **修改** | 移除 `getWorkerBaseUrl` import，改用 `callWorkerApi()` |
| 5 | `src/lib/env.js` | **不变** | 已支持多运行时查找链，无需改动 |

### 9.3 API 调用路径映射

| SSR 页面 | 调用的 API | `callWorkerApi` 路径 | 来源函数 |
|----------|-----------|---------------------|----------|
| 首页 / 频道页 | `/api/channels` | `/api/channels` | `getChannels()` |
| 首页 / 频道页 | `/api/posts?...` | `/api/posts?...` | `getPosts()` |
| `/posts/[...id]` | `/api/post/:id` | `/api/post/${id}` | 页面内直接调用 |
| `/search/:q` | `/api/posts/search?q=...` | `/api/posts/search?q=...` | 页面内直接调用 |
