# Service Bindings 额度优化设计文档（修正版）

## 1. 问题根因分析

### 1.1 现象

Service Bindings 代码已实现，但** production 环境没有生效**，所有请求仍然走 HTTP 降级路径，消耗 Worker 额度。

### 1.2 根因

**Dashboard 中没有配置 Service Binding**。

关键事实：
1. `wrangler-pages.toml` 中的 `[[services]]` 配置**只在本地开发时生效**（`wrangler pages dev`）
2. **生产环境部署**（Git 连接自动部署 / 手动上传）**不会读取 `wrangler-pages.toml` 的 bindings 配置**
3. 必须在 Cloudflare Dashboard 中**手动配置**Service Binding

### 1.3 代码检查结果

经检查，代码实现**正确**：

**`src/lib/d1-client.js` - `callWorkerApi()` 函数：**
```js
// ✓ 正确：从 Astro.locals.runtime.env 获取 binding
const runtimeEnv = ctx?.locals?.runtime?.env ?? ctx?.locals?.cfContext?.env ?? {}
const binding = runtimeEnv.MCB_CRAWLER ?? null
```

**`env.js` - `getEnv()` 函数：**
```js
// ✓ 正确：支持多运行时环境查找
export function getEnv(env, context, key) {
  return (
    env?.[key] ??
    context?.locals?.runtime?.env?.[key] ??
    context?.locals?.env?.[key] ??
    process.env?.[key] ??
    undefined
  )
}
```

**页面文件：**
- `src/pages/posts/[...id].astro` ✓ 已调用 `callWorkerApi()`
- `src/pages/search/[q].astro` ✓ 已调用 `callWorkerApi()`
- `src/lib/d1-client.js` ✓ `getChannels()` / `getPosts()` 已调用 `callWorkerApi()`

**问题不在代码，在 Dashboard 配置缺失。**

---

## 2. Solution：Dashboard 配置步骤

### 2.1 进入 Dashboard

1. 登录 Cloudflare Dashboard
2. 进入 **Workers & Pages**
3. 选择 Pages 项目

### 2.2 添加 Service Binding

1. 进入 **Settings** → **Bindings**
2. 点击 **Add binding**
3. 选择 **Service**
4. 填写：
   - **Variable name**: `MCB_CRAWLER`（必须与代码中 `runtimeEnv.MCB_CRAWLER` 一致）
   - **Service**: `mcb-crawler`（目标 Worker 的实际名称）
   - **Environment**: `Production`（或同时配置 Preview）
5. 点击 **Save**

### 2.3 重新部署 Pages

配置 Binding 后**不会自动生效**，需要触发重新部署：

**方法 1：手动重试部署**
1. 进入 **Deployments**
2. 找到最新部署
3. 点击 **⋮** → **Retry deployment**

**方法 2：推送新提交**
```bash
git commit --allow-empty -m "chore: trigger redeploy for service binding"
git push
```

### 2.4 验证配置

访问任意页面，然后检查 mcb-crawler Worker 日志：

1. 进入 **Workers & Pages** → **mcb-crawler**
2. 进入 **Logs**
3. 查找最近的 API 请求日志
4. 检查 `source` 字段：
   - `source: "service-binding"` → ✓ 成功（免费）
   - `source: "http"` → ✗ 仍走 HTTP（消耗额度）

---

## 3. 代码检查清单

### 3.1 已实现的功能

| 项目 | 状态 | 说明 |
|------|------|------|
| `callWorkerApi()` 函数 | ✓ 已实现 | 统一 API 调用入口 |
| Service Binding 获取 | ✓ 正确 | `ctx.locals.runtime.env.MCB_CRAWLER` |
| HTTP 降级路径 | ✓ 正确 | `fetch(WORKER_URL + pathname)` |
| 请求来源标识 | ✓ 正确 | `X-Request-Source` header |
| 4 个 API 调用点改造 | ✓ 完成 | 全部改用 `callWorkerApi()` |
| `wrangler-pages.toml` | ✓ 已配置 | 本地开发可用 |
| Worker 端日志增强 | ✓ 已实现 | 输出 `source` 字段 |

### 3.2 本地开发验证

```bash
# 终端 1：启动 Worker
cd path/to/worker
npx wrangler dev

# 终端 2：启动 Pages（自动读取 wrangler-pages.toml）
pnpm build
npx wrangler pages dev dist
```

检查输出应显示：
```
- Services:
  - MCB_CRAWLER: mcb-crawler [connected]
```

---

## 4. 常见问题排查

### 4.1 "source" 仍然显示 "http"

**可能原因：**
1. Dashboard 未配置 Service Binding → 按 2.2 步骤配置
2. Dashboard 配置后未重新部署 → 按 2.3 步骤重试部署
3. Variable name 拼写错误 → 确认是 `MCB_CRAWLER`（全大写）
4. Service 名称错误 → 确认是 `mcb-crawler`（与实际 Worker 名称一致）

### 4.2 Dashboard 找不到目标 Service

**可能原因：**
1. Worker 未部署 → 先部署 `mcb-crawler` Worker
2. Worker 名称不匹配 → 检查 `wrangler.toml` 中的 `name` 字段
3. 环境选择错误 → Production 和 Preview 需分别配置

### 4.3 本地开发报错 "binding.fetch is not a function"

**原因：** `wrangler-pages.toml` 未被读取

**解决方案：**
```bash
# 必须使用 wrangler pages dev 启动
npx wrangler pages dev dist --service MCB_CRAWLER=mcb-crawler
```

或确认 `wrangler-pages.toml` 存在且内容正确：
```toml
[[services]]
binding = "MCB_CRAWLER"
service = "mcb-crawler"
```

---

## 5. 额度监控

配置成功后，在 **Workers Analytics** 中应看到：

**mcb-crawler Worker 请求数下降：**
- Before: API 请求数 = SSR 页面访问量（消耗额度）
- After: API 请求数 ≈ Cron + Queue 触发数（免费）

**Pages 函数执行数不变：**
- SSR 执行仍然消耗 Pages 额度（正常）

---

## 6. Dashboard 配置截图指引

### 6.1 Bindings 页面

路径：**Workers & Pages** → [Pages 项目] → **Settings** → **Bindings**

应看到：
```
Bindings
├── MCB_CRAWLER (Service) → mcb-crawler (Production)
```

### 6.2 日志验证

路径：**Workers & Pages** → **mcb-crawler** → **Logs**

成功日志示例：
```json
{
  "timestamp": "2025-05-27T03:57:46.642926Z",
  "path": "/api/posts",
  "method": "GET",
  "source": "service-binding",
  "realUserIP": "..."
}
```

失败日志示例（仍走 HTTP）：
```json
{
  "timestamp": "2025-05-27T03:57:46.642926Z",
  "path": "/api/posts",
  "method": "GET",
  "source": "http",
  "realUserIP": "..."
}
```

---

## 7. 总结

| 项目 | 状态 | 行动项 |
|------|------|--------|
| 代码实现 | ✓ 完成 | 无需修改 |
| wrangler-pages.toml | ✓ 完成 | 本地开发可用 |
| Dashboard 配置 | ✗ 缺失 | **需手动配置** |
| 验证 | ✗ 未执行 | 配置后检查日志 |

**下一步行动**：
1. 在 Cloudflare Dashboard 配置 Service Binding
2. 重新部署 Pages
3. 检查 Worker 日志确认 `source: "service-binding"`
