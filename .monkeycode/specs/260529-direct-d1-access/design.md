# Pages 直连 D1 数据访问优化 - 技术设计

## 1. 系统架构

### 1.1 当前架构（改造前）

```
┌─────────────────────────────────────────────────────────────┐
│                     数据写入路径                              │
├─────────────────────────────────────────────────────────────┤
│  Cron Trigger ──┐                                           │
│                 ▼                                           │
│  Queue Consumer ──→ scheduled() / queue()                   │
│                     │                                       │
│                     ▼                                       │
│              processSingleChannel()                         │
│                     │                                       │
│                     ├─→ fetchAndParse() (抓取 Telegram)     │
│                     ├─→ 关键词过滤                           │
│                     ├─→ D1 写入 (posts 表)                   │
│                     ├─→ D1 写入 (channel_meta 表)            │
│                     └─→ triggerPush() (推送通知)            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     数据读取路径（当前）                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Pages (Astro SSR)                                          │
│         │                                                   │
│         ▼                                                   │
│  Service Binding (MCB_CRAWLER)                              │
│         │                                                   │
│         ▼                                                   │
│  Worker.fetch() Handler                                     │
│         │                                                   │
│         ├─→ /api/posts (带版本号缓存)                         │
│         ├─→ /api/channels (带版本号缓存)                      │
│         ├─→ /api/post/:id (URL 缓存)                        │
│         └─→ /api/posts/search (URL 缓存)                    │
│                       │                                     │
│                       ▼                                     │
│              handleCachedRequest()                          │
│                       │                                     │
│                       ├─→ 检查 Cache API (Edge Cache)        │
│                       ├─→ Cache MISS → D1 查询               │
│                       └─→ Cache HIT → 返回缓存响应           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**当前数据流详解**:

**写路径** (`workers/cache-worker.js:171-380`):
```javascript
// 1. Cron 定时触发（每 5 分钟）
async function scheduled(event, env, ctx) {
  // 发送任务到 Queue
  await env.TASK_QUEUE.sendBatch(tasks.map(task => ({ body: task })))
}

// 2. Queue 批量消费
async function queue(batch, env, ctx) {
  for (const message of batch.messages) {
    await processSingleChannel(message.body, env)
    message.ack()
  }
}

// 3. 单频道处理
async function processSingleChannel(task, env) {
  // 获取上次抓取进度
  const meta = await env.DB.prepare("SELECT last_msg_id FROM channel_meta WHERE channel = ?").bind(channel).first()
  
  // 抓取 Telegram
  const result = await fetchAndParse(channel, env, lastMsgId)
  
  // 关键词过滤
  const filteredPosts = posts.filter(...)
  
  // 写入 D1
  await env.DB.batch(statements)
  
  // 更新 channel_meta
  await env.DB.prepare("INSERT OR REPLACE INTO channel_meta ...").run()
  
  // 触发推送
  await triggerPush(newPosts, env)
}
```

**读路径** (`workers/cache-worker.js:781-1288`):
```javascript
// Pages 调用 (`src/lib/d1-client.js`)
export async function callWorkerApi(pathname, env, { headers = {} } = {}) {
  if (!env?.MCB_CRAWLER) {
    throw new Error('MCB_CRAWLER Service Binding 未配置')
  }
  const req = new Request(`https://mcb-crawler.internal${pathname}`, {
    headers: { ...headers, 'X-Request-Source': 'service-binding' }
  })
  return env.MCB_CRAWLER.fetch(req)  // Service Binding 调用 Worker
}

// Worker Handler 处理
async fetch(request, env, ctx) {
  if (url.pathname === '/api/posts') {
    return handleCachedRequest(request, env, ctx, async () => {
      // 查询 D1
      const { results } = await env.DB.prepare(query).bind(...bindings).all()
      return new Response(JSON.stringify({ posts: results }))
    }, true) // true = 使用版本号缓存 Key
  }
}
```

### 1.2 Worker 缓存机制详解

**核心缓存函数** (`handleCachedRequest`, `workers/cache-worker.js:89-145`):

```javascript
async function handleCachedRequest(request, env, ctx, getResponseFunc, isVersioned = false) {
  // 1. 构建 Cache Key
  const url = new URL(request.url)
  let cacheKey
  
  if (isVersioned) {
    // 获取版本号（从 D1 channel_meta 表）
    const versions = await getVersionMap(env)
    cacheKey = getVersionedKey(url, versions)
    // Key 格式：https://xxx/api/posts?channel=all&_cv=12345
  } else {
    // URL 规范化（排序参数、移除干扰项）
    cacheKey = normalizeUrl(url, url.origin + url.pathname)
  }
  
  // 2. 检查 Cache API（Edge Cache）
  const fakeRequest = new Request(cacheKey, { headers: { 'Accept': 'application/json' } })
  const cachedResponse = await caches.default.match(fakeRequest)
  
  if (cachedResponse) {
    // Cache HIT
    console.log(`[API Cache] HIT - ${method} ${cleanPath}`)
    return cachedResponse
  }
  
  // 3. Cache MISS → 执行 D1 查询
  const response = await getResponseFunc()
  
  // 4. 异步存入 Cache API
  if (request.method === 'GET' && response.ok) {
    ctx.waitUntil(caches.default.put(fakeRequest, response.clone()))
  }
  
  return response
}
```

**版本号缓存机制** (`getVersionMap`, `workers/cache-worker.js:15-44`):

```javascript
// Worker 内存缓存（60 秒软过期）
let VERSION_CACHE = { ts: 0, versions: {} }

