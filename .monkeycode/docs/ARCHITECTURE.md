# 系统架构文档

## 架构概览

Multi-Channel Broadcast 采用**前后端分离架构**，前端使用 Astro 静态站点生成，后端使用 Cloudflare Workers + D1 数据库实现异步内容抓取和存储。

```mermaid
graph TB
    subgraph "前端 (Astro Pages)"
        A[用户请求] --> B[Astro 路由]
        B --> C{页面类型}
        C -->|首页聚合| D[index.astro]
        C -->|频道页| E[channel/[channel].astro]
        C -->|帖子详情| F[posts/[...id].astro]
        C -->|分页| G[before|after/[cursor].astro]
        C -->|RSS| H[rss.xml.js]
    end
    
    subgraph "后端 (Cloudflare Worker)"
        D -->|/api/posts| I[Worker API]
        E -->|/api/posts| I
        G -->|/api/posts| I
        H -->|/api/posts| I
        D -->|/api/channels| J[频道列表 API]
        
        I --> K[(D1 数据库)]
        J --> K
        
        L[Cron 定时触发] --> M[调度抓取任务]
        M --> N[(Queue 消息队列)]
        N --> O[Queue 消费者]
        O --> P[Telegram 抓取]
        P --> Q[Cheerio 解析]
        Q --> R[媒体处理]
        R --> K
        R --> S[推送服务]
        S --> T[Telegram Bot API]
    end
    
    subgraph "外部服务"
        P --> U[t.me / telesco.pe]
        R --> V[wsrv.nl 图片代理]
        R --> W[/static/ 视频代理]
    end
```

## 分层架构

### 1. 前端层 (Astro Pages)

位于 `src/pages/`，负责:
- URL 路由匹配
- 页面布局和模板
- 调用 Worker API 获取数据
- 渲染静态 HTML

### 2. 后端层 (Cloudflare Worker)

位于 `workers/cache-worker.js`，负责:
- Cron 定时触发抓取任务
- Queue 异步消费处理
- Telegram 内容抓取和解析
- 媒体资源代理（图片/视频）
- D1 数据库读写
- 推送通知服务

### 3. 数据层 (D1 Database)

Cloudflare D1 (SQLite)，包含:
- `posts` 表：存储所有频道帖子
- `channel_meta` 表：存储频道元数据和抓取进度
- `push_logs` 表：记录推送日志防止重复

### 4. 展示层 (Components)

位于 `src/components/`，负责:
- UI 组件复用
- 样式管理
- 客户端交互逻辑

## 核心数据流

### 内容获取流程（后台异步）

1. **Cron 定时触发** → 每分钟执行一次
2. **分发任务** → 将每个频道发送到 Queue
3. **Queue 消费** → 并行处理多个频道
4. **抓取页面** → 请求 `t.me/s/{channel}`
5. **HTML 解析** → Cheerio 提取消息和媒体
6. **媒体处理** → 图片用 wsrv.nl 代理，视频用 /static/ 代理
7. **写入 D1** → INSERT OR IGNORE（增量写入）
8. **触发推送** → 非首次运行时推送到 Telegram
9. **更新进度** → 更新 channel_meta.last_msg_id

### 内容展示流程（前端同步）

1. **用户访问页面** → Astro 路由匹配
2. **调用 d1-client.js** → 请求 Worker API
3. **Worker 查询 D1** → SQL 查询帖子/频道数据
4. **返回 JSON** → Astro 接收数据
5. **渲染页面** → 生成静态 HTML

## 数据库设计

### posts 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 主键，格式 `channel/messageId` |
| channel | TEXT | 频道用户名 |
| title | TEXT | 帖子标题（自动提取） |
| content | TEXT | HTML 格式内容（含代理后的媒体） |
| published_at | TEXT | 发布时间（ISO 8601） |

### channel_meta 表

| 字段 | 类型 | 说明 |
|------|------|------|
| channel | TEXT | 主键，频道用户名 |
| last_msg_id | TEXT | 最后抓取的消息 ID（数字部分） |
| title | TEXT | 频道标题 |
| avatar | TEXT | 头像 URL（wsrv.nl 代理后） |

### push_logs 表

