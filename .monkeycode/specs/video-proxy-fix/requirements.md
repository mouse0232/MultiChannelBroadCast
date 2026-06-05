# 视频播放问题修复需求文档

**版本**: 1.0
**创建日期**: 2026-06-05
**状态**: 待评审

---

## 1. 需求概述

### 1.1 问题描述

在 Multi-Channel Broadcast 项目中，从 Telegram 抓取的帖子中包含的视频无法正常播放。

**问题现象**：
- 原始 Telegram 链接：https://t.me/s/akile_notice/1446 - 视频可以正常播放
- 抓取后链接：https://broadcast.yxj.wang/posts/akile_notice%2F1446 - 视频无法播放

### 1.2 影响范围

- 所有包含视频内容的帖子
- 视频无法播放或无法拖动进度条
- 用户体验严重受损

---

## 2. 功能需求

### 2.1 需求 1：视频必须能够正常播放

**需求 ID**: REQ-1
**优先级**: P0 - 最高

**需求描述**：系统必须支持视频的正常播放功能，确保从 Telegram 抓取的视频内容能够在网站中正常播放。

**验收标准**：
- 视频可以开始播放
- 视频可以完整播放到结束
- 视频播放无卡顿或异常中断

### 2.2 需求 2：支持视频进度条拖动（Range 请求）

**需求 ID**: REQ-2
**优先级**: P0 - 最高

**需求描述**：系统必须支持视频的 Range 请求，允许用户拖动视频进度条，并快速定位到视频的任意位置播放。

**验收标准**：
- 用户可以拖动视频进度条到任意位置
- 视频可以从指定位置开始播放
- 进度条响应及时，无延迟

### 2.3 需求 3：跨域访问支持（CORS）

**需求 ID**: REQ-3
**优先级**: P0 - 最高

**需求描述**：视频代理必须支持跨域访问，确保浏览器能够正常加载视频资源。

**验收标准**：
- 视频资源响应包含 `Access-Control-Allow-Origin: *` 头
- 浏览器控制台无 CORS 相关错误

### 2.4 需求 4：兼容 Cloudflare Pages

**需求 ID**: REQ-4
**优先级**: P1 - 高

**需求描述**：视频代理功能必须在 Cloudflare Pages 环境下正常工作。

**验收标准**：
- 在 Cloudflare Pages 环境下视频可播放
- 在 Cloudflare Pages 环境下支持 Range 请求
- 在 Cloudflare Pages 环境下 CORS 配置正确

---

## 3. 非功能需求

### 3.1 性能需求

**需求 ID**: NFR-1
**优先级**: P1 - 高

**需求描述**：视频代理响应时间应在合理范围内，不影响视频播放体验。

**验收标准**：
- 首次视频请求响应时间 < 1 秒
- Range 请求响应时间 < 500ms

### 3.2 可靠性需求

**需求 ID**: NFR-2
**优先级**: P1 - 高

**需求描述**：视频代理必须稳定可靠，不会因网络波动导致视频无法播放。

**验收标准**：
- 代理成功率 > 99%
- 代理失败时有适当的错误提示

### 3.3 安全性需求

**需求 ID**: NFR-3
**优先级**: P1 - 高

**需求描述**：视频代理必须防止滥用，只允许代理白名单内的域名资源。

**验收标准**：
- 实现域名白名单验证
- 拒绝非白名单域名的请求

---

## 4. 约束条件

### 4.1 技术约束

- 必须兼容 Astro SSR 模式
- 必须兼容 Cloudflare Pages 运行时环境
- 不能使用 Node.js 特有的 API

### 4.2 业务约束

- 不能修改现有的 Worker 视频代理逻辑
- 必须与现有架构保持一致
- 必须保持向后兼容性

---

## 5. 需求优先级

| 需求 ID | 描述 | 优先级 | 状态 |
|---------|------|--------|------|
| REQ-1 | 视频正常播放 | P0 | 待实现 |
| REQ-2 | 支持 Range 请求 | P0 | 待实现 |
| REQ-3 | CORS 支持 | P0 | 待实现 |
| REQ-4 | Cloudflare Pages 兼容 | P1 | 待实现 |
| NFR-1 | 性能需求 | P1 | 待验证 |
| NFR-2 | 可靠性需求 | P1 | 待验证 |
| NFR-3 | 安全性需求 | P1 | 待实现 |

---

## 6. 依赖关系

- 依赖现有的 `workers/cache-worker.js` 视频代理实现作为参考
- 依赖 Cloudflare Pages 运行时环境
- 依赖 Astro SSR 模式

---

## 7. 验收测试计划

### 7.1 功能测试

1. 播放包含视频的帖子
2. 拖动视频进度条
3. 检查浏览器开发者工具的网络请求
4. 验证响应头是否正确

### 7.2 兼容性测试

1. 在 Cloudflare Pages 环境测试
2. 在不同浏览器中测试（Chrome、Firefox、Safari）
3. 在不同设备中测试（桌面、移动）

### 7.3 性能测试

1. 测量视频首次加载时间
2. 测量 Range 请求响应时间
3. 测试大视频文件的播放性能

---

## 8. 风险与挑战

### 8.1 技术风险

- Astro Pages 路由可能优先于 Worker 路由
- Range 请求在 Cloudflare Pages 环境可能存在兼容性问题
- CORS 配置可能需要特殊处理

### 8.2 缓解措施

- 通过充分测试验证 Cloudflare Pages 行为
- 查阅 Cloudflare Pages 文档确认支持情况
- 提供备选方案（如使用 Worker 函数绑定）

---

## 9. 附录

### 9.1 问题分析摘要

通过代码分析发现：

1. **Worker 环境下的视频代理**（`workers/cache-worker.js`）：
   - 正确处理了 Range 请求
   - 正确透传了 `content-range`、`accept-ranges` 等响应头
   - 添加了 CORS 支持
   - 状态码正确处理（206 Partial Content）

2. **Astro Pages 环境下的视频代理**（`src/pages/static/[...url].js`）：
   - 简单的透传实现：`return new Response(response.body, response)`
   - **没有特别处理 Range 请求和响应头**
   - 只是简单地传递原始响应

3. **问题根源**：
   - 当项目部署到 Cloudflare Pages 时，Astro 路由优先匹配 `src/pages/static/[...url].js`
   - 该实现过于简单，没有正确处理视频播放所需的 HTTP 头
   - 导致视频播放器无法正确请求视频的特定字节范围

### 9.2 参考资料

- Cloudflare Pages 文档：https://developers.cloudflare.com/pages/
- Astro SSR 文档：https://docs.astro.build/en/guides/server-side-rendering/
- HTTP Range 请求规范：https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests