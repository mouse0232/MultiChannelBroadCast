# SSR 错误日志上报设计文档

## 1. 背景

### 1.1 问题描述

当前项目 SSR 渲染错误只输出到 **Cloudflare Pages Logs**，存在以下问题：

1. **日志分散**：Pages Logs 按部署实例分开，难以集中查看
2. **保留期短**：Pages Logs 保留期限有限，不利于回溯排查
3. **调试困难**：生产环境错误无法关联业务上下文（频道、帖子 ID 等）

### 1.2 现状

| 日志类型 | 存储位置 | 优点 | 缺点 |
|----------|----------|------|------|
| Worker API 日志 | mcb-crawler Worker Logs | 集中存储、保留期长、可关联业务数据 | 只记录 API 请求，无 SSR 渲染错误 |
| Pages SSR 日志 | Pages Logs | 自动收集 | 分散、保留期短、难以关联业务 |

### 1.3 目标

将 SSR 渲染错误统一上报到 **mcb-crawler Worker Logs**，实现：
- 日志集中存储
- 错误与业务数据关联
- 便于生产环境调试

---

## 2. 方案设计

### 2.1 核心思路

**Middleware 全局捕获 + Service Binding 上报 Worker**

```
用户请求
    ↓
Pages Middleware
    ├── try: await next() → 正常渲染
    └── catch: 捕获错误
              ↓
         格式化错误信息
              ↓
         env.MCB_CRAWLER.fetch('/api/error-report')
              ↓
Worker /api/error-report
    ↓
console.error('SSR Error:', error) → 记录到 Worker Logs
```

### 2.2 技术选择

| 选项 | 方案 | 选择理由 |
|------|------|----------|
| 捕获位置 | Middleware vs 各页面 | Middleware 全局捕获，代码集中 |
| 上报方式 | Service Binding vs HTTP | Service Binding 免费、内部调用 |
| 日志端点 | 复用现有 vs 新增 | 新增 `/api/error-report`，职责单一 |

---

## 3. 详细设计

### 3.1 改动文件清单

| 文件 | 改动内容 | 预估行数 |
|------|----------|----------|
| `src/middleware.js` | 顶层 try-catch + 错误上报逻辑 | +30 行 |
| `workers/cache-worker.js` | 新增 `/api/error-report` 端点处理 | +10 行 |
| `src/lib/error-logger.js` | 工具函数（错误格式化、限频） | +40 行 |

### 3.2 Middleware 错误捕获

```javascript
// src/middleware.js
export async function onRequest(context, next) {
  try {
    return await next()
  } catch (error) {
    // 静默上报，失败不影响主流程
    reportError(context, error).catch(() => {})
    throw error  // 继续抛出，保留错误页面
  }
}
```

### 3.3 错误上报函数

```javascript
// src/lib/error-logger.js
export async function reportError(context, error) {
  // 1. 限频：相同错误 1 分钟只上报 1 次
  const key = `error:${context.url.pathname}:${error.message}`
  if (await isDuplicate(key)) return
  
  // 2. 格式化错误信息
  const payload = {
    type: 'ssr_error',
    page: context.url.pathname,
    error: {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || ''
    },
    request: {
      ip: context.request.headers.get('cf-connecting-ip'),
      userAgent: context.request.headers.get('user-agent'),
      cfRay: context.request.headers.get('cf-ray')
    },
    timestamp: new Date().toISOString()
  }
  
  // 3. 通过 Service Binding 上报
  await context.env.MCB_CRAWLER.fetch('/api/error-report', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}
```

### 3.4 Worker 端日志端点

```javascript
// workers/cache-worker.js
if (url.pathname === '/api/error-report' && request.method === 'POST') {
  const { type, page, error, request, timestamp } = await request.json()
  
  console.error('SSR Error:', {
    type,
    page,
    error,
    request: { ip: request.ip },
    timestamp
  })
  
  return new Response('OK')
}
```

---

## 4. 风险评估与缓解

### 4.1 风险清单

| 风险 | 等级 | 说明 | 缓解措施 |
|------|------|------|----------|
| **日志爆炸** | 中 | 热门页面持续报错产生大量日志 | 错误去重 + 限频（1 分钟/页面） |
| **Service Binding 失效** | 中 | Binding 配置丢失则上报失败 | 静默降级，失败不报错 |
| **性能影响** | 低 | await 上报增加响应时间 | 异步上报，不阻塞响应 |
| **错误被吞掉** | 低 | try-catch 可能影响本地调试 | 开发环境关闭上报 |

### 4.2 不存在的风险（已排除）