async function getVersionMap(env) {
  const now = Date.now()
  
  // 超过 60 秒或为空则回源 D1
  if (!VERSION_CACHE.ts || (now - VERSION_CACHE.ts > 60000)) {
    const { results } = await env.DB.prepare(
      "SELECT channel, last_msg_id FROM channel_meta"
    ).all()
    
    const map = {}
    let maxId = 0
    results.forEach(r => {
      const id = parseInt(r.last_msg_id || '0', 10)
      map[r.channel] = r.last_msg_id || '0'
      if (id > maxId) maxId = id
    })
    
    // 全站聚合版本号（取最大 last_msg_id）
    map['__ALL__'] = String(maxId)
    VERSION_CACHE = { ts: now, versions: map }
  }
  
  return VERSION_CACHE.versions
}

// 数据更新后清除版本缓存
function invalidateVersionCache() {
  VERSION_CACHE.ts = 0
}
```

**缓存 Key 生成策略** (`getVersionedKey`, `normalizeUrl`, `workers/cache-worker.js:56-84`):

```javascript
// 版本号 Key（用于帖子列表、频道列表）
function getVersionedKey(urlObj, versions) {
  const channel = urlObj.searchParams.get('channel') || 'all'
  const ver = channel === 'all' 
    ? versions['__ALL__'] 
    : versions[channel] || versions['__ALL__']
  
  const normalized = normalizeUrl(urlObj, url.origin + url.pathname)
  const separator = normalized.includes('?') ? '&' : '?'
  return `${normalized}${separator}_cv=${ver}`
}

// URL 规范化（用于单贴、搜索）
function normalizeUrl(urlObj, baseUrl) {
  const params = new URLSearchParams(urlObj.search)
  ['_t', '_bust', 'utm_source', 'utm_medium', 'ref'].forEach(k => params.delete(k))
  const sorted = new URLSearchParams([...params.entries()].sort())
  return `${baseUrl}?${sorted.toString()}`
}
```

**缓存策略对比**:

| API 端点 | 缓存类型 | Key 生成 | TTL | 失效策略 |
|---------|---------|---------|-----|---------|
| `/api/posts` | 版本号 Key | `_cv=${version}` | 300s | version 变化自动失效 |
| `/api/channels` | 版本号 Key | `_cv=${__ALL__}` | 7200s | __ALL__ 变化自动失效 |
| `/api/post/:id` | URL Key | 规范化 URL | 600s | URL -based TTL |
| `/api/posts/search` | URL Key | 规范化 URL | 600s | URL-based TTL |

### 1.3 目标架构（改造后）

```
┌─────────────────────────────────────────────────────────────┐
│                     数据写入路径（保持不变）                    │
├─────────────────────────────────────────────────────────────┤
│  Cron Trigger ──┐                                           │
│                 ▼                                           │
│  Queue Consumer ──→ scheduled() / queue()                   │
│                     │                                       │
│                     ▼                                       │
│              processSingleChannel()                         │
│                     │                                       │
│                     ├─→ fetchAndParse() (抓取 Telegram)     │
│                     ├─→ 关键词过滤                           │
│                     ├─→ D1 写入 (posts 表)                   │
│                     ├─→ D1 写入 (channel_meta 表)            │
│                     └─→ triggerPush() (推送通知)            │
│                                                             │
│  管理 API 保留：                                              │
│  - GET /api/init (初始化)                                   │
│  - GET /api/regrab (重新抓取)                               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     数据读取路径（改造后）                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Pages (Astro SSR)                                          │
│         │                                                   │
│         ▼                                                   │
│  D1 Database (直接查询)                                     │
│         │                                                   │
│         ▼                                                   │
│  Cache API (边缘缓存，复用 Worker 逻辑)                       │
│         │                                                   │
│         ├─→ getVersionMap() (内存版本号缓存)                 │
│         ├─→ getVersionedKey() (带版本号的 Cache Key)        │
│         ├─→ caches.default.match() (检查缓存)               │
│         └─→ caches.default.put() (写入缓存)                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**改造后关键点**:

