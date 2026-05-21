# Docker 镜像自动发布指南

## 📦 镜像信息

### 镜像仓库

- **GitHub Container Registry (GHCR)**: `ghcr.io/mouse0232/MultiChannelBroadCast`
- **Docker Hub** (可选): `docker.io/mouse0232/multi-channel-broadcast`

### 镜像标签（Tags）

| 标签 | 说明 | 构建时机 |
|------|------|---------|
| `latest` | 最新稳定版 | main 分支推送时 |
| `v1.0.0` | 语义化版本 | 创建 vX.Y.Z 标签时 |
| `v1.0` | 主版本.次版本 | 创建版本标签时 |
| `docker-deployment` | 开发分支 | docker-deployment 分支推送时 |
| `<commit-sha>` | 提交哈希 | PR 或分支推送时 |

---

## 🚀 自动构建触发条件

### 1. 推送到 main 分支

```bash
git checkout main
git pull
# ... 修改代码 ...
git commit -m "fix: 修复问题"
git push
```

**触发**: 
- ✅ 构建镜像
- ✅ 推送标签：`latest`, `<commit-sha>`

### 2. 推送到 docker-deployment 分支

```bash
git checkout docker-deployment
# ... 修改代码 ...
git commit -m "feat: 新功能"
git push
```

**触发**: 
- ✅ 构建镜像
- ✅ 推送标签：`docker-deployment`, `<commit-sha>`

### 3. 创建版本标签

```bash
git tag v1.0.0
git push origin v1.0.0
```

**触发**: 
- ✅ 构建镜像
- ✅ 推送标签：`v1.0.0`, `v1.0`, `latest`

---

## 📥 用户使用镜像

### 方法 1: 一键安装脚本（推荐）

```bash
# 下载安装脚本
curl -fsSL https://raw.githubusercontent.com/mouse0232/MultiChannelBroadCast/main/install.sh -o install.sh

# 执行安装
chmod +x install.sh
./install.sh
```

### 方法 2: 手动使用 Docker

```bash
# 创建配置目录
mkdir -p ~/multi-channel-broadcast
cd ~/multi-channel-broadcast

# 下载配置
curl -LO https://raw.githubusercontent.com/mouse0232/MultiChannelBroadCast/main/docker-compose.yml
curl -LO https://raw.githubusercontent.com/mouse0232/MultiChannelBroadCast/main/.env.example

# 配置环境变量
cp .env.example .env
vim .env  # 编辑配置

# 拉取镜像并启动
docker pull ghcr.io/mouse0232/MultiChannelBroadCast:latest
docker-compose up -d
```

### 方法 3: 使用 docker run

```bash
docker run -d \
  --name multi-channel-broadcast \
  -p 4321:4321 \
  -v ~/multi-channel-broadcast/data:/app/data \
  -e CHANNELS=miantiao_me,zaihuapd \
  -e API_SECRET_KEY=your_secret \
  ghcr.io/mouse0232/MultiChannelBroadCast:latest
```

---

## 🔧 GitHub Actions 配置

### 工作流程文件

位置：`.github/workflows/docker-build.yml`

### 构建选项

```yaml
- platforms: linux/amd64,linux/arm64  # 支持多种架构
- cache-from: type=gha              # GitHub Actions 缓存
- cache-to: type=gha,mode=max       # 最大化缓存
```

### 支持的架构

| 架构 | 平台 | 支持状态 |
|------|------|---------|
| `amd64` | x86_64 | ✅ 支持 |
| `arm64` | ARM64 | ✅ 支持 |
| `arm/v7` | ARMv7 | ❌ 暂不支持 |

---

## 📊 查看构建状态

### 1. GitHub Actions

访问：`https://github.com/mouse0232/MultiChannelBroadCast/actions`

### 2. 镜像列表

访问：`https://github.com/users/mouse0232/packages/container/package/MultiChannelBroadCast`

### 3. 查看镜像信息

```bash
# 查看本地镜像
docker images | grep multi-channel

# 查看镜像详情
docker inspect ghcr.io/mouse0232/MultiChannelBroadCast:latest
```

---

## 🔐 权限配置

### 自动权限

GitHub Actions 自动获取以下权限：
- ✅ `contents: read` - 读取代码
- ✅ `packages: write` - 写入镜像包

### 无需手动配置

工作流已配置 `secrets.GITHUB_TOKEN`，无需手动设置密钥。

---

## 🎯 发布流程

### 发布新版本

1. **更新版本号**
   ```bash
   # 编辑 package.json 或其他版本文件
   git commit -m "chore: release v1.0.0"
   ```

2. **创建 Git 标签**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. **自动触发构建**
   - ✅ GitHub Actions 检测到标签
   - ✅ 自动构建多架构镜像
   - ✅ 推送镜像到 GHCR
   - ✅ 标记为 `v1.0.0`, `v1.0`, `latest`

4. **发布 Release**
   - 在 GitHub 上创建 Release
   - 描述新功能和变更

---

## 📝 常见问题

### Q1: 镜像构建失败？

**A**: 检查 Actions 日志：
```
https://github.com/mouse0232/MultiChannelBroadCast/actions
```

常见原因：
- ❌ Dockerfile 语法错误
- ❌ 依赖安装失败
- ❌ 磁盘空间不足

### Q2: 镜像拉取失败？

**A**: 检查 authentication：
```bash
# 登录到 GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u $GITHUB_USERNAME --password-stdin
```

### Q3: 如何删除旧镜像？

**A**: 在 GitHub Packages 页面删除：
```
https://github.com/users/mouse0232/packages/container/package/MultiChannelBroadCast
```

---

## 📈 镜像大小优化

### 当前镜像大小

| 阶段 | 大小 |
|------|------|
| 开发镜像 | ~500MB |
| 生产镜像 | ~200MB |

### 优化方法

1. **多阶段构建** ✅ 已实现
2. **使用 Alpine 基础镜像** ✅ 已实现
3. **清理缓存** ✅ 已实现
4. **压缩层数** ✅ 已优化

---

## 🔄 更新策略

### 镜像更新

```bash
# 拉取最新镜像
docker pull ghcr.io/mouse0232/MultiChannelBroadCast:latest

# 重启容器
docker-compose down
docker-compose up -d

# 或者
docker-compose pull
docker-compose up -d
```

### 自动更新（可选）

使用 Watchtower：
```bash
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  multi-channel-broadcast
```

---

## 📞 技术支持

- 📖 [Docker 部署文档](.monkeycode/docs/DOCKER_DEPLOYMENT.md)
- 📖 [使用指南](README.Docker.md)
- 📖 [测试指南](DOCKER_TESTING_GUIDE.md)
- 🐛 [Issue 反馈](https://github.com/mouse0232/MultiChannelBroadCast/issues)

---

**最后更新**: 2026-05-21  
**维护者**: @mouse0232
