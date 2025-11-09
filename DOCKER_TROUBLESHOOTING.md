# Docker 部署故障排除指南

## Docker Hub 连接失败 (EOF 错误)

### 问题描述
```
ERROR: failed to solve: failed to fetch oauth token: Post "https://auth.docker.io/token": EOF
```

### 解决方案

#### 方案 1: 配置 Docker 镜像加速器 (推荐)

1. **打开 Docker Desktop 设置**
   - 点击右上角设置图标 → Settings
   - 选择 Docker Engine

2. **添加镜像源配置**
   编辑 JSON 配置,添加以下内容:
   ```json
   {
     "registry-mirrors": [
       "https://docker.m.daocloud.io",
       "https://dockerproxy.com",
       "https://docker.mirrors.ustc.edu.cn",
       "https://docker.nju.edu.cn"
     ]
   }
   ```

3. **重启 Docker Desktop**
   - 点击 Apply & Restart
   - 等待 Docker 重启完成

4. **重新构建镜像**
   ```bash
   docker build -t multi-channel-broadcast .
   ```

#### 方案 2: 使用代理

如果你有 HTTP 代理,可以配置 Docker 使用代理:

1. **Windows (Docker Desktop)**
   - Settings → Resources → Proxies
   - 启用 Manual proxy configuration
   - 填入代理地址,如: `http://127.0.0.1:7890`

2. **重启 Docker 并重试构建**

#### 方案 3: 使用备用基础镜像

修改 Dockerfile 使用阿里云镜像:

```dockerfile
FROM registry.cn-hangzhou.aliyuncs.com/library/node:20-alpine AS base
# 其余配置保持不变
```

#### 方案 4: 离线构建

如果网络始终有问题,可以:

1. **使用已有的 Node.js 环境直接运行**
   ```bash
   pnpm install
   pnpm build
   node dist/server/entry.mjs
   ```

2. **或者在网络好的环境构建后导入镜像**
   ```bash
   # 在其他机器导出
   docker save multi-channel-broadcast > image.tar
   
   # 在本机导入
   docker load < image.tar
   ```

## 其他常见 Docker 问题

### 构建缓慢
- 使用 `.dockerignore` 减少构建上下文
- 已创建 `.dockerignore` 文件排除不必要的文件

### 容器启动失败
- 检查 `.env` 文件是否配置正确
- 查看日志: `docker logs multi-channel-broadcast`
- 确保端口 4321 未被占用

### 环境变量不生效
- 确认 `.env` 文件在项目根目录
- 使用 `docker-compose` 时会自动加载 `.env`
- 使用 `docker run` 需要手动指定 `-e` 或 `--env-file`

## 测试 Docker 配置

```bash
# 测试 Docker 是否能拉取镜像
docker pull hello-world

# 测试构建
docker build -t multi-channel-broadcast .

# 测试运行
docker run -d -p 4321:4321 --env-file .env multi-channel-broadcast

# 查看日志
docker logs -f multi-channel-broadcast
```

## 建议的构建命令

```bash
# 方式1: 使用 Docker Compose (推荐)
docker-compose up -d --build

# 方式2: 手动构建和运行
docker build -t multi-channel-broadcast .
docker run -d \
  --name multi-channel-broadcast \
  -p 4321:4321 \
  --env-file .env \
  --restart unless-stopped \
  multi-channel-broadcast

# 查看运行状态
docker ps
docker logs -f multi-channel-broadcast
```
