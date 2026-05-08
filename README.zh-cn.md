简体中文|[English](./README.md)
# Multi-Channel Broadcast

**将多个 Telegram 频道聚合为一个微博客** - inspired by [BroadcastChannel](https://github.com/ccbikai/BroadcastChannel).

## 架构

本项目采用**前后端分离架构**：

- **前端**：Astro 静态站点生成，部署在 Cloudflare Pages
- **后端**：Cloudflare Worker + D1 数据库，异步抓取内容
- **缓存**：D1 持久化存储（无需内存缓存）
- **队列**：Cloudflare Queues，并行处理频道抓取

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Astro 页面  │────>│  Cloudflare      │────>│  D1 数据库       │
│  (前端)     │     │  Worker (API)    │     │  (SQLite)        │
└─────────────┘     └──────────────────┘     └──────────────────┘
                           │
                           │ Cron + Queue
                           ▼
                    ┌──────────────────┐
                    │  Telegram 抓取器  │
                    │  (异步/并行)     │
                    └──────────────────┘
```

## 特性

- 多频道聚合 + 分页浏览
- 异步内容抓取（Cron + Queue）
- 丰富的媒体支持（图片 wsrv.nl 代理，视频/音频 Worker 代理）
- Telegram 推送通知（支持图文）
- 防风控（UA 池、Host 轮询、随机延迟）
- 全文搜索
- RSS 订阅
- 移动端响应式设计
- Telegram 评论集成

## 技术栈

- **前端**：[Astro](https://astro.build/) v4.15+
- **后端**：Cloudflare Workers
- **数据库**：Cloudflare D1 (SQLite)
- **队列**：Cloudflare Queues
- **解析器**：Cheerio
- **图片代理**：wsrv.nl
- **视频代理**：Worker 本地代理（支持 Range）

## 快速开始

### 1. 部署 Worker（后端）

```bash
# 克隆项目
git clone https://github.com/mouse0232/MultiChannelBroadCast.git
cd MultiChannelBroadCast

# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 创建 D1 数据库
wrangler d1 create multi-channel-db

# 更新 wrangler.toml 中的 database_id

# 部署 Worker
wrangler deploy
```

在 Cloudflare Dashboard 设置环境变量：
- `CHANNELS` - 逗号分隔的频道列表（必需）
- `TELEGRAM_BOT_TOKEN` - 用于推送通知
- `TELEGRAM_PUSH_CHANNEL_ID` - 推送目标频道
- `TELEGRAM_PUSH_ENABLED` - 设为 `true` 启用推送

### 2. 部署 Pages（前端）

将 GitHub 仓库连接到 Cloudflare Pages：
- **构建命令**：`pnpm build`
- **输出目录**：`dist`

设置环境变量：
- `WORKER_URL` - 你的 Worker 地址（如 `https://your-worker.workers.dev`）
- `SITE_NAME` - 站点名称
- `CHANNELS` - 与 Worker 配置一致

访问你的站点地址查看效果。

### 本地开发

```bash
# 安装依赖
pnpm install

# 复制环境变量文件
cp .env.example .env

# 编辑 .env 文件（设置 WORKER_URL 和 CHANNELS）

# 启动开发服务器
pnpm dev
```

访问 `http://localhost:4321` 查看效果。

## 配置说明

### 核心配置

| 变量 | 平台 | 说明 |
|------|------|------|
| `CHANNELS` | Worker | 逗号分隔的频道列表（必需） |
| `WORKER_URL` | Pages | Worker API 地址 |
| `SITE_NAME` | Pages | 站点名称 |
| `SITE_AVATAR` | Pages | 站点头像 URL |
| `LOCALE` | Pages | 语言代码（默认 zh-cn） |
| `TIMEZONE` | Pages | 时区（默认 Asia/Shanghai） |

### 推送通知

| 变量 | 平台 | 说明 |
|------|------|------|
| `TELEGRAM_PUSH_ENABLED` | Worker | 设为 `true` 启用 |
| `TELEGRAM_BOT_TOKEN` | Worker | 通过 @BotFather 获取 |
| `TELEGRAM_PUSH_CHANNEL_ID` | Worker | 目标频道（@名称 或 -100xxx） |

### 高级配置

| 变量 | 平台 | 说明 |
|------|------|------|
| `TELEGRAM_HOST` | Worker | Telegram 主机（支持轮询） |
| `COMMENTS` | Pages | 启用 Telegram 评论 |
| `GOOGLE_SEARCH_SITE` | Pages | Google 搜索站点 |
| `HEADER_INJECT` | Pages | 头部 HTML 注入 |
| `FOOTER_INJECT` | Pages | 尾部 HTML 注入 |
| `NAVS` | Pages | 自定义导航链接 |

## Worker API

| 端点 | 说明 |
|------|------|
| `GET /api/posts` | 获取帖子列表（支持分页） |
| `GET /api/posts/search` | 搜索帖子 |
| `GET /api/post/{id}` | 获取单个帖子 |
| `GET /api/channels` | 获取频道列表 |
| `GET /api/init` | 初始化并全量抓取 |
| `GET /api/regrab` | 重新抓取并更新旧帖子 |
| `GET /static/*` | 视频/音频代理 |

## 媒体代理

| 类型 | 方式 | URL 格式 |
|------|------|---------|
| 图片 | wsrv.nl CDN | `https://wsrv.nl/?url={编码后URL}` |
| 视频/音频 | Worker 代理 | `/static/{host}/{path}` |

## 分页策略

基于 `published_at` 的游标分页：

- **首页**：`ORDER BY published_at DESC LIMIT 20`
- **更早**：`published_at < {cursor}`
- **更新**：`published_at > {cursor}`

## 常见问题

### 为什么用 D1 而不是内存缓存？

D1 提供持久化存储，内容在服务重启后不会丢失，且所有边缘节点共享同一数据库。这消除了 LRU 缓存的需求，并提供一致的性能。

### 内容多久更新一次？

默认情况下，Cloudflare Cron 每 5 分钟触发一次。你可以在 `wrangler.toml` 中调整 cron 调度。

### 帖子中看不到图片？

旧帖子可能是在图片抓取功能添加之前抓取的。访问 `/api/regrab` 重新抓取并更新已有帖子。

## 项目文档

详细文档位于 `.monkeycode/docs/` 目录：
- [系统架构](./.monkeycode/docs/ARCHITECTURE.md)
- [接口定义](./.monkeycode/docs/INTERFACES.md)
- [开发者指南](./.monkeycode/docs/DEVELOPER_GUIDE.md)

## 贡献

欢迎提交 Issue 和 Pull Request!

## 许可证

MIT

## 感谢

[BroadcastChannel](https://github.com/ccbikai/BroadcastChannel)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=mouse0232/MultiChannelBroadCast&type=date&legend=top-left)](https://www.star-history.com/#mouse0232/MultiChannelBroadCast&type=date&legend=top-left)
