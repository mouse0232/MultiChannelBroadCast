# 接口和类型定义

## 核心数据类型

### Post 对象

从 D1 数据库读取的帖子结构:

```typescript
interface Post {
  id: string                    // 帖子 ID (格式: channel/messageId)
  channel: string               // 来源频道用户名
  title: string                 // 帖子标题（自动提取，最多 100 字符）
  content: string               // HTML 格式内容（含代理后的媒体）
  published_at: string          // 发布时间 (ISO 8601，如 2024-05-07T11:54:14+00:00)
  datetime?: string             // 兼容字段，等同于 published_at
  tags?: string[]               // 标签列表（预留，当前未使用）
  type?: string                 // 消息类型（预留，当前固定 'text'）
}
```

### ChannelMeta 对象

频道元数据结构（来自 channel_meta 表）:

```typescript
interface ChannelMeta {
  channel: string               // 频道用户名
  last_msg_id: string           // 最后抓取的消息 ID（数字部分）
  title: string                 // 频道显示名称
  avatar: string                // 头像 URL（wsrv.nl 代理后）
}
```

### API 响应对象

#### GET /api/posts 响应

```json
{
  "posts": [Post]
}
```

查询参数:
- `channel`: 频道用户名，`all` 表示所有频道
- `limit`: 每页数量，默认 20
- `before`: published_at 游标，获取更早的内容
- `after`: published_at 游标，更新的内容

#### GET /api/channels 响应

```json
{
  "channels": [ChannelMeta]
}
```

#### GET /api/post/{id} 响应

```json
{
  "post": Post
}
```

注意：`id` 参数支持两种格式：
- 完整 ID（URL 编码）：`yunyoocc%2F12345` → 精确查询
- 纯数字 ID：`12345` → LIKE 模糊查询（向后兼容）

#### GET /api/init 响应

```json
{
  "status": "ok",
  "message": "Init complete. Refresh your website.",
  "totalChannels": 5,
  "successCount": 5,
  "errors": []  // 可选，有错误时包含
}
```

#### GET /api/regrab 响应

```json
{
  "status": "ok",
  "message": "Regrab complete for 5 channels",
  "successCount": 5,
  "errors": []
}
```

查询参数:
- `limit`: 每个频道重新抓取的数量，默认 50

## 前端组件 Props

### List 组件

```typescript
interface ListProps {
  channel: {
    posts: Post[]
    title: string
    username: string
    avatar: string | null
    description?: string
  }
  currentChannel?: string       // 当前频道用户名（首页为 null）
  before?: boolean              // 是否显示"更早"按钮，默认 true
  after?: boolean               // 是否显示"更新"按钮，默认 true
  isItem?: boolean              // 是否为单帖模式，默认 false
}
```

### Item 组件

```typescript
interface ItemProps {
  post: Post
  isItem?: boolean              // 是否为单帖模式
}
```

### Header 组件

```typescript
interface HeaderProps {
  channel: {
    title: string
    avatar: string | null
    username?: string
    href?: string | false
  }
  showGlobalRss?: boolean       // 是否显示全局 RSS 图标
  rssUrl?: string               // RSS 链接地址
}
```

## Worker API 接口

### 内容获取 API

#### GET /api/posts

获取帖子列表，支持分页和频道过滤。

```typescript
async function getPosts(options?: {
  channel?: string              // 频道用户名，默认 'all'
  limit?: number                // 每页数量，默认 20
  before?: string               // published_at 游标（更早）
  after?: string                // published_at 游标（更新）
}): Promise<{ posts: Post[] }>
```

#### GET /api/post/{id}

获取单个帖子。

```typescript
async function getPost(id: string): Promise<{ post: Post }>
```

#### GET /api/posts/search

搜索帖子。

```typescript
async function searchPosts(options: {
  q: string                     // 搜索关键词
  channel?: string              // 频道过滤，默认 'all'
  limit?: number                // 结果数量，默认 20
}): Promise<{ posts: Post[] }>
```

#### GET /api/channels

获取频道列表。

```typescript
async function getChannels(): Promise<{ channels: ChannelMeta[] }>
```

### 管理 API

#### GET /api/init

初始化并全量抓取所有频道。

```typescript
async function init(): Promise<{
  status: string
  message: string
  totalChannels: number
  successCount: number
  errors?: string[]
}>
```

#### GET /api/regrab

重新抓取并更新旧帖子内容（用于修复抓取逻辑后更新已有数据）。

```typescript
async function regrab(options?: {
  limit?: number                // 每频道重新抓取数量，默认 50
}): Promise<{
  status: string
  message: string
  successCount: number
  errors?: string[]
}>
```

## 环境变量接口

### 必需环境变量

