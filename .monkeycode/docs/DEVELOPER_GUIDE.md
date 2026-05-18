# 开发者指南

## 开发环境设置

### 前提条件

- Node.js >= 20.0.0
- pnpm >= 9.9.0
- Wrangler CLI（用于本地测试 Worker）
- Docker（可选，用于本地一体化开发）

### 前端开发

```bash
# 克隆仓库
git clone https://github.com/mouse0232/MultiChannelBroadCast.git
cd MultiChannelBroadCast

# 安装依赖
pnpm install

# 复制环境变量文件
cp .env.example .env

# 编辑 .env 文件，至少配置：
# WORKER_URL=https://your-worker.workers.dev
# CHANNELS=channel1,channel2

# 启动开发服务器
pnpm dev
```

访问 `http://localhost:4321` 查看效果。

### Worker 开发

```bash
# 安装 Wrangler
npm install -g wrangler

# 本地运行 Worker
wrangler dev

# 部署 Worker
wrangler deploy
```

### Docker 开发（一体化）

```bash
# 构建并运行
docker-compose up --build

# 后台运行
docker-compose up -d

# 查看日志
docker-compose logs -f
```

访问 `http://localhost:4321` 查看效果。

## 项目结构

```
├── src/                        # 前端源代码
│   ├── lib/                    # 工具库
│   │   ├── d1-client.js        # D1 API 客户端（请求 Worker）
│   │   ├── telegram/           # Telegram 推送模块（已废弃，推送已移至 Worker）
│   │   ├── env.js              # 环境变量辅助
│   │   ├── dayjs.js            # Day.js 配置
│   │   └── prism.js            # 代码高亮配置
│   ├── pages/                  # 页面路由
│   │   ├── index.astro         # 首页（聚合帖子 + 频道目录）
│   │   ├── posts/[...id].astro # 帖子详情页
│   │   ├── channel/[channel].astro  # 频道页
│   │   ├── before/[cursor].astro    # 更早分页
│   │   ├── after/[cursor].astro     # 更新分页
│   │   └── rss.xml.js          # RSS 订阅
│   ├── components/             # UI 组件
│   │   ├── header.astro        # 页面头部
│   │   ├── list.astro          # 帖子列表（含分页）
│   │   └── item.astro          # 单条帖子（含复制/分享功能）
│   ├── layouts/                # 页面布局
│   │   └── base.astro          # 基础布局（含 SEO/侧栏/移动端菜单）
│   └── assets/                 # 静态资源
├── workers/                    # Worker 后端
│   └── cache-worker.js         # Worker 入口（抓取/队列/API/推送）
├── wrangler.toml               # Cloudflare 配置
├── astro.config.mjs            # Astro 配置（SSR / 多平台适配）
├── docker-compose.yml          # Docker 编排配置
├── Dockerfile                  # Docker 镜像构建
└── package.json                # 项目依赖
```

## 核心工作流

### 1. 添加新频道

在 Cloudflare Worker 环境变量中修改 `CHANNELS`：

```env
CHANNELS=channel1,channel2,new_channel
```

部署 Worker 后，Cron 会自动开始抓取新频道。

### 2. 修改抓取逻辑

编辑 `workers/cache-worker.js`：

- `fetchAndParse()`：修改 HTTP 请求逻辑
- `parsePosts()`：修改 HTML 解析和媒体提取
- `processMediaUrls()`：修改媒体链接替换规则

修改后部署 Worker，然后访问 `/api/regrab` 重新抓取旧数据。

### 3. 修改推送逻辑

编辑 `workers/cache-worker.js` 中的 `triggerPush()` 函数：

- 修改消息模板
- 修改摘要长度（当前 150 字符）
- 添加新的推送目标

### 4. 修改分页逻辑

编辑 `workers/cache-worker.js` 中的 `/api/posts` 端点：

- 修改排序字段（当前 `published_at`）
- 修改分页大小（当前 20）
- 修改游标比较逻辑

### 5. 自定义样式

样式文件位于 `src/assets/`：

- `normalize.css` - CSS 重置
- `style.css` - 主样式
- `item.css` - 帖子项样式
- `global.css` - 全局样式
- 各页面 `.astro` 文件内也有 `<style>` 块

### 6. 代码高亮

项目集成了 Prism.js + Flourite 实现自动代码语言检测和高亮：

- 配置文件：`src/lib/prism.js`、`src/lib/code-highlight.js`
- 自动检测代码块语言
- 支持多种编程语言高亮
- 按需加载语言组件（优化体积）

## Docker 部署

项目提供完整的 Docker 支持，适合本地开发和私有化部署。

### 构建镜像

```bash
docker build -t multi-channel-broadcast .
```

### 使用 docker-compose

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 查看日志
docker-compose logs -f
```

### 环境变量配置

在 `docker-compose.yml` 或 `.env` 文件中配置：

```env
WORKER_URL=http://localhost:8000
CHANNELS=channel1,channel2
SITE_NAME=My Blog
```

## 数据库管理

### 查看数据库

```bash
wrangler d1 execute multi-channel-db --command "SELECT * FROM posts LIMIT 10"
```

### 重置抓取进度

```bash
wrangler d1 execute multi-channel-db --command "UPDATE channel_meta SET last_msg_id = '0'"
```

### 清理旧数据

```bash
wrangler d1 execute multi-channel-db --command "DELETE FROM posts WHERE published_at < datetime('now', '-1 year')"
```

## 测试

### 运行测试

```bash
# 运行所有测试
pnpm test