| ~~风险~~ | 排除理由 |
|------|----------|
| ~~敏感信息泄露~~ | Error 对象只有 name/message/stack，无敏感数据 |
| ~~循环错误~~ | 上报逻辑不触发 SSR 渲染，不会循环 |
| ~~API_SECRET_KEY 泄露~~ | Error 不会自动带上环境变量 |

### 4.3 必须实现的缓解措施

**上线前必须完成**：
1. ✅ 错误去重限频（避免日志爆炸）
2. ✅ 上报失败静默降级（Service Binding 失效时不报错）

**可选实现**（可迭代）：
- ⚪ 开发环境关闭上报（方便调试）
- ⚪ 异步上报不阻塞响应（`void` 或 `waitUntil`）

---

## 5. 实现细节

### 5.1 错误去重限频

使用 KV 存储记录上次上报时间：

```javascript
// src/lib/error-logger.js
const ERROR_COOLDOWN_MS = 60 * 1000  // 1 分钟

async function isDuplicate(key) {
  const lastReported = await ERROR_KV.get(key)
  if (lastReported && Date.now() - parseInt(lastReported) < ERROR_COOLDOWN_MS) {
    return true  // 重复，跳过上报
  }
  await ERROR_KV.put(key, Date.now().toString())
  return false
}
```

### 5.2 环境判断

```javascript
// 开发环境关闭上报
const isDev = !context.env.SITE_NAME || context.env.DEBUG === 'true'
if (isDev) {
  console.error('Dev mode: skipping error report')
  return
}
```

### 5.3 异步上报

```javascript
// 方式 1：void 不等待
void reportError(context, error)

// 方式 2：waitUntil（如果支持）
context.waitUntil(reportError(context, error))
```

---

## 6. 验收标准

### 6.1 功能验收

| 测试场景 | 预期结果 |
|----------|----------|
| 访问不存在的帖子 ID（404） | Worker Logs 看到错误日志 |
| 访问触发渲染错误的页面 | Worker Logs 看到完整堆栈 |
| 相同错误 1 分钟内多次触发 | 只上报 1 次 |
| Service Binding 未配置 | 主流程正常，上报静默失败 |

### 6.2 日志格式验收

Worker Logs 中应包含：
- ✅ 错误类型：`ssr_error`
- ✅ 页面路径：`/posts/yunyoocc/12345`
- ✅ 错误信息：`name`, `message`, `stack`
- ✅ 请求信息：`ip`, `userAgent`, `cfRay`
- ✅ 时间戳：ISO 8601 格式

### 6.3 性能验收

- 正常请求响应时间无明显增加（< 10ms）
- 错误页面响应时间无明显增加

---

## 7. 部署步骤

### 7.1 代码部署

1. 提交代码改动
2. 等待 Pages 自动部署
3. 等待 Worker 自动部署（如使用 Git 连接）

### 7.2 环境配置

1. 确认 Pages 已配置 Service Binding `MCB_CRAWLER`
2. 确认 Worker 已配置 KV 命名空间（用于限频）
3. 验证 Binding 和 KV 在 Production 和 Preview 环境都已配置

### 7.3 验证测试

1. 访问测试页面（如 `/posts/xxx/99999`）
2. 检查 Worker Logs 是否看到错误日志
3. 验证限频生效（1 分钟内多次访问只记录 1 次）

---

## 8. 附录

### 8.1 错误日志格式示例

```json
{
  "type": "ssr_error",
  "page": "/posts/yunyoocc/12345",
  "error": {
    "name": "TypeError",
    "message": "Cannot read property 'channels' of undefined",
    "stack": "TypeError: Cannot read property 'channels' of undefined\n    at getChannels (file:///opt/buildhome/repo/src/lib/d1-client.js:25:14)\n    at AsyncPagesFunction (file:///opt/buildhome/repo/src/pages/posts/[...id].astro:15:10)"
  },
  "request": {
    "ip": "95.40.102.125",
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "cfRay": "7d0f1a2b3c4d5e6f-SJC"
  },
  "timestamp": "2026-05-28T00:00:00.000Z"
}
```

### 8.2 相关文件

- `src/middleware.js` - Middleware 错误捕获
- `src/lib/error-logger.js` - 错误上报工具函数
- `workers/cache-worker.js` - Worker 端日志端点

### 8.3 参考文档

- [Cloudflare Pages Middleware](https://developers.cloudflare.com/pages/functions/middleware/)
- [Cloudflare Service Bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- [Cloudflare Workers Logging](https://developers.cloudflare.com/workers/observability/logs/)