```env
CHANNELS=channel1,channel2,channel3  # 频道列表（逗号分隔）
```

### 前端环境变量

```env
SITE_NAME=My Blog                    # 站点名称
SITE_AVATAR=https://...              # 站点头像 URL
WORKER_URL=https://...workers.dev    # Worker API 地址
LOCALE=zh-cn                         # 语言代码
TIMEZONE=Asia/Shanghai               # 时区
RSS_PREFIX=                          # RSS 前缀
RSS_URL=https://.../rss.xml          # RSS 地址
GOOGLE_SEARCH_SITE=                  # Google 搜索站点（可选）
COMMENTS=true                        # 启用评论（Telegram widget）
HEADER_INJECT=                       # 头部注入 HTML
FOOTER_INJECT=                       # 尾部注入 HTML
TAGS=true                            # 显示标签页
LINKS=true                           # 显示链接页
NAVS=标题，链接;标题，链接              # 自定义导航（分号分隔）
TELEGRAM=username                    # Telegram 链接
TWITTER=username                     # Twitter 链接
GITHUB=username                      # GitHub 链接
SERVER_ADAPTER=cloudflare_pages      # 适配器类型（vercel/cloudflare_pages/netlify/node）
```

### Worker 环境变量

```env
CHANNELS=channel1,channel2           # 频道列表（逗号分隔）
TELEGRAM_HOST=t.me                   # Telegram 主机（支持多主机轮询）
TELEGRAM_BOT_TOKEN=xxx               # Telegram Bot Token
TELEGRAM_PUSH_CHANNEL_ID=@channel    # 推送目标频道
TELEGRAM_PUSH_ENABLED=true           # 启用推送
```

## SQL 查询接口

### 帖子查询

```sql
-- 获取最新帖子
SELECT * FROM posts WHERE 1=1
  [AND channel = ?]
  ORDER BY published_at DESC
  LIMIT ?

-- 获取更早的帖子（before 分页）
SELECT * FROM posts WHERE 1=1
  [AND channel = ?]
  AND published_at < ?
  ORDER BY published_at DESC
  LIMIT ?

-- 获取更新的帖子（after 分页）
SELECT * FROM posts WHERE 1=1
  [AND channel = ?]
  AND published_at > ?
  ORDER BY published_at ASC
  LIMIT ?

-- 搜索帖子
SELECT * FROM posts WHERE
  (title LIKE ? OR content LIKE ?)
  [AND channel = ?]
  ORDER BY id DESC
  LIMIT ?
```

### 频道查询

```sql
-- 获取所有频道元数据
SELECT channel, last_msg_id, title, avatar FROM channel_meta

-- 更新频道元数据
INSERT OR REPLACE INTO channel_meta
  (channel, last_msg_id, title, avatar)
  VALUES (?, ?, ?, ?)
```

### 帖子写入

```sql
-- 插入新帖子（忽略已存在的）
INSERT OR IGNORE INTO posts
  (id, channel, title, content, published_at)
  VALUES (?, ?, ?, ?, ?)

-- 更新已有帖子（用于 regrab）
INSERT OR REPLACE INTO posts
  (id, channel, title, content, published_at)
  VALUES (?, ?, ?, ?, ?)
```

## 错误类型

### API 错误响应格式

所有 API 错误统一返回格式：

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的错误描述"
  }
}
```

常见错误码：

| 错误码 | HTTP 状态码 | 说明 |
|--------|-----------|------|
| `NOT_FOUND` | 404 | 资源不存在（如帖子 ID 无效） |
| `INVALID_PARAM` | 400 | 参数格式错误 |
| `RATE_LIMITED` | 429 | 请求频率超限（如已实现速率限制） |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

### API 错误

```typescript
type APIError =
  | 'Post not found'               // 帖子不存在（404）
  | 'Failed to fetch posts'        // 获取帖子失败
  | 'Failed to fetch channels'     // 获取频道失败
  | 'Invalid channel parameter'    // 频道参数无效
  | 'Invalid cursor format'        // 游标格式错误
```

### Worker 错误

```typescript
type WorkerError =
  | 'Fetch failed'                 // Telegram 请求失败
  | 'Queue send failed'            // 队列发送失败
  | 'D1 cleanup failed'            // 数据清理失败
  | 'Push failed'                  // 推送失败
  | 'Database write error'         // 数据库写入错误
```

### 错误处理最佳实践

1. **参数化查询**：所有 SQL 查询使用 `prepare().bind()` 防止注入
2. **输入验证**：检查 post ID、cursor 等参数格式
3. **错误日志**：使用 `console.error()` 记录详细错误，但返回通用错误信息
4. **SQL 通配符转义**：搜索接口对 `_` 和 `%` 进行转义