# 监听模式
pnpm test -- --watch
```

测试文件位于 `src/lib/telegram/__tests__/`，使用 Vitest 框架。

## 部署

### 前端（Cloudflare Pages / Vercel / Netlify）

#### Cloudflare Pages（推荐）

1. 连接 GitHub 仓库到 Cloudflare Pages
2. 构建命令：`pnpm build`
3. 输出目录：`dist`
4. 配置环境变量
5. 设置 `SERVER_ADAPTER=cloudflare_pages`

#### Vercel

1. 连接 GitHub 仓库到 Vercel
2. 构建命令：`pnpm build`
3. 输出目录：`dist`
4. 设置 `SERVER_ADAPTER=vercel`

#### Netlify

1. 连接 GitHub 仓库到 Netlify
2. 构建命令：`pnpm build`
3. 输出目录：`dist`
4. 设置 `SERVER_ADAPTER=netlify`

### 后端（Cloudflare Workers）

```bash
# 首次部署
wrangler deploy

# 部署时绑定资源（在 wrangler.toml 中配置）
wrangler deploy
```

### Docker 部署（一体化）

```bash
# 构建镜像
docker build -t multi-channel-broadcast .

# 运行容器
docker-compose up -d

# 查看日志
docker-compose logs -f
```

配置环境变量在 `.env` 或 `docker-compose.yml` 中。

### 配置 Cron 触发器

在 `wrangler.toml` 中：

```toml
[[triggers]]
crons = ["*/5 * * * *"]  # 每 5 分钟
```

### 配置 Queue

```bash
# 创建队列
wrangler queues create scraping-tasks

# 在 wrangler.toml 中绑定
[[queues.producers]]
queue = "scraping-tasks"
binding = "TASK_QUEUE"

[[queues.consumers]]
queue = "scraping-tasks"
max_batch_size = 10
max_retries = 2
```

### 配置 D1 数据库

```bash
# 创建数据库
wrangler d1 create multi-channel-db

# 执行迁移（需手动创建表）
wrangler d1 execute multi-channel-db --file=schema.sql
```

## 调试

### Worker 日志

```bash
# 实时查看 Worker 日志
wrangler tail

# 查看特定环境的日志
wrangler tail --env production
```

### 前端调试

```bash
# 启动开发服务器
pnpm dev
```

访问 `http://localhost:4321`，查看浏览器控制台和 Network 面板。

### SSR 调试

由于 Astro 使用 SSR 模式，注意：
- 环境变量在服务端读取，确保 `.env` 文件正确配置
- 使用 `console.log()` 在服务端输出日志
- 前端调试使用浏览器 DevTools

### Docker 调试

```bash
# 查看容器日志
docker-compose logs -f

# 进入容器内部
docker-compose exec app /bin/bash

# 重启服务
docker-compose restart
```

### 检查 Worker API

直接访问：
- `https://your-worker.workers.dev/api/channels`
- `https://your-worker.workers.dev/api/posts?channel=all&limit=5`
- `https://your-worker.workers.dev/health`（健康检查，如已实现）

## 常见问题

### Q: 首页只显示一个频道的内容？

A: 检查：
1. Worker 环境变量 `CHANNELS` 是否正确配置了多个频道
2. 前端 `WORKER_URL` 是否指向正确的 Worker 地址
3. D1 数据库中是否确实有多个频道的数据

### Q: 帖子没有图片？

A: 可能原因：
1. 旧数据使用旧抓取逻辑（无图片），访问 `/api/regrab` 重新抓取
2. Telegram HTML 结构变化，需要更新 `parsePosts()` 中的选择器

### Q: 分页链接 404？

A: 确保：
1. `before/[cursor].astro` 和 `after/[cursor].astro` 存在
2. 分页 cursor 使用 `encodeURIComponent()` 编码
3. 分页使用 `published_at` 字段而非 `id`（避免斜杠问题）

### Q: 如何禁用推送？

A: 设置 `TELEGRAM_PUSH_ENABLED=false` 或删除该环境变量。

### Q: Cron 没有触发抓取？

A: 检查：
1. Cron 触发器是否在 `wrangler.toml` 中正确配置
2. Worker 是否已部署
3. Queue 是否正确绑定
4. 查看 Worker 日志：`wrangler tail`

### Q: 图片加载失败？

A: 检查：
1. wsrv.nl 服务是否可访问
2. 图片 URL 是否正确编码
3. Telegram CDN 是否返回了正确的图片

### Q: 视频无法播放或无法拖动进度条？

A: 检查：
1. `/static/` 路由是否在 Worker 中正确处理
2. Range 请求头是否正确透传
3. Content-Range 响应头是否正确返回

### Q: 本地开发时跨域问题？

A: 确保：
1. `WORKER_URL` 指向正确的 Worker 地址（本地或远程）
2. Worker 配置了正确的 CORS 头部
3. 开发服务器配置了代理（参考 `vite.config.js` 或 `astro.config.mjs`）

### Q: Docker 部署后无法访问？

A: 检查：
1. 端口映射是否正确（默认 4321）
2. 环境变量是否正确传递到容器
3. 容器日志：`docker-compose logs -f`

## 贡献指南

1. Fork 仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可证

MIT License
