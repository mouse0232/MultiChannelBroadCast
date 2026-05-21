# Docker 部署快速开始指南

## 目录

- [前置要求](#前置要求)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [常用命令](#常用命令)
- [故障排查](#故障排查)

---

## 前置要求

- Docker Engine 20.10+
- Docker Compose v2.0+
- 至少 2GB 可用内存
- 至少 10GB 可用磁盘空间

---

## 快速开始

### 步骤 1: 复制配置文件

```bash
cp .env.example .env
```

### 步骤 2: 编辑配置文件

编辑 `.env` 文件，至少配置 spacers以下配置：

```bash
# 必填：频道列表
CHANNELS=miantiao_me,zaihuapd,sspai

# 可选：启用 Telegram 推送
TELEGRAM_PUSH_ENABLED=true
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_PUSH_CHANNEL_ID=@your_channel
```

### 步骤 3: 启动服务

```bash
docker-compose up -d
```

### 步骤 4: 初始化数据

```bash
curl http://localhost:4321/api/init \
  -H "X-API-Secret: your_secret_key"
```

### 步骤 5: 查看日志

```bash
docker-compose logs -f app
```

### 步骤 6: 访问服务

打开浏览器访问：`http://localhost:4321`

---

## 配置说明

### 核心配置

| 变量 | 必需 | 说明 |
|------|------|------|
| `CHANNELS` | ✅ | 逗号分隔的 Telegram 频道列表 |
| `SITE_NAME` | ✅ | 站点名称 |
| `LOCALE` | ✅ | 语言设置（默认 `zh-cn`） |
| `TIMEZONE` | ✅ | 时区（默认 `Asia/Shanghai`） |

### 抓取配置

| 变量 | 必需 | 说明 |
|------|------|------|
| `TELEGRAM_HOST` | ✅ | Telegram 主机列表（默认 `t.me,telegram.dog`） |
| `FILTER_ENABLED` | ❌ | 是否启用关键词过滤 |

### 推送配置

| 变量 | 必需 | 说明 |
|------|------|------|
| `TELEGRAM_PUSH_ENABLED` | ❌ | 是否启用推送 |
| `TELEGRAM_BOT_TOKEN` | ❌ | Telegram Bot Token |
| `TELEGRAM_PUSH_CHANNEL_ID` | ❌ | 目标推送频道 ID |

### Docker 配置

| 变量 | 必需 | 说明 |
|------|------|------|
| `DOCKER` | ✅ | 固定值 `true` |
| `DATA_DIR` | ✅ | 数据目录（默认 `/app/data`） |
| `CACHE_DIR` | ✅ | 缓存目录（默认 `/app/cache`） |
| `HOST` | ✅ | 监听地址（默认 `0.0.0.0`） |
| `PORT` | ✅ | 监听端口（默认 `4321`） |

### 队列配置

| 变量 | 必需 | 说明 |
|------|------|------|
| `QUEUE_MEMORY_MODE` | ❌ | 使用内存模式队列（默认 `true`，无需 Redis） |
| `REDIS_HOST` | ❌ | Redis 主机（仅当 `QUEUE_MEMORY_MODE=false` 时需要） |
| `RED IS_PORT` | ❌ | Redis 端口（默认 `6379`） |
| `QUEUE_CONCURRENCY` | ❌ | 并发抓取数（默认 `5`） |

### 安全配置

| 变量 | 必需 | 说明 |
|------|------|------|
| `API_SECRET_KEY` | ✅ | API 密钥（管理接口验证） |

---

## 常用命令

### 启动服务

```bash
docker-compose up -d
```

### 停止服务

```bash
docker-compose down
```

### 重启服务

```bash
docker-compose restart
```

### 查看日志

```bash
docker-compose logs -f app
```

### 查看容器状态

```bash
docker-compose ps
```

### 进入容器

```bash
docker exec -it multi-channel-broadcast sh
```

### 重新构建

```bash
docker-compose build --no-cache
docker-compose up -d
```

### 备份数据库

```bash
docker exec multi-channel-broadcast sqlite3 /app/data/app.db ".dump" > backup.sql
```

### 恢复数据库

```bash
cat backup.sql | docker exec -i multi-channel-broadcast sqlite3 /app/data/app.db
```

---

## API 端点

### 健康检查

```bash
curl http://localhost:4321/api/health
```

### 获取频道列表

```bash
curl http://localhost:4321/api/channels
```

### 获取帖子列表

```bash
curl "http://localhost:4321/api/posts?limit=20"
```

### 搜索帖子

```bash
curl "http://localhost:4321/api/posts/search?q=关键词&limit=20"
```

### 初始化抓取

```bash
curl http://localhost:4321/api/init \
  -H "X-API-Secret: your_secret_key"
```

### 重新抓取

```bash
curl "http://localhost:4321/api/regrab?limit=50" \
  -H "X-API-Secret: your_secret_key"
```

---

## 故障排查

### 问题 1: 容器启动失败

**症状**: 容器不断重启

**排查步骤**:

```bash
# 查看详细日志
docker-compose logs app

# 检查配置文件
docker-compose config

# 检查端口占用
docker-compose ps
```

**常见原因**:
- 端口被占用
- 配置文件格式错误
- 缺少必需的环境变量

### 问题 2: 抓取失败

**症状**: 日志显示 "All hosts failed"

**排查步骤**:

```bash
# 检查网络连接
docker exec multi-channel-broadcast ping t.me

# 检查 TELEGRAM_HOST 配置
docker exec multi-channel-broadcast env | grep TELEGRAM_HOST
```

**解决方案**:
- 检查网络连通性
- 添加更多 Telegram Host
- 检查是否被 Telegram 风控

### 问题 3: 推送失败

**症状**: 新帖子没有推送到 Telegram

**排查步骤**:

```bash
# 检查推送配置
docker exec multi-channel-broadcast env | grep TELEGRAM_PUSH

# 手动测试 Bot Token
curl "https://api.telegram.org/botYOUR_BOT_TOKEN/getMe"
```

**解决方案**:
- 确保 `TELEGRAM_PUSH_ENABLED=true`
- 确保 Bot Token 正确
- 确保 Bot 是目标频道的管理员

### 问题 4: 数据库错误

**症状**: API 返回 500 错误

**排查步骤**:

```bash
# 检查数据库文件
docker exec multi-channel-broadcast ls -lh /app/data/

# 检查数据库连接
docker exec multi-channel-broadcast sqlite3 /app/data/app.db ".tables"
```

**解决方案**:
- 检查数据卷权限
- 重建数据库（删除 `app-data` 卷）
- 从备份恢复

### 问题 5: 内存占用过高

**症状**: 容器内存超过 1GB

**排查步骤**:

```bash
# 查看内存使用
docker stats multi-channel-broadcast
```

**解决方案**:
- 减少频道数量
- 降低抓取频率
- 在 docker-compose.yml 中设置内存限制

---

## 性能优化

### 启用 Redis 队列（高并发场景）

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
QUEUE_LIMIT_DURATION=60000
```

### 启用 WAL 模式（数据库优化）

数据库默认已启用 WAL 模式，无需额外配置。

---

## 数据持久化

### 数据卷位置

- **数据库**: `app-data` 卷（/app/data）
- **缓存**: `app-cache` 卷（/app/cache）
- **Redis**: `redis-data` 卷（/data）

### 备份策略

建议定期备份数据卷：

```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
docker exec multi-channel-broadcast sqlite3 /app/data/app.db ".dump" > backup_${DATE}.sql

# 保留最近 7 天的备份
find . -name "backup_*.sql" -mtime +7 -delete
```

---

## 升级指南

### 从旧版本升级

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

---

## 安全建议

1. **修改默认密钥**: 设置强密码的 `API_SECRET_KEY`
2. **限制 API 访问**: 在防火墙层面限制管理接口访问
3. **定期备份**: 定期备份数据库
4. **监控日志**: 定期检查日志发现异常
5. **更新镜像**: 定期更新 Docker 镜像获取安全补丁

---

## 获取帮助

- [技术设计文档](.monkeycode/specs/docker-deployment/design.md)
- [需求文档](.monkeycode/specs/docker-deployment/requirements.md)
- [任务清单](.monkeycode/specs/docker-deployment/tasklist.md)

---

## 故障报告模板

```
**问题描述**:
简要描述遇到的问题

**环境信息**:
- Docker 版本：
- 系统版本：
- 镜像版本：

**复现步骤**:
1. 执行 xxx 命令
2. 出现 xxx 错误

**日志输出**:
```
粘贴相关日志
```

**已尝试的解决方案**:
1. 尝试了 xxx，未解决
2. 尝试了 xxx，未解决
```
