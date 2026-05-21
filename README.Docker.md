# Docker 部署指南

> Multi-Channel Broadcast 项目的完整 Docker 部署方案，实现与 Cloudflare Workers 版本功能对等。

## 📋 功能特性

✅ **完整功能支持**:
- 异步抓取队列（内存模式或 Redis）
- 定时任务调度（Cron）
- SQLite 数据库持久化
- 完整的 REST API
- 关键词过滤
- Telegram 推送
- 媒体代理服务

🎯 **一键部署**: 
- 简化配置（无需 Redis）
- 数据自动持久化
- 健康检查
- 自动重启

## 🚀 快速开始

### 1. 配置文件

```bash
# 复制环境配置模板
cp .env.example .env

# 编辑配置文件，至少设置以下变量
# CHANNELS=miantiao_me,zaihuapd,sspai
# API_SECRET_KEY=your_secret_key_here
```

### 2. 启动服务

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f app
```

### 3. 初始化数据

```bash
# 调用初始化 API，开始全量抓取
curl http://localhost:4321/api/init \
  -H "X-API-Secret: your_secret_key_here"
```

### 4. 访问服务

打开浏览器访问：`http://localhost:4321`

## 📁 项目结构

```
src/worker-mock/
├── index.js          # 主入口
├── database.js       # SQLite 数据库适配层
├── api-server.js     # Express API 服务器
├── grabber.js        # 抓取模块（从 Worker 移植）
├── pusher.js         # Telegram 推送服务
├── media-proxy.js    # 媒体资源代理
├── queue-worker.js   # 任务队列消费者（BullMQ）
└── scheduler.js      # 定时调度器（node-cron）
```

## ⚙️ 配置说明

### 核心配置

| 变量 | 必需 | 说明 | 示例 |
|------|------|------|------|
| `CHANNELS` | ✅ | Telegram 频道列表（逗号分隔） | `miantiao_me,zaihuapd` |
| `SITE_NAME` | ✅ | 站点名称 | `Multi-Channel Broadcast` |
| `API_SECRET_KEY` | ✅ | API 密钥（管理接口验证） | `your_secret_key` |
| `LOCALE` | ❌ | 语言设置 | `zh-cn`（默认） |
| `TIMEZONE` | ❌ | 时区 | `Asia/Shanghai`（默认） |

### 抓取配置

| 变量 | 必需 | 说明 | 默认值 |
|------|------|------|--------|
| `TELEGRAM_HOST` | ❌ | Telegram 主机列表 | `t.me,telegram.dog` |
| `FILTER_ENABLED` | ❌ | 关键词过滤开关 | `false` |

### 推送配置

| 变量 | 必需 | 说明 |
|------|------|------|
| `TELEGRAM_PUSH_ENABLED` | ❌ | 启用 Telegram 推送 |
| `TELEGRAM_BOT_TOKEN` | ❌ | Bot Token |
| `TELEGRAM_PUSH_CHANNEL_ID` | ❌ | 目标推送频道 |

### Docker 配置

| 变量 | 必需 | 说明 | 默认值 |
|------|------|------|--------|
| `DOCKER` | ✅ | Docker 模式标识 | `true` |
| `DATA_DIR` | ✅ | 数据目录 | `/app/data` |
| `CACHE_DIR` | ✅ | 缓存目录 | `/app/cache` |
| `HOST` | ✅ | 监听地址 | `0.0.0.0` |
| `PORT` | ✅ | 监听端口 | `4321` |

### 队列配置

| 变量 | 必需 | 说明 | 默认值 |
|------|------|------|--------|
| `QUEUE_MEMORY_MODE` | ❌ | 内存模式（无需 Redis） | `true` |
| `QUEUE_CONCURRENCY` | ❌ | 并发抓取数 | `5` |

> 💡 **提示**: 小型部署推荐使用内存模式（`QUEUE_MEMORY_MODE=true`），无需额外配置 Redis。

## 🔧 常用命令

### 服务管理

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f app

# 进入容器
docker exec -it multi-channel-broadcast sh
```

### 数据管理

```bash
# 备份数据库
docker exec multi-channel-broadcast sqlite3 /app/data/app.db ".dump" > backup.sql

# 恢复数据库
cat backup.sql | docker exec -i multi-channel-broadcast sqlite3 /app/data/app.db

# 重置数据（删除所有数据）
docker-compose down -v
docker-compose up -d
```

### 构建管理

```bash
# 重新构建镜像
docker-compose build --no-cache

# 查看镜像信息
docker images multi-channel-broadcast
```

## 🌐 API 端点

### 公共接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/channels` | GET | 获取频道列表 |
| `/api/posts` | GET | 获取帖子列表 |
| `/api/posts/search` | GET | 搜索帖子 |
| `/api/post/:id` | GET | 获取单个帖子 |

### 管理接口（需要 API Secret）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/init` | GET | 初始化并全量抓取 |
| `/api/regrab` | GET | 重新抓取并更新 |