1. **Worker 不再处理读请求**：移除 `/api/posts`、`/api/channels` 等 GET 接口
2. **Pages 直连 D1**：通过 `env.DB.prepare().all()` 直接查询
3. **Cache API 直接移植**：Workers 的缓存逻辑完整复制到 Pages Functions
4. **保留管理接口**：`/api/init`、`/api/regrab` 用于后台管理

### 1.4 架构对比

| 维度 | 改造前 | 改造后 | 改进 |
|------|--------|--------|------|
| **读取延迟** | Pages → SB → Worker → Cache API → D1 (约 100-150ms) | Pages → Cache API → D1 (约 30-80ms) | ⬇️ 减少 50-100ms |
| **Worker 请求** | 每次 Pages SSR 都计入（列表 + 搜索） | 仅写操作（Cron/Queue） | ⬇️ 减少 90%+ |
| **Cache API** | Worker 使用 Cache API | Pages 使用 Cache API（相同机制） | → 不变 |
| **D1 读取** | Worker 代理查询 | Pages 直接查询 | ⬇️ 减少中间层 |
| **架构复杂度** | Worker 维护 read/write 混合逻辑 | Worker 只写，Pages 只读 | ⬇️ 职责清晰 |
| **缓存控制** | 版本号 Key + Worker 内存缓存 | 版本号 Key + Pages 内存缓存（相同逻辑） | → 不变 |

**关键改进点**:

1. **消除 Service Binding 开销**: 每次请求减少一次内部 RPC 调用
2. **缓存逻辑完整移植**: `handleCachedRequest`、`getVersionMap`、`getVersionedKey` 直接复制
3. **Worker 逻辑简化**: 移除读接口，专注写操作
4. **独立扩展**: Pages 和 Worker 可独立优化

## 2. 组件设计

### 2.1 Pages Functions 组件

**文件**: `src/lib/d1-cache.js` (新增，从 Worker 复制缓存逻辑)

**职责**: 
- 提供版本号缓存机制（与 Worker 相同）
- 提供 Cache API 缓存函数
- 供 `d1-client.js` 调用

**实现** (直接复制 `workers/cache-worker.js:9-145`):

```javascript
// src/lib/d1-cache.js

// ==========================================
// 1. Globals & Version Cache (Memory Strategy)
// ==========================================
let VERSION_CACHE = {
  ts: 0,
  versions: {}
}

async function getVersionMap(db) {
  const now = Date.now()
  if (!VERSION_CACHE.ts || (now - VERSION_CACHE.ts > 60000)) {
    try {
      const { results } = await db.prepare(
        "SELECT channel, last_msg_id FROM channel_meta"
      ).all()

      const map = {}
      let maxId = 0

      results.forEach(r => {
        const id = parseInt(r.last_msg_id || '0', 10)
        map[r.channel] = r.last_msg_id || '0'
        if (id > maxId) maxId = id
      })

      map['__ALL__'] = String(maxId)
      VERSION_CACHE = { ts: now, versions: map }
      console.log(`[Cache] Version map refreshed from D1. Total channels: ${results.length}`)
    } catch (e) {
      console.error('[Cache] Failed to refresh version map:', e)
    }
  }
  return VERSION_CACHE.versions
}

function invalidateVersionCache() {
  VERSION_CACHE.ts = 0
  console.log('[Cache] Version map invalidated.')
}

// ==========================================
// 2. Cache Key Utilities
// ==========================================
function getVersionedKey(options, versions) {
  const channel = options.channel || 'all'
  const ver = channel === 'all' 
    ? (versions['__ALL__'] || '0') 
    : (versions[channel] || versions['__ALL__'] || '0')

  const params = new URLSearchParams({
    channel: options.channel || 'all',
    limit: String(options.limit || 20),
    before: options.before || '',
    after: options.after || ''
  })
  
  const separator = params.toString() ? '&' : '?'
  return `https://cache.internal/posts?${params.toString()}${separator}_cv=${ver}`
}

function normalizeUrl(options) {
  const params = new URLSearchParams({
    q: options.q || '',
    channel: options.channel || 'all',
    limit: String(options.limit || 20)
  })
  return `https://cache.internal/search?${params.toString()}`
}

// ==========================================
// 3. Cache API Helper
// ==========================================
export async function handleCachedQuery(db, options, queryFunc, isVersioned = true) {
  let cacheKey
  
  if (isVersioned) {
    const versions = await getVersionMap(db)
    cacheKey = getVersionedKey(options, versions)
  } else {
    cacheKey = normalizeUrl(options)
  }

  const fakeRequest = new Request(cacheKey, { 
    headers: { 'Accept': 'application/json' } 
  })
  
  const cachedResponse = await caches.default.match(fakeRequest)
  if (cachedResponse) {
    console.log(`[Cache HIT] ${cacheKey}`)
    return await cachedResponse.json()
  }
  
  console.log(`[Cache MISS] ${cacheKey}`)
  
  const results = await queryFunc()
  
  const response = new Response(JSON.stringify(results), {
    headers: { 
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600'
    }
  })
  
  caches.default.put(fakeRequest, response.clone())
  
  return results
}
```

**文件**: `src/lib/d1-client.js` (重构)

**职责**:
- 直接查询 D1（不再通过 Service Binding）
- 调用 `handleCachedQuery` 实现缓存

**接口定义**:

```javascript
import { handleCachedQuery } from './d1-cache'

function getDatabase(env) {
  return env.DB || env.DATABASE
}

export async function getChannels(Astro) {
  const env = Astro.locals?.runtime?.env || {}
  const db = getDatabase(env)
  
  if (!db) {
    throw new Error('D1 Database 未配置')
  }
  
  // 直接从 D1 读取已抓取的频道（不需要 env.CHANNELS）
  const { results } = await db.prepare(
    "SELECT channel, last_msg_id, title, avatar FROM channel_meta"
  ).all()
  
  return results
}

export async function getPosts(Astro, { channel = 'all', limit = 20, before = '', after = '' } = {}) {
  const env = Astro.locals?.runtime?.env || {}
  const db = getDatabase(env)
  
  if (!db) {
    throw new Error('D1 Database 未配置')
  }
  
  return handleCachedQuery(db, { channel, limit, before, after }, async () => {
    let query = `SELECT * FROM posts WHERE 1=1`
    const bindings = []

    if (channel !== 'all') {
      query += ` AND channel = ?`
      bindings.push(channel)
    }

    if (after) {
      query += ` AND published_at > ?`
      bindings.push(after)
      query += ` ORDER BY published_at ASC LIMIT ?`
    } else if (before) {
      query += ` AND published_at < ?`
      bindings.push(before)
      query += ` ORDER BY published_at DESC LIMIT ?`
    } else {
      query += ` ORDER BY published_at DESC LIMIT ?`
    }
    
    bindings.push(limit)

    const { results } = await db.prepare(query).bind(...bindings).all()
    
    if (after) {
      results.reverse()
    }
    
  return results
})
```

### 2.3 数据库 Schema（保持不变）

现有表结构无需修改，索引保持不变：

```sql
-- 帖子表
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  title TEXT,
  content TEXT,
  published_at DATETIME
);
CREATE INDEX idx_posts_channel ON posts(channel);
CREATE INDEX idx_posts_published_at ON posts(published_at);

-- 频道元数据表
CREATE TABLE channel_meta (
  channel TEXT PRIMARY KEY,
  last_msg_id TEXT,
  title TEXT,
  avatar TEXT
);

-- 推送日志表
CREATE TABLE push_logs (
  post_id TEXT PRIMARY KEY,
  tg_message_id INTEGER
);
```

### 2.4 环境变量配置

**Pages 环境变量** (Dashboard 配置):

| 变量名 | 值 | 说明 |
|-------|-----|------|
| `DB` | D1 Binding | D1 数据库绑定（必需） |
| `SITE_NAME` | `站点名称` | 站点名称 |
| `SITE_AVATAR` | `URL` | 站点头像 |
| `SITE_URL` | `https://xxx.pages.dev` | 站点 URL |
| `TZ` | `Asia/Shanghai` | 时区 |

**注意**：
- Pages **不需要** `CHANNELS`：直接从 D1 `channel_meta` 表读取已抓取的频道
- Pages **不需要** `API_SECRET_KEY`：Pages 只有 SSR 页面，无 API 接口暴露

**Worker 环境变量** (保持不变):

| 变量名 | 值 | 说明 |
|-------|-----|------|
| `DB` | D1 Binding | D1 数据库绑定 |
| `CHANNELS` | `channel1,channel2,...` | 频道列表（Worker 抓取用） |
| `API_SECRET_KEY` | `your-secret-key` | API 密钥（保护 Worker 公网接口） |
| `TELEGRAM_BOT_TOKEN` | `Bot Token` | TG Bot 令牌 |
| `TELEGRAM_PUSH_CHANNEL_ID` | `Channel ID` | TG 推送频道 |
| `TELEGRAM_HOST` | `t.me` | Telegram Host |
| `FILTER_ENABLED` | `true` | 关键词过滤开关 |
| `TASK_QUEUE` | Queue Binding | 任务队列 |
| `AI` | AI Binding | Workers AI |
| `IMG_CACHE` | R2 Binding | 图片缓存 |
| ... | ... | 其他保持不变 |

**配置说明**：
- Worker 保留 `API_SECRET_KEY`：Worker 有公网 URL，`/api/posts` 等接口需要 Secret 保护
- Pages 不需要 `API_SECRET_KEY`：Pages 只有 SSR 页面，用户访问的是 HTML，无法直接调用 D1

## 3. 数据库 Schema

### 3.1 现有表结构（保持不变）

```sql
-- 帖子表
CREATE TABLE posts (
  id TEXT PRIMARY KEY,           -- channel/message_id
  channel TEXT NOT NULL,         -- 频道用户名
  title TEXT,                    -- 帖子标题
  content TEXT,                  -- 帖子内容 (HTML)
  published_at DATETIME          -- 发布时间
);

-- 频道元数据表
CREATE TABLE channel_meta (
  channel TEXT PRIMARY KEY,      -- 频道用户名
  last_msg_id TEXT,              -- 最后抓取的消息 ID
  title TEXT,                    -- 频道标题
  avatar TEXT                    -- 频道头像 URL
);

-- 推送日志表
CREATE TABLE push_logs (
  post_id TEXT PRIMARY KEY,      -- 帖子 ID
  tg_message_id INTEGER          -- Telegram 消息 ID
);

-- 索引（保持不变）
CREATE INDEX idx_posts_channel ON posts(channel);
CREATE INDEX idx_posts_published_at ON posts(published_at);
```

## 4. 数据流详解

### 4.1 写操作（保持不变）

```
1. Cron 触发 (每 5 分钟)
   └─→ Worker.scheduled(event, env, ctx)
       └─→ 发送任务到 Queue
           └─→ TASK_QUEUE.sendBatch(...)

2. Queue 消费
   └─→ Worker.queue(batch, env, ctx)
       └─→ processSingleChannel(task, env)
           ├─→ 抓取 Telegram 频道
           ├─→ 解析帖子内容
           ├─→ 关键词过滤
           ├─→ 写入 D1 (posts 表)
           │   └─→ INSERT OR REPLACE INTO posts ...
           ├─→ 更新频道元数据
           │   └─→ INSERT OR REPLACE INTO channel_meta ...
           └─→ 触发推送通知
               └─→ triggerPush(posts, env)
```

### 4.2 读操作（改造后）

```
1. 用户访问首页
   └─→ Pages (src/pages/index.astro)
       ├─→ getChannels(Astro)
       │   └─→ D1: SELECT FROM channel_meta
       └─→ getPosts(Astro, { channel: 'all', limit: 20 })
           ├─→ 检查 KV 缓存
           │   └─→ Cache HIT: 返回缓存数据
           └─→ Cache MISS:
               ├─→ D1: SELECT FROM posts
               ├─→ 写入 KV 缓存
               └─→ 返回数据
       └─→ 渲染页面

2. 用户访问频道页
   └─→ Pages (src/pages/channel/[channel].astro)
       └─→ getPosts(Astro, { channel: 'xxx', limit: 20 })
           └─→ 同上

3. 用户搜索
   └─→ Pages (src/pages/search/[q].astro)
       └─→ searchPosts(Astro, q, { channel: 'all', limit: 20 })
           └─→ D1: SELECT WHERE title LIKE OR content LIKE
```

## 5. 缓存策略

### 5.1 缓存层级

```
┌─────────────────────────────────────┐
│ Browser Cache (客户端)               │
│ - Static assets (CSS, JS, Images)   │
│ - Cache-Control: max-age=3600       │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Cloudflare Edge Cache (CDN)         │
│ - HTML pages (ISR)                  │
│ - Cache-Control: stale-while-revalidate
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ KV Cache (Pages Functions)          │
│ - 帖子列表：5 分钟                       │
│ - 搜索结果：10 分钟                      │
│ - 频道列表：2 小时                       │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ D1 Database                         │
│ - 持久化存储                         │
└─────────────────────────────────────┘
```

### 5.2 缓存失效策略

**场景 1: 新帖子到达**

```
1. Worker 抓取新帖子 → 写入 D1
2. KV 缓存仍然有效（最多 5 分钟旧数据）
3. 用户刷新页面：
   - 缓存未过期 → 看到旧数据（可接受）
   - 缓存过期 → 自动查询 D1 → 看到新数据
```

**场景 2: 手动刷新缓存**

```
Worker API /api/regrab (保留的管理接口):
1. 重新抓取指定频道
2. 更新 D1 数据
3. 清除对应 KV 缓存（可选）
   └─→ env.POSTS_CACHE.delete(`posts:channel=${channel}|*`)
```

### 5.3 缓存 Key 设计

```javascript
// 缓存 Key 构建函数
function buildCacheKey(prefix, params) {
  // 参数排序保证一致性
  const sorted = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k] || ''}`)
    .join('|')
  return `${prefix}:${sorted}`
}

// 示例
buildCacheKey('posts', { 
  channel: 'all', 
  limit: 20, 
  before: '', 
  after: '' 
})
// 输出：posts:after=|before=|channel=all|limit=20
```

## 6. 安全措施

### 6.1 LIMIT 限制

**硬编码上限，防止大量数据查询**：

```javascript
export async function getPosts(Astro, { channel = 'all', limit = 20, ... } = {}) {
  // 硬编码上限 100
  const safeLimit = Math.min(parseInt(limit) || 20, 100)
  
  const { results } = await db.prepare(query)
    .bind(...bindings, safeLimit)
    .all()
}
```

**要求**：
- 默认 `limit=20`
- 最大 `limit=100`（硬编码，不可绕过）

### 6.2 ID 格式校验

**防止全表扫描**：

```javascript
// src/lib/d1-client.js
export async function getPostById(Astro, id) {
  const db = getDatabase(env)
  
  // 校验 ID 格式：必须包含斜杠 (channel/id)
  if (!id.includes('/')) {
    throw new Error('Invalid post ID format. Expected: channel/id')
  }
  
  // 精确查询（命中主键索引）
  const result = await db.prepare(
    "SELECT * FROM posts WHERE id = ? LIMIT 1"
  ).bind(id).first()
  
  return result
}
```

**禁止**：
- ❌ `LIKE '%keyword%'` 模糊查询（全表扫描）
- ✅ 只允许 `id = ?` 精确查询

### 6.3 搜索限制

**搜索接口必须带频道过滤和 LIMIT**：

```javascript
export async function searchPosts(Astro, q, { channel = 'all', limit = 20 } = {}) {
  const db = getDatabase(env)
  
  if (!q || q.length < 2) {
    return []  // 空查询或单字查询返回空
  }
  
  const safeLimit = Math.min(limit, 100)
  
  let query = `SELECT * FROM posts WHERE (title LIKE ? OR content LIKE ?)`
  const bindings = [`%${q}%`, `%${q}%`]
  
  // 强制频道过滤（减少扫描范围）
  if (channel !== 'all') {
    query += ` AND channel = ?`
    bindings.push(channel)
  }
  
  query += ` ORDER BY published_at DESC LIMIT ?`
  bindings.push(safeLimit)
  
  const { results } = await db.prepare(query).bind(...bindings).all()
  return results
}

### 6.4 缓存策略（减少 D1 查询）

**复用 Worker 的版本号缓存机制**：

```javascript
// src/lib/d1-cache.js
let VERSION_CACHE = { ts: 0, versions: {} }  // 内存缓存

async function getVersionMap(db) {
  const now = Date.now()
  // 60 秒软过期，减少回源 D1
  if (!VERSION_CACHE.ts || (now - VERSION_CACHE.ts > 60000)) {
    const { results } = await db.prepare(
      "SELECT channel, last_msg_id FROM channel_meta"
    ).all()
    // ... 构建版本号 map
    VERSION_CACHE = { ts: now, versions: map }
  }
  return VERSION_CACHE.versions
}

// Cache API 边缘缓存
export async function handleCachedQuery(db, options, queryFunc, isVersioned = true) {
  const cacheKey = getVersionedKey(options, await getVersionMap(db))
  const fakeRequest = new Request(cacheKey, { headers: { 'Accept': 'application/json' } })
  
  // 检查缓存
  const cachedResponse = await caches.default.match(fakeRequest)
  if (cachedResponse) {
    return await cachedResponse.json()
  }
  
  // 执行查询
  const results = await queryFunc()
  
  // 写入缓存
  const response = new Response(JSON.stringify(results), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600'
    }
  })
  caches.default.put(fakeRequest, response.clone())
  
  return results
}
```

**缓存 TTL**：

| 数据类型 | TTL | stale-while-revalidate |
|---------|-----|------------------------|
| 帖子列表 | 300s | 600s |
| 频道列表 | 7200s | 7200s |
| 单个帖子 | 600s | 3600s |
| 搜索结果 | 600s | 1200s |

---

### 6.6 查询日志（安全审计）

**记录用户 IP 和查询参数**：

```javascript
// src/lib/d1-client.js
export async function getPosts(Astro, options) {
  const env = Astro.locals?.runtime?.env || {}
  const loggingEnabled = env.API_LOGGING_ENABLED === 'true'
  
  if (loggingEnabled) {
    const realUserIP = Astro.request?.headers?.get('cf-connecting-ip') ||
                       Astro.request?.headers?.get('x-real-ip')
    
    console.log('API Query:', {
      timestamp: new Date().toISOString(),
      path: Astro.url.pathname,
      realUserIP: realUserIP,
      params: {
        channel: options.channel,
        limit: options.limit,
        before: options.before,
        after: options.after
      }
    })
  }
  
  // ... 继续查询逻辑
}
```

---

### 6.7 SQL 参数化绑定（防止 SQL 注入）

**禁止字符串拼接，必须使用 `.bind()`**：

```javascript
// ✅ 正确：参数化绑定
const safeLimit = Math.min(limit, 100)
const { results } = await db.prepare(
  "SELECT * FROM posts WHERE channel = ? ORDER BY published_at DESC LIMIT ?"
).bind(channel, safeLimit).all()

// ❌ 错误：字符串拼接（禁止！）
const query = `SELECT * FROM posts WHERE channel = '${channel}' LIMIT ${limit}`
const { results } = await db.prepare(query).all()
```

## 7. 性能优化

### 7.1 查询优化

**索引使用**:

```sql
-- 现有索引（确保命中）
CREATE INDEX idx_posts_channel ON posts(channel);
CREATE INDEX idx_posts_published_at ON posts(published_at);

-- 复合索引（可选，根据查询频率）
CREATE INDEX idx_posts_channel_published 
ON posts(channel, published_at DESC);
```

**查询优化**:

```javascript
// ✅ 好的查询（使用索引）
SELECT * FROM posts 
WHERE channel = ? 
  AND published_at < ? 
ORDER BY published_at DESC 
LIMIT ?

// ❌ 避免的查询（全表扫描）
SELECT * FROM posts 
WHERE content LIKE '%keyword%'  -- LIKE 前缀通配无法使用索引
```

### 7.2 分页游标

**使用 `published_at` 而非 `id`**:

```javascript
// ✅ 正确：使用 datetime 游标
const beforeCursor = posts.length > 0 
  ? posts[posts.length - 1]?.published_at 
  : null

// ❌ 错误：使用 id 游标（包含斜杠，路由复杂）
const beforeCursor = posts[posts.length - 1]?.id  // channel/1234
```

### 7.3 批量查询

```javascript
// ❌ N+1 查询（避免）
for (const channel of channels) {
  const posts = await db.prepare(
    "SELECT * FROM posts WHERE channel = ?"
  ).bind(channel).all()
}

// ✅ 批量查询（推荐）
const { results } = await db.prepare(
  "SELECT * FROM posts WHERE channel IN (?, ?, ?)"
).bind(ch1, ch2, ch3).all()
```

## 8. 监控与日志

### 8.1 日志埋点

```javascript
// D1 查询日志
console.log(`[D1 Query] ${query.substring(0, 50)}... | Bindings: ${bindings.length}`)

// 缓存命中日志
console.log(`[Cache ${cached ? 'HIT' : 'MISS'}] ${cacheKey}`)

// 性能日志
const start = Date.now()
const results = await db.prepare(query).bind(...bindings).all()
const elapsed = Date.now() - start
console.log(`[D1 Performance] Query took ${elapsed}ms, returned ${results.length} rows`)
```

### 8.2 监控指标

**Cloudflare Analytics**:

| 指标 | 监控点 | 告警阈值 |
|------|--------|----------|
| D1 查询次数 | Dashboard → D1 → Queries | > 100,000/天 |
| KV 读取次数 | Dashboard → KV → Operations | > 500,000/天 |
| Pages 函数错误 | Dashboard → Pages → Functions | > 1% 错误率 |
| 页面加载时间 | Real User Monitoring | > 3s |

## 9. 测试策略

### 9.1 单元测试

```javascript
// src/lib/__tests__/d1-client.test.js
import { describe, it, expect, vi } from 'vitest'
import { getPosts, getChannels } from '../d1-client'

describe('D1 Client', () => {
  it('should fetch posts with correct pagination', async () => {
    const mockAstro = {
      locals: {
        runtime: {
          env: {
            DB: {
              prepare: vi.fn().mockReturnValue({
                bind: vi.fn().mockReturnValue({
                  all: vi.fn().mockResolvedValue({ 
                    results: [{ id: 'ch/1', title: 'Test' }] 
                  })
                })
              })
            }
          }
        }
      }
    }
    
    const posts = await getPosts(mockAstro, { channel: 'test', limit: 20 })
    expect(posts).toHaveLength(1)
  })
})
```

### 9.2 集成测试

```bash
# 本地测试
pnpm build && pnpm preview

# 测试用例
1. 访问首页 → 验证帖子列表显示
2. 切换频道 → 验证过滤功能
3. 点击"更早" → 验证分页游标
4. 搜索关键词 → 验证搜索结果
5. 刷新页面 → 验证缓存命中（日志可见）
```

### 9.3 性能测试

```bash
# 使用 WebPageTest 或 Lighthouse
1. 测量首页加载时间（改造前 vs 改造后）
2. 测量 API 响应时间（Worker API vs D1 Direct）
3. 验证 D1 查询次数（应在预算内）
```

