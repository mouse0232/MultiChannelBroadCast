简体中文|[English](./README.md)
# Multi-Channel Broadcast

**将多个 Telegram 频道聚合为一个微博客** - inspired by [BroadcastChannel](https://github.com/ccbikai/BroadcastChannel).

## 架构

本项目采用**前后端分离架构**：

- **前端**：Astro SSR（Server Output），部署在 Cloudflare Pages / Vercel / Netlify
- **后端**：Cloudflare Worker + D1 数据库，异步抓取内容
- **缓存**：D1 持久化存储 + Cloudflare Cache API（可选）
- **队列**：Cloudflare Queues，并行处理频道抓取

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Astro SSR  │────>│  Cloudflare      │────>│  D1 数据库       │
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
- 关键词过滤采集（支持正则表达式、黑白名单模式）
- 全文搜索
- RSS 订阅
- 移动端响应式设计
- Telegram 评论集成

## 技术栈

- **前端**：[Astro](https://astro.build/) v4.15+ (SSR / Server Output)
- **后端**：Cloudflare Workers
- **数据库**：Cloudflare D1 (SQLite)
- **队列**：Cloudflare Queues
- **缓存**：Cloudflare Cache API（可选）
- **解析器**：Cheerio
- **图片代理**：wsrv.nl / R2（可选）
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
- `FILTER_ENABLED` - 设为 `true` 启用关键词过滤（可选）

### 2. 部署 Pages（前端）

将 GitHub 仓库连接到 Cloudflare Pages：
- **构建命令**：`pnpm build`
- **输出目录**：`dist`

设置环境变量：
- `WORKER_URL` - 你的 Worker 地址（如 `https://your-worker.workers.dev`）
- `SITE_NAME` - 站点名称
- `CHANNELS` - 与 Worker 配置一致

访问你的站点地址查看效果。

### 3. Docker 部署（可选）

```bash
# 构建 Docker 镜像
docker build -t multi-channel-broadcast .

# 使用 docker-compose 运行
docker-compose up -d
```

在 `.env` 或 `docker-compose.yml` 中配置环境变量。

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

### 使用 Docker 本地开发

```bash
# 构建并运行
docker-compose up --build

# 后台运行
docker-compose up -d
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
| `SERVER_ADAPTER` | Pages | 适配器类型（vercel/cloudflare_pages/netlify/node） |

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
| `FILTER_ENABLED` | Worker | 设为 `true` 启用关键词过滤 |
| `COMMENTS` | Pages | 启用 Telegram 评论 |
| `GOOGLE_SEARCH_SITE` | Pages | Google 搜索站点 |
| `HEADER_INJECT` | Pages | 头部 HTML 注入 |
| `FOOTER_INJECT` | Pages | 尾部 HTML 注入 |
| `NAVS` | Pages | 自定义导航链接 |
| `RSS_PREFIX` | Pages | RSS URL 前缀 |
| `RSS_URL` | Pages | 完整 RSS 地址 |
| `TAGS` | Pages | 启用标签功能 |
| `LINKS` | Pages | 启用链接功能 |
| `TELEGRAM` | Pages | Telegram 用户名链接 |
| `TWITTER` | Pages | Twitter 用户名链接 |
| `GITHUB` | Pages | GitHub 用户名链接 |

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

### 图片代理

| 方式 | URL 格式 | 说明 |
|------|---------|------|
| wsrv.nl CDN | `https://wsrv.nl/?url={编码后 URL}` | 默认，带 CDN 缓存 |
| R2 存储 | `/r2/{key}` | 可选，持久化存储 |

### 视频/音频代理

| 方式 | URL 格式 | 说明 |
|------|---------|------|
| Worker 代理 | `/static/{host}/{path}` | 支持 Range 请求 |

**说明**：图片代理推荐使用 wsrv.nl，提供免费 CDN 和缓存。R2 可用于更好的控制和合规性。

## 分页策略

基于 `published_at` 的游标分页：

- **首页**：`ORDER BY published_at DESC LIMIT 20`
- **更早**：`published_at < {cursor}`
- **更新**：`published_at > {cursor}`

## 关键词过滤

### 启用过滤

1. 编辑 `filter-rules.json` 配置文件
2. 设置环境变量 `FILTER_ENABLED=true`
3. 重新部署 Worker

### 配置格式

```json
{
  "global": {
    "mode": "blacklist",
    "rules": [
      {
        "id": "1",
        "pattern": "垃圾广告",
        "ruleType": "keyword",
        "isActive": true,
        "description": "过滤垃圾广告"
      },
      {
        "id": "2",
        "pattern": "spam|advertisement",
        "ruleType": "regex",
        "isActive": true,
        "description": "过滤英文广告"
      }
    ]
  },
  "channels": {
    "channel1": {
      "mode": "blacklist",
      "inheritGlobal": true,
      "rules": []
    }
  }
}
```

### 过滤模式

| 模式 | 说明 |
|------|------|
| `blacklist` | 黑名单：匹配到的帖子被拦截 |
| `whitelist` | 白名单：仅匹配到的帖子被采集 |

### 规则类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `keyword` | 关键词匹配（不区分大小写） | `广告` |
| `regex` | 正则表达式匹配 | `spam\|advertisement` |

### 渠道继承

- 未配置规则的渠道自动继承全局规则
- 设置 `inheritGlobal: false` 可关闭继承
- 渠道特有规则与继承规则合并后统一匹配

### 容错处理

- JSON 格式错误不会导致 Worker 崩溃
- 配置文件加载失败时降级为"不过滤"模式
- 无效正则表达式会被跳过并记录日志

## 常见问题

### 为什么用 D1 而不是内存缓存？

D1 提供持久化存储，内容在服务重启后不会丢失，且所有边缘节点共享同一数据库。这消除了 LRU 缓存的需求，并提供一致的性能。

### 内容多久更新一次？

默认情况下，Cloudflare Cron 每 5 分钟触发一次。你可以在 `wrangler.toml` 中调整 cron 调度。

### 帖子中看不到图片？

旧帖子可能是在图片抓取功能添加之前抓取的。访问 `/api/regrab` 重新抓取并更新已有帖子。

### 首页只显示一个频道的内容？

检查：
1. Worker 环境变量 `CHANNELS` 是否正确配置了多个频道
2. 前端 `WORKER_URL` 是否指向正确的 Worker 地址
3. D1 数据库中是否确实有多个频道的数据

### 分页链接 404？

确保：
1. `before/[cursor].astro` 和 `after/[cursor].astro` 存在
2. 分页 cursor 使用 `encodeURIComponent()` 编码
3. 分页使用 `published_at` 字段而非 `id`（避免斜杠问题）

### 视频无法播放或无法拖动进度条？

检查：
1. `/static/` 路由是否在 Worker 中正确处理
2. Range 请求头是否正确透传
3. Content-Range 响应头是否正确返回

### 如何禁用推送？

设置 `TELEGRAM_PUSH_ENABLED=false` 或删除该环境变量。

### Cron 没有触发抓取？

检查：
1. Cron 触发器是否在 `wrangler.toml` 中正确配置
2. Worker 是否已部署
3. Queue 是否正确绑定
4. 查看 Worker 日志：`wrangler tail`

### 图片加载失败？

检查：
1. wsrv.nl 服务是否可访问
2. 图片 URL 是否正确编码
3. Telegram CDN 是否返回了正确的图片

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