### 媒体代理

| 端点 | 方法 | 说明 |
|------|------|------|
| `/img-proxy?url=xxx` | GET | 图片代理 |
| `/static/*` | GET | 视频/音频代理 |

## 📊 架构图

```
┌─────────────────────────────────────────┐
│         Docker Container                │
│  ┌─────────────────────────────────┐   │
│  │   Node.js 主进程                 │   │
│  │  ┌────────────┐  ┌────────────┐ │   │
│  │  │ Astro SSR  │  │ API Server │ │   │
│  │  │   前端     │  │  Express   │ │   │
│  │  └────────────┘  └────────────┘ │   │
│  │  ┌────────────┐  ┌────────────┐ │   │
│  │  │ Scheduler  │  │   Queue    │ │   │
│  │  │   (Cron)   │  │   Worker   │ │   │
│  │  └────────────┘  └────────────┘ │   │
│  │  ┌────────────┐  ┌────────────┐ │   │
│  │  │  Grabber   │  │  Pusher    │ │   │
│  │  │  (抓取)    │  │  (推送)    │ │   │
│  │  └────────────┘  └────────────┘ │   │
│  └─────────────┬──────────────────┘   │
│                │                       │
│  ┌─────────────▼──────────────────┐   │
│  │     SQLite Database            │   │
│  │  - posts                       │   │
│  │  - channel_meta                │   │
│  │  - push_logs                   │   │
│  └────────────────────────────────┘   │
└─────────────────────────────────────────┘
           │
           ▼
    ┌──────────────┐
    │  外部服务     │
    │  - Telegram  │
    │  - Bot API   │
    └──────────────┘
```

## 🔍 故障排查

### 常见问题

#### 1. 容器启动失败

**症状**: 容器不断重启

**解决方案**:
```bash
# 查看详细日志
docker-compose logs app

# 检查配置文件
docker-compose config

# 检查端口占用
netstat -tlnp | grep 4321
```

#### 2. 抓取失败

**症状**: 日志显示 "All hosts failed"

**解决方案**:
- 检查网络连通性
- 添加更多 Telegram Host
- 检查是否被 Telegram 风控

#### 3. 推送失败

**症状**: 新帖子没有推送

**解决方案**:
```bash
# 检查配置
docker exec multi-channel-broadcast env | grep TELEGRAM_PUSH

# 测试 Bot Token
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/getMe"
```

#### 4. 数据库错误

**症状**: API 返回 500 错误

**解决方案**:
```bash
# 检查数据库文件
docker exec multi-channel-broadcast ls -lh /app/data/

# 检查数据库连接
docker exec multi-channel-broadcast sqlite3 /app/data/app.db ".tables"
```

### 获取帮助

```bash
# 查看完整文档
cat .monkeycode/docs/DOCKER_DEPLOYMENT.md

# 查看技术设计
cat .monkeycode/specs/docker-deployment/design.md
```

## 🔒 安全建议

1. **修改默认密钥**: 设置强密码的 `API_SECRET_KEY`
2. **限制 API 访问**: 在防火墙层面限制管理接口访问
3. **定期备份**: 定期备份数据库
4. **监控日志**: 定期检查日志发现异常
5. **更新镜像**: 定期更新 Docker 镜像获取安全补丁

## 📈 性能优化

### 启用 Redis 队列（高并发）

```yaml
# docker-compose.yml
services:
  app:
    environment:
      - QUEUE_MEMORY_MODE=false
      - REDIS_HOST=redis
  
  redis:
    profiles: []  # 移除 profile，使 Redis 始终启动
```

### 调整并发数

```bash
# .env
QUEUE_CONCURRENCY=10
QUEUE_LIMIT_MAX=100
```

### 数据库优化

已自动启用 WAL 模式，无需额外配置。

## 📝 日志级别

```bash
# 开发环境：查看详细日志
docker-compose logs -f app | grep -E "✅|🚀|📦"

# 生产环境：只看错误
docker-compose logs -f app | grep "❌"
```

## 🔄 升级指南

```bash
# 停止旧服务
docker-compose down

# 拉取新代码
git pull

# 重新构建
docker-compose build --no-cache

# 启动新服务
docker-compose up -d

# 验证服务
curl http://localhost:4321/api/health
```

## 📚 相关文档

- [完整部署指南](.monkeycode/docs/DOCKER_DEPLOYMENT.md)
- [技术设计文档](.monkeycode/specs/docker-deployment/design.md)
- [需求文档](.monkeycode/specs/docker-deployment/requirements.md)
- [任务清单](.monkeycode/specs/docker-deployment/tasklist.md)

## 🙋 获取帮助

如有问题，请查看：
1. 日志输出：`docker-compose logs -f app`
2. 健康检查：`curl http://localhost:4321/api/health`
3. 完整文档：`.monkeycode/docs/DOCKER_DEPLOYMENT.md`

---

**最后更新**: 2026-05-21