| 字段 | 类型 | 说明 |
|------|------|------|
| post_id | TEXT | 主键，已推送的帖子 ID |

## 缓存策略

### 架构级缓存

- **D1 数据库**：持久化存储，无需额外缓存
- **Cloudflare CDN**：Astro 静态页面自动缓存
- **图片代理**：wsrv.nl 自带 CDN 缓存

### 缓存失效

- 新帖子通过 Cron 定时抓取自动更新
- 页面缓存通过 Cloudflare 自动管理

## 图片代理架构

### 图片代理（wsrv.nl）

```
Telegram CDN → wsrv.nl → 用户
```

所有图片使用 `https://wsrv.nl/?url={encoded_url}` 代理，确保国内可访问。

### 视频/音频代理（Worker 本地）

```
Telegram CDN → Worker /static/ → 用户
```

- URL 格式：`/static/cdnX.telegram-cdn.org/file/xxx.mp4`
- 支持 Range 请求（拖动进度条）
- 透传 Content-Range 响应头

### 媒体处理逻辑

| 媒体类型 | 处理方式 |
|---------|---------|
| 照片 | wsrv.nl 代理 |
| 链接预览图 | wsrv.nl 代理 |
| 视频/音频 | /static/ Worker 代理 |
| 视频缩略图 | wsrv.nl 代理 |

## 推送服务架构

### 推送流程

```
新帖子写入 D1
  ↓
检查 push_logs（去重）
  ↓
提取纯文本摘要（150 字符）
  ↓
提取首图 URL
  ↓
有图？ → sendPhoto（图文）
  ↓
无图？ → sendMessage（纯文本）
  ↓
记录 push_logs
```

### 推送消息格式

```
📢 [频道名] 标题

内容摘要（前 150 字符）...

阅读原文
```

## Worker API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/posts` | GET | 获取帖子列表 |
| `/api/posts/search` | GET | 搜索帖子 |
| `/api/post/{id}` | GET | 获取单个帖子 |
| `/api/channels` | GET | 获取频道列表 |
| `/api/init` | GET | 初始化并全量抓取 |
| `/api/regrab` | GET | 重新抓取并更新旧帖子 |
| `/static/*` | GET | 视频/音频代理 |

## 分页策略

### 基于 published_at 的游标分页

- **首页**：`ORDER BY published_at DESC LIMIT 20`
- **更早**：`published_at < {cursor} ORDER BY published_at DESC`
- **更新**：`published_at > {cursor} ORDER BY published_at ASC`（结果需反转）

### Cursor 编码

使用 `encodeURIComponent()` 编码 published_at 值，避免 URL 路由问题。

## 部署架构

### 前端

- **平台**：Cloudflare Pages
- **构建**：Astro SSG
- **部署**：Git 推送自动触发

### 后端

- **平台**：Cloudflare Workers
- **数据库**：Cloudflare D1
- **队列**：Cloudflare Queues
- **定时**：Cloudflare Cron Triggers

## 错误处理策略

### 内容抓取错误

- 网络错误：重试 2 次，随机延迟 1-3 秒
- 解析错误：跳过问题消息
- UA 池：随机切换 User-Agent 防风控

### 推送服务错误

- 配置错误：跳过推送
- API 错误：记录警告，不阻塞主流程
- 超时：10 秒超时
- 随机延迟：1-2 秒避免触发 Telegram 风控

## 安全考虑

### XSS 防护

- 用户输入转义
- HTML 内容使用 Cheerio 安全解析
- 推送消息使用 `escapeHtml` 函数

### 凭据安全

- Bot Token 存储在 Cloudflare 环境变量
- 不在日志中输出敏感信息
- .netrc 文件权限 600（Go mod 凭据）

## 性能优化

### 异步架构

- Cron + Queue 解耦抓取和展示
- 前端只读 D1，无外部 HTTP 请求
- 页面加载 < 50ms（D1 本地读取）

### 分页优化

- 基于 published_at 的游标分页
- 每页 20 条记录
- 避免 OFFSET 深度分页

### 媒体优化

- 图片使用 `loading="lazy"`
- 图片使用 wsrv.nl CDN 缓存
- 视频支持 Range 请求（按需加载）
