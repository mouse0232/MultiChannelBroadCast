# 文档索引

## 快速开始

| 文档 | 说明 |
|------|------|
| [开发者指南](./DEVELOPER_GUIDE.md) | 环境设置、部署、常见问题 |
| [系统架构](./ARCHITECTURE.md) | 架构概览、数据流、数据库设计 |
| [接口定义](./INTERFACES.md) | API 接口、数据类型、环境变量 |

## 前端模块

| 模块 | 路径 | 说明 |
|------|------|------|
| 首页 | `src/pages/index.astro` | 聚合帖子列表 + 频道目录 |
| 频道页 | `src/pages/channel/[channel].astro` | 单频道帖子列表 |
| 帖子详情 | `src/pages/posts/[...id].astro` | 单条帖子展示 |
| 分页（更早） | `src/pages/before/[cursor].astro` | 按 published_at 向前分页 |
| 分页（更新） | `src/pages/after/[cursor].astro` | 按 published_at 向后分页 |
| RSS | `src/pages/rss.xml.js` | RSS 订阅输出 |
| 组件：列表 | `src/components/list.astro` | 帖子列表 + 分页控件 |
| 组件：帖子 | `src/components/item.astro` | 单条帖子（含复制/分享） |
| 组件：头部 | `src/components/header.astro` | 页面头部（标题/图标/RSS） |
| 布局 | `src/layouts/base.astro` | 基础布局（SEO/侧栏/移动端） |
| API 客户端 | `src/lib/d1-client.js` | 请求 Worker API 的客户端 |

## 后端模块

| 模块 | 路径 | 说明 |
|------|------|------|
| Worker 入口 | `workers/cache-worker.js` | 抓取/队列/API/推送 |

## 配置文件

| 文件 | 说明 |
|------|------|
| `wrangler.toml` | Cloudflare Workers/D1/Queue 配置 |
| `astro.config.mjs` | Astro 构建配置 |
| `package.json` | 项目依赖和脚本 |
| `.env.example` | 环境变量模板 |

## 核心概念

| 概念 | 说明 |
|------|------|
| D1 数据库 | Cloudflare 边缘 SQLite，存储帖子和频道元数据 |
| Queue 队列 | Cloudflare Queues，异步处理抓取任务 |
| Cron 触发器 | Cloudflare Cron，定时触发抓取任务 |
| Worker API | 为前端提供帖子/频道数据的 REST API |
| 媒体代理 | wsrv.nl（图片）和 /static/（视频/音频） |
| 游标分页 | 基于 published_at 的游标分页，避免 OFFSET 问题 |
