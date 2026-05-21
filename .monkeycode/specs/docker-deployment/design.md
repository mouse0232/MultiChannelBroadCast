## 需求文档索引

- [需求文档](./requirements.md) - EARS 模式编写的需求规格
- [任务列表](./tasklist.md) - 实施任务清单

---

# 完善 Docker 部署方案 - 技术设计

## 1. 架构概述

### 1.1 当前状态分析

项目目前采用**双模式部署架构**:

| 部署模式 | 使用的技术栈 | 功能完整性 |
|---------|-------------|-----------|
| Cloudflare Workers | Workers + D1 + Queues + Cron | ✅ 100% 功能支持 |
| Docker | Node.js + Astro SSR | ⚠️ 缺失核心功能 |

### 1.2 功能差异对比

基于现有代码分析，Docker 部署缺失以下关键功能:

| 功能模块 | CF Workers | Docker (当前) | 优先级 |
|---------|-----------|-------------|--------|
| **异步抓取队列** | ✅ Queue + Cron | ❌ 缺失 | P0 |
| **D1 数据库** | ✅ Cloudflare D1 | ❌ 缺失 | P0 |
| **定时任务调度** | ✅ Cron Triggers | ❌ 缺失 | P0 |
| **关键词过滤** | ✅ 内置支持 | ✅ 支持 (需配置) | P1 |
| **推送服务** | ✅ Telegram Bot API | ✅ 支持 (需配置) | P1 |
| **图片代理** | ✅ /img-proxy (R2) | ❌ 缺失 | P1 |
| **视频代理** | ✅ /static/* | ⚠️ 部分支持 | P2 |
| **API 端点** | ✅ 完整 REST API | ❌ 缺失 | P0 |

### 1.3 设计目标

构建**一体化 Docker 部署方案**,在单个容器中集成:
1. **前端服务**: Astro SSR (Node.js Adapter)
2. **后端服务**: Worker API + 异步抓取任务
3. **数据库**: SQLite (替代 D1)
4. **任务队列**: BullMQ + Redis (替代 Workers Queue)
5. **定时调度**: Node-cron (替代 Cron Triggers)

---

## 2. 技术架构

### 2.1 整体架构图

```mermaid
graph TB
    subgraph "Docker Container"
        A[Node.js 主进程] --> B[Astro SSR 前端]
        A --> C[API Server (Express/Fastify)]
        A --> D[定时任务调度器]
        C --> E[(SQLite 数据库)]
        D --> F[任务队列消费者]
        F --> G[Telegram 抓取器]
        G --> E
    end
    
    subgraph "外部服务"
        H[Telegra m Bot API] --> A
        I[t.me / telesco.pe] --> G
    end
    
    B --> |查询 API| C
    C --> |写入数据| E
    F --> |写入数据| E
```

### 2.2 核心组件设计

#### 2.2.1 数据库层 (SQLite)

**Schema 设计** (兼容 D1):

```sql
-- posts 表：存储所有频道帖子
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  published_at TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- channel_meta 表：存储频道元数据和抓取进度
CREATE TABLE IF NOT EXISTS channel_meta (
  channel TEXT PRIMARY KEY,
  last_msg_id TEXT,
  title TEXT,
  avatar TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- push_logs 表：记录推送日志防止重复
CREATE TABLE IF NOT EXISTS push_logs (
  post_id TEXT PRIMARY KEY,
  tg_message_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_posts_channel ON posts(channel);
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at);
CREATE INDEX IF NOT EXISTS idx_posts_channel_published ON posts(channel, published_at);
```

**ORM 方案**: 使用 `better-sqlite3` (同步 API，性能优) 或 `sql.js` (纯 JS 实现)

#### 2.2.2 任务队列 (BullMQ)

**架构**:
- **Producer**: 定时调度器生成抓取任务
- **Queue**: Redis (或内存模式用于简化部署)
- **Consumer**: 并行处理频道抓取

**队列配置**:
```typescript
import { Queue, Worker } from 'bullmq'

const queue = new Queue('telegram-grab', {
  connection: { host: 'localhost', port: 6379 } // 或使用 Redis in Docker
})

const worker = new Worker('telegram-grab', async (job) => {
  await processSingleChannel(job.data.channel)
}, {
  connection: { host: 'localhost', port: 6379 },
  concurrency: 5 // 并发处理 5 个频道
})
```

#### 2.2.3 定时调度 (Node-cron)

**Cron 表达式**: `* * * * *` (每分钟执行)

```typescript
import cron from 'node-cron'

cron.schedule('* * * * *', async () => {
  console.log('⏰ Cron triggered: Dispatching tasks')
  
  const channels = getChannelsFromEnv()
  const tasks = channels.map(ch => ({ channel: ch }))
  
  await queue.addBulk(tasks.map(t => ({ name: 'grab-channel', data: t })))
  
  // 定期清理旧数据
  await cleanupOldData()
})
```

#### 2.2.4 API Server (Express/Fastify)

**端点映射** (保持与 Worker API 兼容):

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/posts` | GET | 获取帖子列表 |
| `/api/posts/search` | GET | 搜索帖子 |
| `/api/post/:id` | GET | 获取单个帖子 |
| `/api/channels` | GET | 获取频道列表 |
| `/api/init` | GET | 初始化并全量抓取 |
| `/api/regrab` | GET | 重新抓取并更新旧帖子 |
| `/img-proxy/:url` | GET | 图片代理 |
| `/static/*` | GET | 视频/音频代理 |

---

## 3. 核心模块实现

### 3.1 抓取模块 (复用 Worker 代码)

**文件位置**: `src/worker-mock/grabber.js`

**关键改造点**:
1. 移除 `env.DB` 依赖，改为 SQLite 连接
2. 移除 `env.QUEUE` 依赖，改为 BullMQ Job
3. 保留 `parsePosts`、`fetchAndParse` 核心逻辑

**代码改造示例**:
```javascript
// 原 Worker 代码
const meta = await env.DB.prepare("SELECT last_msg_id FROM channel_meta WHERE channel = ?").bind(channel).first()

// Docker 改造
const meta = db.prepare("SELECT last_msg_id FROM channel_meta WHERE channel = ?").get(channel)
```

### 3.2 关键词过滤模块 (直接复用)

**文件位置**: `src/lib/KeywordFilter.js` (无需修改)

**配置加载**:
```javascript
import { safeLoadFilterRules } from '../lib/KeywordFilter.js'

const filterRules = safeLoadFilterRules()
const filterEnabled = process.env.FILTER_ENABLED === 'true'
```

### 3.3 推送服务 (复用逻辑)

**文件位置**: `src/worker-mock/pusher.js`

**改造点**:
- 移除 `env.TELEGRAM_*` 依赖，改为 `process.env.TELEGRAM_*`
- 数据库操作改用 SQLite

### 3.4 媒体代理

#### 3.4.1 图片代理

**方案 A: wsrv.nl CDN (默认)**
- 直接使用 `https://wsrv.nl/?url={encoded_url}`
- 无需额外实现

**方案 B: 本地文件缓存 (可选)**
```javascript
import crypto from 'crypto'
import fs from 'fs'
import { fetch } from 'undici'

const CACHE_DIR = '/app/cache/images'

async function proxyImage(targetUrl) {
  const hash = crypto.createHash('sha256').update(targetUrl).digest('hex')
  const cachePath = `${CACHE_DIR}/${hash}`
  
  if (fs.existsSync(cachePath)) {
    return fs.createReadStream(cachePath)
  }
  
  const response = await fetch(targetUrl)
  const buffer = await response.arrayBuffer()
  
  fs.writeFileSync(cachePath, Buffer.from(buffer))
  return Buffer.from(buffer)
}
```

#### 3.4.2 视频代理

**实现**: 透传 Range 请求
```javascript
async function proxyMedia(targetUrl, rangeHeader) {
  const headers = {}
  if (rangeHeader) {
    headers.Range = rangeHeader
  }
  
  const response = await fetch(targetUrl, { headers })
  
  return {
    status: response.status,
    headers: {
      'Content-Range': response.headers.get('Content-Range'),
      'Content-Type': response.headers.get('Content-Type'),
      'Content-Length': response.headers.get('Content-Length'),
      'Access-Control-Allow-Origin': '*'
    },
    body: response.body
  }
}
```

---

## 4. Docker 配置文件

### 4.1 Dockerfile (优化版)

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app

# 安装 pnpm 和系统依赖
RUN npm install -g pnpm@9.9.0 && \
    apk add --no-cache python3 make g++

# 安装所有依赖
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# 构建应用
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DOCKER=true
RUN pnpm run build

# 仅安装生产依赖
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --frozen-lockfile

# 生产运行
FROM node:22-alpine AS runtime
WORKDIR /app

# 安装 SQLite 运行时依赖
RUN apk add --no-cache sqlite-libs

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

# 创建数据目录
RUN mkdir -p /app/data /app/cache/images && \
    chown -R node:node /app

# 清理不必要的工具
RUN rm -rf /usr/local/lib/node_modules/npm && \
    rm -rf /tmp/* /var/cache/apk/*

# 复制文件
COPY --from=build /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/worker-mock ./src/worker-mock

USER node

EXPOSE 4321

# 启动脚本
CMD ["node", "--experimental-vm-modules", "./dist/server/entry.mjs"]
```

### 4.2 docker-compose.yml (增强版)

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    image: multi-channel-broadcast:latest
    container_name: multi-channel-broadcast
    
    # 端口映射
    ports:
      - "4321:4321"
    
    # 环境变量
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - PORT=4321
      - DATA_DIR=/app/data
      - CACHE_DIR=/app/cache
    
    # 数据持久化
    volumes:
      - app-data:/app/data
      - app-cache:/app/cache
    
    # 重启策略
    restart: unless-stopped
    
    # 网络
    networks:
      - app-network
    
    # 资源限制
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
    
    # 健康检查
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:4321/api/channels"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  redis:
    image: redis:7-alpine
    container_name: multi-channel-redis
    restart: unless-stopped
    networks:
      - app-network
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  app-data:
  app-cache:
  redis-data:

networks:
  app-network:
    driver: bridge
```

### 4.3 .env 配置模板

```bash
# =====================================
# 核心配置
# =====================================
CHANNELS=miantiao_me,zaihuapd,sspai,zaobao_news
SITE_NAME=Multi-Channel Broadcast
LOCALE=zh-cn
TIMEZONE=Asia/Shanghai

# =====================================
# Docker 特定配置
# =====================================
DOCKER=true
DATA_DIR=/app/data
CACHE_DIR=/app/cache

# =====================================
# 抓取配置
# =====================================
TELEGRAM_HOST=t.me,telegram.dog
FILTER_ENABLED=false

# =====================================
# Telegram 推送
# =====================================
TELEGRAM_PUSH_ENABLED=true
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_PUSH_CHANNEL_ID=@your_channel

# =====================================
# API 安全
# =====================================
API_SECRET_KEY=your_secret_key_here
API_LOGGING_ENABLED=false
```

---

## 5. 启动脚本

### 5.1 一体化启动 (单进程模式)

**文件位置**: `src/worker-mock/index.js`

```javascript
import { startAPIServer } from './api-server.js'
import { startScheduler } from './scheduler.js'
import { startQueueWorker } from './queue-worker.js'
import { initializeDatabase } from './database.js'

async function main() {
  console.log('🚀 Starting Multi-Channel Broadcast (Docker Mode)')
  
  // 1. 初始化数据库
  await initializeDatabase()
  console.log('✅ Database initialized')
  
  // 2. 启动 API 服务
  await startAPIServer()
  console.log('✅ API server running on port 4321')
  
  // 3. 启动任务队列消费者
  await startQueueWorker()
  console.log('✅ Queue worker started')
  
  // 4. 启动定时调度器
  await startScheduler()
  console.log('✅ Scheduler started (Cron: * * * * *)')
  
  console.log('🎉 All services started successfully')
}

main().catch(console.error)
```

### 5.2 入口点配置

**文件位置**: `package.json`

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "start": "node --experimental-vm-modules ./dist/server/entry.mjs",
    "docker:start": "node --experimental-vm-modules src/worker-mock/index.js"
  }
}
```

**修改 `dist/server/entry.mjs`**:
```javascript
// 检查 DOCKER 环境变量
if (process.env.DOCKER === 'true') {
  // 启动完整服务 (前端 + 后端 + 队列 + 定时)
  await import('../src/worker-mock/index.js')
} else {
  // 仅启动 Astro SSR 前端
  await import('./astro-server.js')
}
```

---

## 6. 部署流程

### 6.1 构建镜像

```bash
# 国内用户
docker-compose -f docker-compose.yml build

# 或使用国内镜像源
docker build -t multi-channel-broadcast:latest -f Dockerfile.cn .
```

### 6.2 启动服务

```bash
docker-compose up -d
```

### 6.3 初始化数据

```bash
# 调用初始化 API
curl http://localhost:4321/api/init \
  -H "X-API-Secret: your_secret_key_here"
```

### 6.4 查看日志

```bash
docker-compose logs -f app
```

---

## 7. 数据持久化与迁移

### 7.1 SQLite -> D1 迁移

**导出 SQLite**:
```bash
docker exec multi-channel-broadcast sqlite3 /app/data/app.db .dump > backup.sql
```

**导入 D1**:
```bash
wrangler d1 execute YOUR_D1_DB_NAME --file=backup.sql
```

### 7.2 备份策略

```bash
#!/bin/bash
# backup.sh
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)

docker exec multi-channel-broadcast sqlite3 /app/data/app.db ".dump" > ${BACKUP_DIR}/backup_${DATE}.sql

# 保留最近 7 天的备份
find ${BACKUP_DIR} -name "backup_*.sql" -mtime +7 -delete
```

---

## 8. 性能优化

### 8.1 数据库优化

```sql
-- 启用 WAL 模式 (提高并发性能)
PRAGMA journal_mode=WAL;

-- 设置同步模式 (平衡性能与安全性)
PRAGMA synchronous=NORMAL;

-- 增加缓存大小 (单位：页，默认 1000)
PRAGMA cache_size=10000;
```

### 8.2 队列并发控制

```javascript
const worker = new Worker('telegram-grab', handleJob, {
  concurrency: 5,  // 同时处理 5 个频道
  limiter: {
    max: 60,       // 每分钟最多处理 60 个任务
    duration: 60000
  }
})
```

### 8.3 缓存策略

```javascript
// 前端缓存 (Astro)
export const revalidate = 300 // 5 分钟 ISR

// API 缓存 (Redis)
import { Redis } from 'ioredis'
const redis = new Redis()

async function cachedQuery(key, queryFn, ttl = 300) {
  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached)
  
  const result = await queryFn()
  await redis.setex(key, ttl, JSON.stringify(result))
  return result
}
```

---

## 9. 监控与告警

### 9.1 健康检查端点

```javascript
// /api/health
app.get('/api/health', async (req, res) => {
  const checks = {
    database: await checkDatabase(),
    queue: await checkQueue(),
    lastGrab: await checkLastGrabTime()
  }
  
  const isHealthy = Object.values(checks).every(c => c.ok)
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    checks
  })
})
```

### 9.2 日志收集

```javascript
import winston from 'winston'

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: '/app/logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: '/app/logs/combined.log' })
  ]
})
```

---

## 10. 已知限制与注意事项

### 10.1 功能限制

| 功能 | CF Workers | Docker | 说明 |
|------|-----------|--------|------|
| 全球 CDN | ✅ | ❌ | Docker 需手动配置 CDN |
| 自动扩缩容 | ✅ | ❌ | Docker 需手动扩展 |
| D1 备份 | ✅ | ⚠️ | Docker 需手动备份 |
| R2 图片存储 | ✅ | ⚠️ | Docker 使用本地文件缓存 |

### 10.2 性能对比

| 指标 | CF Workers | Docker |
|------|-----------|--------|
| 冷启动 | ~50ms | ~2s |
| API 延迟 | <10ms | ~50ms |
| 抓取并发 | 10+ | 5 (可配置) |
| 数据库 QPS | 1000+ | ~100 (SQLite) |

### 10.3 最佳实践

1. **定期备份**: 使用 cron 定期备份 SQLite 数据库
2. **监控资源**: 设置内存/CPU 告警阈值
3. **日志轮转**: 使用 logrotate 管理日志文件
4. **安全加固**: 配置防火墙、限制 API 访问

---

## 11. 测试验证

### 11.1 功能测试

```bash
# 测试 API
curl http://localhost:4321/api/channels

# 测试抓取
curl http://localhost:4321/api/init -H "X-API-Secret: xxx"

# 测试推送
curl http://localhost:4321/api/posts?limit=1
```

### 11.2 压力测试

```bash
# 使用 k6 进行负载测试
k6 run tests/load-test.js
```

---

## 12. 附录

### 12.1 依赖清单

```json
{
  "dependencies": {
    "better-sqlite3": "^9.0.0",
    "bullmq": "^4.0.0",
    "node-cron": "^3.0.0",
    "express": "^4.18.0",
    "cheerio": "^1.0.0",
    "ofetch": "^1.3.0"
  }
}
```

### 12.2 参考资源

- [BullMQ 文档](https://docs.bullmq.io/)
- [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3)
- [Node-cron 示例](https://github.com/node-cron/node-cron)
- [Docker 最佳实践](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
