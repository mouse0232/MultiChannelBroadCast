# Service Bindings 额度优化需求文档

## 1. 需求背景

### 1.1 问题陈述

当前项目采用 **Cloudflare Pages (Astro SSR) + Cloudflare Worker (mcb-crawler)** 架构。当用户访问 SSR 页面时，Astro 在服务端通过 HTTP 公网请求调用 mcb-crawler Worker 的 API 端点获取数据。

每次页面渲染产生 **双重额度消耗**：
1. Pages SSR 执行消耗（必须）
2. Pages → Worker API 的 HTTP 请求消耗（可优化，消耗 Worker 的 10 万次/天请求额度）

### 1.2 业务影响

当 SSR 页面访问量较高时，API 调用会迅速消耗 mcb-crawler Worker 的免费额度，导致：
- Cron 定时抓取任务受影响
- Queue 异步消费任务受影响
- 管理 API 接口响应异常

### 1.3 目标

通过引入 Cloudflare Service Bindings，将 Pages 到 Worker 的 HTTP 调用改为内部调用，**消除 API 请求对 Worker 额度的消耗**，同时保持现有 Pages + Worker 架构不变。

## 2. 需求列表

### 2.1 核心需求

| ID | 需求 | 优先级 | EARS 描述 |
|----|------|--------|-----------|
| REQ-1 | Pages 端统一 API 调用入口 | 高 | Pages 端 **必须** 通过统一的 `callWorkerApi()` 函数发起所有 Worker API 调用 |
| REQ-2 | Service Binding 优先调用 | 高 | 当 Service Binding 可用时，`callWorkerApi()` **必须** 使用 `binding.fetch()` 发起请求，而非 HTTP |
| REQ-3 | HTTP 降级兼容 | 高 | 当 Service Binding 不可用时，`callWorkerApi()` **必须** 降级为 HTTP 公网请求，确保现有功能不受影响 |
| REQ-4 | 请求来源标识透传 | 高 | 所有通过 `callWorkerApi()` 发起的请求 **必须** 携带 `X-Request-Source` 请求头，标明调用来源 |
| REQ-5 | Worker 端日志增强 | 高 | Worker API 端点 **必须** 在 debug 日志中输出 `source` 字段，标识请求来源 |

### 2.2 非功能需求

| ID | 需求 | EARS 描述 |
|----|------|-----------|
| NFR-1 | 兼容性 | 改造后 **必须** 保证本地 `astro dev` 正常工作，无需额外配置 |
| NFR-2 | 向后兼容 | 改造后 **必须** 保留 `WORKER_URL` 环境变量，作为降级路径的兜底值 |
| NFR-3 | 配置容错 | 当 Dashboard Service Binding 配置错误时，Page **必须** 自动降级为 HTTP，不报错中断 |

## 3. 约束

| 约束 ID | 描述 |
|---------|------|
| C-1 | 保持 Pages + Worker 架构不变，不合并为单一 Worker |
| C-2 | 改动文件数量不超过 5 个 |
| C-3 | Worker 端不修改任何业务逻辑，仅增加日志字段读取 |

## 4. 验收标准

| AC ID | 对应需求 | 验收方式 |
|-------|----------|----------|
| AC-1 | REQ-2, REQ-3 | Worker 日志中查看 `source` 字段，Service Binding 路径显示 `service-binding`，降级路径显示 `http` |
| AC-2 | REQ-4 | 所有 Pages 发起的请求均携带 `X-Request-Source` 请求头 |
| AC-3 | REQ-5 | Worker 日志中 debug 信息包含 `source` 字段 |
| AC-4 | NFR-1 | `pnpm dev` 启动后，页面正常渲染，不报错 |
| AC-5 | NFR-2, NFR-3 | Dashboard 未配置 Service Binding 时，Pages 降级为 HTTP，功能正常 |
| AC-6 | C-1 | 架构仍为 Pages + Worker 分离部署 |