## 10. 部署步骤

### 10.1 前置准备

1. **创建 KV 命名空间** (如果不存在):
   ```bash
   wrangler kv:namespace create "POSTS_CACHE"
   ```
   记录返回的 `id`

2. **配置 Pages D1 绑定**:
   - Dashboard → Pages → 项目 → Settings → Functions
   - D1 database bindings → Add binding
   - Variable name: `DB`
   - Database: `multi-channel-db`

3. **配置 Pages KV 绑定**:
   - Dashboard → Pages → 项目 → Settings → Functions
   - KV namespace bindings → Add binding
   - Variable name: `POSTS_CACHE`
   - KV namespace: 选择步骤 1 创建的命名空间

4. **配置环境变量**:
   - Dashboard → Pages → 项目 → Settings → Environment Variables
   - 添加 `CHANNELS`, `API_SECRET_KEY`, `SITE_NAME` 等

### 10.2 代码部署

```bash
# 1. 本地测试
pnpm build
pnpm preview

# 2. 提交代码
git add .
git commit -m "feat: direct D1 access for Pages"
git push

# 3. Cloudflare Pages 自动部署
# 等待构建完成，检查部署日志
```

### 10.3 验证清单

- [ ] 首页正常显示帖子列表
- [ ] 频道过滤功能正常
- [ ] 分页"更早"/"更新"按钮正常
- [ ] 搜索功能正常
- [ ] KV 缓存命中（检查 Functions 日志）
- [ ] D1 查询正常（检查 D1 Dashboard）
- [ ] Worker 继续正常抓取（检查 Worker 日志）

## 11. 回滚方案

如果改造后出现问题，可以快速回滚：

### 11.1 代码回滚

```bash
git revert HEAD
git push
```

### 11.2 Dashboard 回滚

1. **恢复 Service Binding**:
   - Dashboard → Pages → Settings → Functions
   - 重新添加 `MCB_CRAWLER` Service Binding

2. **还原代码** (使用旧版本):
   - `src/lib/d1-client.js` 恢复为 `callWorkerApi` 版本

### 11.3 混合模式（降级运行）

```javascript
// src/lib/d1-client.js (双模式)
export async function getPosts(Astro, options) {
  const env = Astro.locals?.runtime?.env || {}
  
  // 尝试 D1 直连
  if (env.DB) {
    try {
      return await queryD1(env.DB, options)
    } catch (e) {
      console.error('[D1 Error] Falling back to Worker API:', e.message)
    }
  }
  
  // 降级：使用 Worker API
  if (env.MCB_CRAWLER) {
    const params = new URLSearchParams(options)
    const res = await callWorkerApi(`/api/posts?${params}`, env)
    const data = await res.json()
    return data.posts
  }
  
  throw new Error('No data source available')
}
```

## 12. 成本分析

### 12.1 改造前成本估算

假设日均 PV: 10,000

| 项目 | 单价 | 用量 | 成本 |
|------|------|------|------|
| Worker 请求 | $0.5/百万 | 10,000 × 30 = 30 万/月 | $0.15/月 |
| D1 读取 | $0.5/百万 | 30 万/月 | $0.15/月 |
| **合计** | | | **$0.30/月** |

### 12.2 改造后成本估算

| 项目 | 单价 | 用量 | 成本 |
|------|------|------|------|
| Worker 请求 | $0.5/百万 | 仅抓取（约 1 万/月） | $0.005/月 |
| D1 读取 | $0.5/百万 | 30 万/月 | $0.15/月 |
| KV 读取 | $0.5/百万 | 20 万/月（缓存命中 70%） | $0.10/月 |
| **合计** | | | **$0.255/月** |

**节省**: 约 15% 成本 + 性能提升

### 12.3 隐性收益

- 页面加载更快 → 用户体验提升 → 留存率提高
- 架构简化 → 维护成本降低
- 扩展性增强 → 未来可独立扩展读/写侧

## 13. 后续优化方向

1. **增量静态生成 (ISR)**:
   - 利用 Cloudflare Pages ISR 能力
   - 为帖子详情页生成静态 HTML

2. **边缘缓存**:
   - 使用 Cloudflare Cache API 在边缘节点缓存
   - 进一步减少 D1 查询

3. **读写分离**:
   - Worker 部署在离数据源近的区域
   - Pages 部署在离用户近的区域

4. **批量写入优化**:
   - Worker 使用 batch 批量写入 D1
   - 减少 D1 写入次数

## 14. 参考资料

- [Cloudflare D1 最佳实践](https://developers.cloudflare.com/d1/best-practices/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Cloudflare KV](https://developers.cloudflare.com/kv/)
- [CQRS 模式](https://martinfowler.com/bliki/CQRS.html)
