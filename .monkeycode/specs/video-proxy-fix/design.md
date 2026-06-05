# 视频播放问题修复技术设计文档

**版本**: 1.0
**创建日期**: 2026-06-05
**状态**: 草案

---

## 1. 设计概述

### 1.1 问题分析

通过代码审查发现，项目存在两套视频代理实现：

1. **Worker 环境下的视频代理**（`workers/cache-worker.js`，1000-1051行）：
   - 完整实现了 Range 请求处理
   - 正确透传 `content-range`、`accept-ranges` 等响应头
   - 添加了 CORS 支持
   - 状态码正确处理（206 Partial Content）

2. **Astro Pages 环境下的视频代理**（`src/pages/static/[...url].js`）：
   - 简单的透传实现
   - **没有处理 Range 请求和响应头**
   - **没有添加 CORS 头**
   - 只是简单传递原始响应

### 1.2 问题根源

当项目部署到 Cloudflare Pages 时，Astro 路由系统会优先匹配 `src/pages/static/[...url].js` 处理 `/static/` 路径。该实现过于简单，无法满足视频播放的需求：

- 视频播放器发送 Range 请求（如 `Range: bytes=0-1023`）时，代理没有正确传递该请求头
- Telegram CDN 返回 206 Partial Content 响应时，`content-range` 响应头没有被正确传递
- 缺少 CORS 支持，导致跨域请求被阻止

### 1.3 设计目标

修复 `src/pages/static/[...url].js`，使其具备完整的功能：
- 正确处理 Range 请求
- 正确透传视频相关的 HTTP 响应头
- 添加 CORS 支持
- 保持与 Worker 实现的一致性

---

## 2. 技术方案

### 2.1 方案对比

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| 方案 A：修复 `src/pages/static/[...url].js` | - Cloudflare Pages 完全支持<br>- 代码简洁 | - 需要维护两套代码 | ✓ 选择 |
| 方案 B：使用 Worker 函数绑定 | - 代码复用<br>- 统一管理 | - 需要额外配置 | 不选择 |
| 方案 C：使用 Edge Middleware | - 灵活性高<br>- 可以预处理请求 | - Cloudflare Pages 不支持 | 不选择 |

**最终选择：方案 A** - 修复 `src/pages/static/[...url].js`

### 2.2 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                 Cloudflare Pages 环境                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  用户请求 /static/cdnX.telegram-cdn.org/file/xxx.mp4         │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │       src/pages/static/[...url].js (修复后)          │   │
│  │                                                       │   │
│  │  1. 解析目标 URL                                      │   │
│  │  2. 验证域名白名单                                    │   │
│  │  3. 透传 Range 请求头                                 │   │
│  │  4. 请求 Telegram CDN                                 │   │
│  │  5. 处理响应头（206、content-range 等）               │   │
│  │  6. 添加 CORS 头                                      │   │
│  │  7. 返回响应                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│              Telegram CDN 返回视频流                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 详细设计

### 3.1 修复 `src/pages/static/[...url].js`

**当前实现**（有问题的版本）：

```javascript
const targetWhitelist = [
  't.me',
  'telegram.org',
  'telegram.me',
  'telegram.dog',
  'cdn-telegram.org',
  'telesco.pe',
  'yandex.ru',
]

export async function GET({ request, params, url }) {
  try {
    const target = new URL(params.url + url.search)
    if (!targetWhitelist.some(domain => target.hostname.endsWith(domain))) {
      return Response.redirect(target.toString(), 302)
    }
    const response = await fetch(target.toString(), request)
    return new Response(response.body, response)
  }
  catch (error) {
    return new Response(error.message, { status: 500 })
  }
}
```

**问题点**：
1. 直接使用 `return new Response(response.body, response)` 会丢失所有响应头
2. 没有处理 Range 请求头
3. 没有添加 CORS 头

**修复后的实现**：

```javascript
const targetWhitelist = [
  'cdn1.telegram.org',
  'cdn2.telegram.org',
  'cdn3.telegram.org',
  'cdn4.telegram.org',
  'cdn5.telegram.org',
  'cdn1.telegram-cdn.org',
  'cdn2.telegram-cdn.org',
  'cdn3.telegram-cdn.org',
  'cdn4.telegram-cdn.org',
  'cdn5.telegram-cdn.org',
  't.me',
  'telegram.org',
  'telegram.me',
  'telegram.dog',
  'cdn-telegram.org',
  'telesco.pe',
  'yandex.ru',
]

export async function GET({ request, params, url }) {
  try {
    const target = new URL(params.url + url.search)

    // 验证域名白名单
    if (!targetWhitelist.some(domain => target.hostname.endsWith(domain))) {
      return Response.redirect(target.toString(), 302)
    }

    // 准备请求头（透传 Range 和 User-Agent）
    const fetchHeaders = new Headers()
    if (request.headers.has('range')) {
      fetchHeaders.set('range', request.headers.get('range'))
    }
    if (request.headers.has('user-agent')) {
      fetchHeaders.set('user-agent', request.headers.get('user-agent'))
    }

    // 请求目标 URL
    const response = await fetch(target.toString(), {
      headers: fetchHeaders
    })

    // 转发响应头
    const responseHeaders = new Headers()

    // 处理 Range 响应（206 Partial Content）
    if (response.status === 206) {
      if (response.headers.has('content-range')) {
        responseHeaders.set('content-range', response.headers.get('content-range'))
      }
      if (response.headers.has('accept-ranges')) {
        responseHeaders.set('accept-ranges', response.headers.get('accept-ranges'))
      }
    }

    // 透传其他重要的响应头
    if (response.headers.has('content-type')) {
      responseHeaders.set('content-type', response.headers.get('content-type'))
    }
    if (response.headers.has('content-length')) {
      responseHeaders.set('content-length', response.headers.get('content-length'))
    }

    // 添加 CORS 支持
    responseHeaders.set('Access-Control-Allow-Origin', '*')
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, User-Agent')

    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: responseHeaders
      })
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    })
  }
  catch (error) {
    console.error('[Static Proxy] Error:', error)
    return new Response(error.message, { status: 500 })
  }
}
```

### 3.2 关键改进点

| 改进点 | 说明 | 影响 |
|--------|------|------|
| 1. 完整的域名白名单 | 添加了所有 Telegram CDN 域名 | 确保视频资源可访问 |
| 2. Range 请求透传 | 透传 `Range` 请求头 | 支持进度条拖动 |
| 3. 206 状态处理 | 处理 `206 Partial Content` 响应 | 支持分片加载 |
| 4. 响应头透传 | 透传 `content-range`、`accept-ranges` 等 | 播放器正确解析 |
| 5. CORS 支持 | 添加 CORS 响应头 | 跨域访问正常 |
| 6. OPTIONS 处理 | 处理预检请求 | 符合 CORS 规范 |
| 7. 错误日志 | 添加 console.error | 便于问题排查 |

### 3.3 Cloudflare Pages 兼容性设计

为确保在 Cloudflare Pages 环境下正常工作，遵循以下原则：

1. **使用标准的 Web API**：
   - `fetch()` - Cloudflare Pages 完全支持
   - `Headers` - 标准的 HTTP 头对象
   - `Response` - 标准的响应对象

2. **避免平台特定 API**：
   - 不使用 Node.js 特有的 API（如 `http`、`https` 模块）
   - 不使用 Cloudflare 特定的 API（保持纯 JavaScript 实现）

3. **遵循 Astro SSR 约定**：
   - 使用 Astro 的端点格式（`GET({ request, params, url })`）
   - 返回标准的 Response 对象
   - Cloudflare Pages 会自动将其转换为 Edge Function

---

## 4. 数据流设计

### 4.1 正常播放流程

```
1. 用户访问帖子页面
   └─> /posts/akile_notice%2F1446
       └─> Astro 路由匹配 src/pages/posts/[...id].astro
           └─> 调用 Worker API 获取帖子数据
               └─> 返回 HTML 内容（包含 <video src="/static/cdnX.../file/xxx.mp4">）
                   └─> 浏览器解析 HTML，加载视频元素

2. 浏览器请求视频资源
   └─> GET /static/cdn4.telegram-cdn.org/file/xxx.mp4
       └─> Cloudflare Pages 路由匹配 src/pages/static/[...url].js
           └─> 解析目标 URL
               └─> 验证域名白名单（cdn4.telegram-cdn.org 通过）
                   └─> 请求 https://cdn4.telegram-cdn.org/file/xxx.mp4
                       └─> Telegram CDN 返回 200 OK + 视频流
                           └─> 透传响应头 + 添加 CORS 头
                               └─> 返回给浏览器
                                   └─> 视频播放器加载并播放
```

### 4.2 Range 请求流程（拖动进度条）

```
1. 用户拖动进度条到 50%
   └─> 浏览器发送 Range 请求
       └─> GET /static/cdn4.telegram-cdn.org/file/xxx.mp4
           └─> Headers: Range: bytes=1024000-2048000
               └─> Cloudflare Pages 路由匹配 src/pages/static/[...url].js
                   └─> 透传 Range 请求头到 Telegram CDN
                       └─> Telegram CDN 返回 206 Partial Content
                           └─> Headers:
                               - Content-Range: bytes 1024000-2048000/total
                               - Accept-Ranges: bytes
                               - Content-Length: 1024000
                               - Content-Type: video/mp4
                               └─> 透传这些响应头 + 添加 CORS 头
                                   └─> 返回给浏览器
                                       └─> 视频播放器从指定位置播放
```

### 4.3 OPTIONS 预检请求流程

```
1. 浏览器发送 OPTIONS 预检请求
   └─> OPTIONS /static/cdn4.telegram-cdn.org/file/xxx.mp4
       └─> Headers:
           - Origin: https://broadcast.yxj.wang
           - Access-Control-Request-Method: GET
           - Access-Control-Request-Headers: Range
               └─> Cloudflare Pages 路由匹配 src/pages/static/[...url].js
                   └─> 返回 204 No Content
                       └─> Headers:
                           - Access-Control-Allow-Origin: *
                           - Access-Control-Allow-Methods: GET, HEAD, OPTIONS
                           - Access-Control-Allow-Headers: Range, User-Agent
                               └─> 浏览器收到预检响应
                                   └─> 继续发送实际的 GET 请求
```

---

## 5. 错误处理设计

### 5.1 错误类型

| 错误类型 | HTTP 状态码 | 处理方式 |
|---------|-------------|---------|
| 域名不在白名单 | 302 | 重定向到原始 URL |
| URL 解析失败 | 400 | 返回错误信息 |
| 网络请求失败 | 502 | 返回错误信息 |
| 目标服务器错误 | 5xx | 透传状态码 |

### 5.2 错误处理实现

```javascript
// 域名验证失败
if (!targetWhitelist.some(domain => target.hostname.endsWith(domain))) {
  return Response.redirect(target.toString(), 302)
}

// URL 解析失败（捕获在 try-catch 中）
catch (error) {
  console.error('[Static Proxy] Error:', error)
  return new Response(error.message, { status: 500 })
}

// 网络请求失败（由 fetch 自动处理）
// fetch 会抛出异常，被 catch 捕获
```

---

## 6. 性能优化

### 6.1 缓存策略

由于这是视频代理，不能在中间层缓存，原因：
- 视频文件通常很大，占用存储空间
- Range 请求无法被有效缓存
- 缓存会导致延迟和不一致

**结论**：不实现缓存，直接透传请求。

### 6.2 连接复用

`fetch()` API 会自动复用 HTTP 连接，无需额外处理。Cloudflare 的边缘网络也会优化连接复用。

### 6.3 响应头优化

只透传必要的响应头，避免传递无关信息：
- `content-type` - 必需，浏览器根据类型渲染
- `content-length` - 必需，计算下载进度
- `content-range` - Range 请求必需
- `accept-ranges` - 表明支持 Range 请求
- `Access-Control-*` - CORS 必需

---

## 7. 安全设计

### 7.1 域名白名单

限制只能代理白名单内的域名，防止开放代理被滥用：

```javascript
const targetWhitelist = [
  // Telegram CDN 域名
  'cdn1.telegram.org',
  'cdn2.telegram.org',
  // ... 其他 CDN 域名
  'cdn1.telegram-cdn.org',
  'cdn2.telegram-cdn.org',
  // ... 其他 CDN 域名
  // Telegram 官方域名
  't.me',
  'telegram.org',
  // ... 其他域名
]
```

### 7.2 请求方法限制

只允许 GET、HEAD、OPTIONS 方法：

```javascript
export async function GET({ request, params, url }) {
  // 只处理 GET 请求
}

// 可以添加 HEAD 方法支持
export async function HEAD({ request, params, url }) {
  // 与 GET 逻辑相同
}

// OPTIONS 请求在 GET 中统一处理
if (request.method === 'OPTIONS') {
  return new Response(null, {
    status: 204,
    headers: responseHeaders
  })
}
```

### 7.3 URL 验证

使用 `new URL()` 解析和验证 URL，防止恶意输入：

```javascript
const target = new URL(params.url + url.search)
```

如果 URL 格式不正确，会抛出异常，被 catch 捕获。

---

## 8. 测试设计

### 8.1 单元测试

测试文件：`src/pages/static/__tests__/[...url].test.js`

