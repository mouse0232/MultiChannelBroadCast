# Docker 部署测试指南

## 概述

本文档提供 Docker 部署方案的完整测试流程，确保所有功能正常工作。

## 前置准备

### 环境要求

- Docker Engine 20.10+
- Docker Compose v2.0+  
- Node.js 20+（本地测试用）
- 至少 2GB 可用内存
- 至少 10GB 可用磁盘空间

### 检查环境

```bash
# 检查 Docker 版本
docker --version
docker-compose version

# 检查端口占用
netstat -tlnp | grep 4321
```

---

## 阶段 1: 代码修复

由于 ESM 循环依赖问题，需要先修复代码：

### 1.1 修复 api-server.js

编辑 `src/worker-mock/api-server.js`，修改 cheerio 加载方式：

```javascript
// 将顶部的 cheerio 导入删除
// 在 parsePosts 函数内部动态加载
async function parsePosts(html, channel, lastMsgId, workerUrl) {
  const cheerio = (await import('cheerio')).default
  const $ = cheerio.load(html)
  // ... 其余代码
}
```

### 1.2 修复过滤规则加载

编辑 `src/lib/KeywordFilter.js`（如果存在），使用 ES6 模块方式加载 JSON：

```javascript
import { readFileSync } from 'fs'
import { join } from 'path'

export function safeLoadFilterRules() {
  try {
    const filterRulesPath = join(process.cwd(), 'filter-rules.json')
    const content = readFileSync(filterRulesPath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.warn('⚠️ Failed to load filter-rules.json:', error.message)
    return { global: { mode: 'blacklist', rules: [] }, channels: {} }
  }
}
```

---

## 阶段 2: 本地测试（可选）

### 2.1 安装依赖

```bash
cd /workspace
pnpm install
```

### 2.2 设置环境变量

创建 `.env` 文件：

```bash
DOCKER=true
DATA_DIR=./test-data
CHANNELS=miantiao_me,zaihuapd
API_SECRET_KEY=test_secret
QUEUE_MEMORY_MODE=true
TELEGRAM_HOST=t.me,telegram.dog
```

### 2.3 测试单个模块

```bash
# 测试数据库
node -e "
import('./src/worker-mock/database.js').then(async ({ initializeDatabase, closeDatabase }) => {
  const db = initializeDatabase()
  console.log('✅ Database OK')
  closeDatabase()
}).catch(console.error)
"
```

### 2.4 测试主程序

```bash
timeout 10 node src/worker-mock/index.js 2>&1 | head -50
```

**预期输出**:
```
🚀 Starting Multi-Channel Broadcast (Docker Mode)
📦 Initializing database at: ./test-data/app.db
📋 Tables created: posts, channel_meta, push_logs
✅ Database initialized
🌐 API server running on http://0.0.0.0:4321
```

---

## 阶段 3: Docker 构建测试

### 3.1 构建镜像

```bash
cd /workspace
docker-compose build --no-cache
```

**预期结果**:
- 构建成功
- 镜像大小约 300-500MB
- 无构建错误

**常见问题**:
1. **构建失败**: 检查 Dockerfile 中是否有语法错误
2. **镜像过大**: 清理缓存，使用多阶段构建
3. **依赖安装失败**: 检查网络连接，使用国内镜像源

### 3.2 查看镜像信息

```bash
docker images multi-channel-broadcast
docker history multi-channel-broadcast:latest
```

---

## 阶段 4: Docker 运行测试

### 4.1 启动服务

```bash
docker-compose up -d
```

**预期输出**:
```
[+] Running 2/2
 ✔ Container multi-channel-redis   Started
 ✔ Container multi-channel-broadcast Started
```

### 4.2 查看日志

```bash
# 实时查看日志
docker-compose logs -f app

# 查看最近 50 行
docker-compose logs --tail=50 app
```

**预期日志**:
```
🚀 Starting Multi-Channel Broadcast (Docker Mode)
==================================================
📦 Initializing database at: /app/data/app.db
📋 Tables created: posts, channel_meta, push_logs
📈 Indexes created
✅ Database initialized successfully
✅ [1/4] Database initialized
🌐 API server running on http://0.0.0.0:4321
✅ [2/4] API server running
📭 Using in-memory queue (simplified mode)
✅ Queue worker started (Memory mode)
✅ [3/4] Queue worker started
⏰ Starting scheduler with cron: * * * * *
✅ [4/4] Scheduler started (Cron: * * * * *)
==================================================
🎉 All services started successfully
```

### 4.3 检查服务状态

```bash
# 容器状态
docker-compose ps

# 网络
docker network ls | grep app-network

# 数据卷
docker volume ls | grep app
```

**预期结果**:
- 容器状态为 `Up`
- 网络正常创建
- 数据卷正常创建

---

## 阶段 5: 功能测试

### 5.1 健康检查

```bash
curl -s http://localhost:4321/api/health | jq .
```

**预期响应**:
```json
{
  "status": "healthy",
  "checks": {
    "database": "ok"
  }
}
```

### 5.2 频道列表

```bash
curl -s http://localhost:4321/api/channels | jq .
```

**预期响应**:
```json
{
  "channels": [
    {
      "channel": "miantiao_me",
      "last_msg_id": null,
      "title": null,
      "avatar": null
    }
  ]
}
```

### 5.3 帖子列表

```bash
curl -s "http://localhost:4321/api/posts?limit=10" | jq .
```

**预期响应**:
```json
{
  "posts": []
}
```

### 5.4 初始化抓取

```bash
curl -s http://localhost:4321/api/init \
  -H "X-API-Secret: test_secret" | jq .
```

**预期响应**:
```json
{
  "status": "ok",
  "message": "Init complete. Refresh your website.",
  "totalChannels": 2,
  "successCount": 2
}
```

**查看日志**:
```bash
docker-compose logs app | grep -E "🚀|✅|📦"
```

### 5.5 抓取测试

等待 1-2 分钟，让 Cron 触发抓取：

```bash
# 查看定时任务日志
docker-compose logs app | grep "Cron triggered"

# 查看抓取日志
docker-compose logs app | grep "Processing channel"

# 查看保存日志
docker-compose logs app | grep "Saved.*posts"
```

**预期结果**:
- 每分钟触发一次 Cron
- 每个频道都处理
- 有帖子保存成功

### 5.6 查询帖子

```bash
# 查询最新帖子
curl -s "http://localhost:4321/api/posts?limit=5" | jq '.posts[] | {id, title}'
```

**预期结果**:
- 返回 JSON 数组
- 包含帖子 ID 和标题

---

## 阶段 6: 持久化测试

### 6.1 重启测试

```bash
# 停止服务
docker-compose down

# 重新启动
docker-compose up -d

# 等待服务启动
sleep 5

# 检查数据
curl -s "http://localhost:4321/api/posts?limit=5" | jq '.posts | length'
```

**预期结果**:
- 数据未丢失
- 帖子数量与重启前相同

### 6.2 备份恢复测试

```bash
# 备份数据库
docker exec multi-channel-broadcast sqlite3 /app/data/app.db ".dump" > backup.sql

# 确认备份文件
ls -lh backup.sql

# 清空数据
docker-compose down -v

# 恢复数据
docker-compose up -d
sleep 5
cat backup.sql | docker exec -i multi-channel-broadcast sqlite3 /app/data/app.db

# 验证恢复
curl -s "http://localhost:4321/api/posts?limit=5" | jq '.posts | length'
```

**预期结果**:
- 备份成功
- 恢复成功
- 帖子数量与备份前相同

---

## 阶段 7: 性能测试

### 7.1 资源消耗

```bash
# 查看资源使用
docker stats multi-channel-broadcast --no-stream

# 或使用
docker inspect multi-channel-broadcast --format '{{.State.Health.Status}}'
```

**预期结果**:
- 内存占用：< 500MB
- CPU 占用（闲时）：< 5%
- 磁盘占用：< 1GB

### 7.2 API 响应时间

```bash
# 测试多次请求
time for i in {1..10}; do
  curl -s http://localhost:4321/api/health > /dev/null
done

# 或使用 Apache Bench
ab -n 100 -c 10 http://localhost:4321/api/health
```

**预期结果**:
- 平均响应时间：< 100ms
- 无 5xx 错误

---

## 阶段 8: 故障恢复测试

### 8.1 网络故障模拟

```bash
# 断开网络连接（容器级别）
docker network disconnect app-network multi-channel-broadcast

# 等待 1 分钟

# 恢复网络
docker network connect app-network multi-channel-broadcast

# 查看是否自动恢复
docker-compose logs app | tail -20
```

**预期结果**:
- 自动重连
- 服务恢复

### 8.2 数据库修复

```bash
# 模拟数据库损坏
docker exec multi-channel-broadcast sh -c "echo 'corrupt' > /app/data/app.db"

# 恢复备份
docker exec multi-channel-broadcast sqlite3 /app/data/app.db ".dump" > backup.sql

# 查看日志
docker-compose logs app | grep "Database"
```

**预期结果**:
- 无法打开损坏的数据库
- 需要手动恢复或重建

---

## 阶段 9: 清理工作

### 9.1 清理测试数据

```bash
# 停止服务
docker-compose down

# 删除数据卷
docker volume rm multi-channel-broadcast-app-data
docker volume rm multi-channel-broadcast-app-cache

# 删除镜像
docker rmi multi-channel-broadcast:latest
```

### 9.2 清理本地文件

```bash
# 删除测试数据
rm -rf ./test-data
rm -f backup.sql

# 删除 .env
rm -f .env
```

---

## 测试报告模板

### 测试结果

| 测试项 | 状态 | 备注 |
|--------|------|------|
| 镜像构建 | ✅/❌ | |
| 服务启动 | ✅/❌ | |
| 健康检查 | ✅/❌ | |
| API 功能 | ✅/❌ | |
| 抓取功能 | ✅/❌ | |
| 数据持久化 | ✅/❌ | |
| 备份恢复 | ✅/❌ | |
| 资源消耗 | ✅/❌ | |

### 问题记录

**问题 1**: [描述问题]
- **现象**: [具体表现]
- **原因**: [分析原因]
- **解决方案**: [解决方法]

**问题 2**: ...

### 性能数据

- 镜像大小: XXX MB
- 启动时间: XXX 秒
- 内存占用: XXX MB
- API 响应时间: XXX ms

---

## 常见问题

### Q1: 容器无法启动

**A**: 查看日志 `docker-compose logs app`，检查端口占用或配置错误。

### Q2: 抓取失败

**A**: 检查网络连接，确认 TELEGRAM_HOST 配置正确。

### Q3: 推送不成功

**A**: 检查 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_PUSH_CHANNEL_ID` 配置。

### Q4: 内存占用过高

**A**: 减少频道数量，降低抓取频率，或在 docker-compose.yml 中设置内存限制。

---

## 总结

完成以上所有测试后，可以确认 Docker 部署方案正常工作。

**下一步**:
1. 修复测试中发现的问题
2. 优化性能瓶颈
3. 完善监控告警
4. 编写生产部署指南

---

**最后更新**: 2026-05-21  
**文档版本**: 1.0