```javascript
import { describe, it, expect } from 'vitest'
import { GET } from '../[...url].js'

describe('Static Proxy', () => {
  it('应该正确处理正常的视频请求', async () => {
    const request = new Request('http://localhost/static/cdn4.telegram-cdn.org/file/test.mp4')
    const response = await GET({ request, params: { url: 'cdn4.telegram-cdn.org/file/test.mp4' }, url: new URL(request.url) })
    expect(response.status).toBe(200)
  })

  it('应该正确处理 Range 请求', async () => {
    const request = new Request('http://localhost/static/cdn4.telegram-cdn.org/file/test.mp4', {
      headers: { 'Range': 'bytes=0-1023' }
    })
    const response = await GET({ request, params: { url: 'cdn4.telegram-cdn.org/file/test.mp4' }, url: new URL(request.url) })
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).not.toBeNull()
  })

  it('应该添加 CORS 头', async () => {
    const request = new Request('http://localhost/static/cdn4.telegram-cdn.org/file/test.mp4')
    const response = await GET({ request, params: { url: 'cdn4.telegram-cdn.org/file/test.mp4' }, url: new URL(request.url) })
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('应该拒绝非白名单域名', async () => {
    const request = new Request('http://localhost/static/example.com/file/test.mp4')
    const response = await GET({ request, params: { url: 'example.com/file/test.mp4' }, url: new URL(request.url) })
    expect(response.status).toBe(302)
  })
})
```

### 8.2 集成测试

1. **视频播放测试**：
   - 访问包含视频的帖子页面
   - 验证视频可以正常播放
   - 验证视频可以完整播放到结束

2. **Range 请求测试**：
   - 拖动视频进度条
   - 验证视频可以从指定位置播放
   - 验证进度条响应及时

3. **CORS 测试**：
   - 在不同浏览器中测试
   - 检查浏览器控制台是否有 CORS 错误

4. **Cloudflare Pages 环境测试**：
   - 部署到 Cloudflare Pages
   - 验证视频播放功能正常
   - 验证无平台特定错误

### 8.3 性能测试

使用 `lighthouse` 或 `webpagetest` 进行性能测试：

```bash
lighthouse https://broadcast.yxj.wang/posts/akile_notice%2F1446 --view
```

关注指标：
- First Contentful Paint (FCP)
- Time to Interactive (TTI)
- Cumulative Layout Shift (CLS)
- Cloudflare Analytics 响应时间

---

## 9. 部署设计

### 9.1 部署步骤

1. **修改代码**：
   - 更新 `src/pages/static/[...url].js`
   - 添加测试文件

2. **本地测试**：
   - 运行 `npm run dev` 进行本地测试
   - 验证视频可以正常播放

3. **构建和部署到 Cloudflare Pages**：
   - 运行 `npm run build`
   - 部署到 Cloudflare Pages（通过 Git 或 wrangler）

4. **线上验证**：
   - 访问线上视频页面
   - 验证视频播放功能正常
   - 检查 Cloudflare Analytics

### 9.2 回滚方案

如果出现问题，可以通过 Git 回滚：

```bash
git revert <commit-hash>
git push
```

---

## 10. 监控和日志

### 10.1 日志记录

在代理函数中添加日志：

```javascript
console.log('[Static Proxy] Request:', target.toString())
console.log('[Static Proxy] Status:', response.status)
console.log('[Static Proxy] Range:', request.headers.get('range'))

if (error) {
  console.error('[Static Proxy] Error:', error)
}
```

### 10.2 Cloudflare Analytics 监控

在 Cloudflare Dashboard 中监控以下指标：
- 请求量（Functions 请求）
- 响应时间（Edge Response Time）
- 错误率（4xx/5xx）
- 带宽使用
- 缓存命中率

### 10.3 Cloudflare Logs

使用 Cloudflare Logpush 或实时日志查看：
- 访问日志
- 错误日志
- 性能日志

---

## 11. 未来优化方向

### 11.1 短期优化

1. **添加 HEAD 方法支持**：优化元数据查询
2. **添加缓存控制头**：指导浏览器缓存策略
3. **添加错误重试机制**：提高可靠性

### 11.2 长期优化

1. **使用 R2 存储代理**：减少对 Telegram CDN 的依赖
2. **实现智能缓存**：对小视频文件进行缓存
3. **使用 Cloudflare CDN 加速**：利用 Cloudflare 的全球边缘网络加速视频传输

---

## 12. 附录

### 12.1 参考文档

- [HTTP Range Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests)
- [MDN Web Docs: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Astro Endpoints](https://docs.astro.build/en/guides/endpoints/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Cloudflare Analytics](https://developers.cloudflare.com/analytics/)

### 12.2 相关代码文件

- `src/pages/static/[...url].js` - 待修复的静态资源代理
- `workers/cache-worker.js` (1000-1051行) - Worker 环境下的视频代理（参考实现）
- `src/pages/posts/[...id].astro` - 帖子详情页（调用 Worker API）
- `src/components/list.astro` - 帖子列表组件（渲染视频）