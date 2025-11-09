# Docker 镜像优化指南

## 当前镜像大小分析

| 组件 | 大小 | 占比 |
|------|------|------|
| 基础镜像 (Node.js 22 Alpine) | ~173MB | 32% |
| node_modules (生产依赖) | ~250MB | 47% |
| 应用代码 (dist) | ~4MB | 1% |
| 其他 | ~107MB | 20% |
| **总计** | **534MB** | **100%** |

## 优化方案

### 方案 1: 使用 Dockerfile.slim (推荐)

**目标大小**: 200-300MB

**优化措施**:
1. 使用 `gcr.io/distroless/nodejs22` 基础镜像 (~50MB)
2. 清理 pnpm 缓存: `pnpm store prune`
3. 移除不必要的系统包

**使用方法**:
```bash
# 构建精简镜像 (distroless 版本)
docker build -f Dockerfile.slim --target runtime-distroless -t multi-channel-broadcast:slim .

# 备用: Alpine 版本
docker build -f Dockerfile.slim --target runtime-alpine -t multi-channel-broadcast:slim .
```

**注意**: Distroless 镜像没有 shell,调试时使用 Alpine 版本。

---

### 方案 2: 移除大型依赖 (激进)

**目标大小**: 150-200MB

**优化措施**:
1. 移除 `@sentry/astro` (~50MB) - 改为 devDependency
2. 评估是否需要 `prismjs` 和 `cheerio`
3. 使用 `package.slim.json`

**步骤**:
```bash
# 1. 备份原 package.json
cp package.json package.full.json

# 2. 使用精简版
cp package.slim.json package.json

# 3. 重新安装依赖
pnpm install

# 4. 测试构建
pnpm build

# 5. 构建 Docker 镜像
docker build -f Dockerfile.slim --target runtime-alpine -t multi-channel-broadcast:minimal .
```

**影响**:
- ❌ 失去 Sentry 错误追踪 (生产环境)
- ✅ 镜像更小,启动更快
- ✅ 部署和拉取更快

---

### 方案 3: 使用输出 Standalone 模式 (最激进)

**目标大小**: < 150MB

修改 `astro.config.mjs`:
```javascript
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone' // 生成独立可执行文件
  }),
  // ...
})
```

**优势**:
- 打包所有依赖到单个文件
- 只需要 Node.js 运行时
- 镜像可以 < 100MB

**劣势**:
- 首次加载可能较慢
- 某些动态依赖可能有问题

---

## 实际测试各方案

### 测试 Distroless 版本
```bash
# 构建
docker build -f Dockerfile.slim --target runtime-distroless -t mcb:distroless .

# 运行
docker run -d -p 4321:4321 --env-file .env mcb:distroless

# 查看大小
docker images mcb:distroless
```

### 测试精简依赖版本
```bash
# 临时使用精简依赖
cp package.json package.backup.json
cp package.slim.json package.json

# 构建
docker build -f Dockerfile.slim --target runtime-alpine -t mcb:minimal .

# 恢复
cp package.backup.json package.json

# 查看大小
docker images mcb:minimal
```

---

## 推荐方案

### 开发/个人使用
- **当前方案 (534MB)**: 功能完整,包含 Sentry

### 生产/团队使用
- **方案 1 - Distroless (预计 250-300MB)**: 
  - 保留所有功能
  - 更安全 (无 shell)
  - 减少 40-50% 体积

### 资源受限/边缘部署
- **方案 2 - 移除 Sentry (预计 180-220MB)**:
  - 牺牲错误追踪
  - 减少 60% 体积
  - 更快的冷启动

---

## 快速对比

| 方案 | 预计大小 | 功能完整性 | 安全性 | 推荐场景 |
|------|---------|-----------|--------|---------|
| 当前 | 534MB | 100% | 中 | 开发/调试 |
| Distroless | 250-300MB | 100% | 高 | 生产环境 |
| 精简依赖 | 180-220MB | 90% | 中 | 资源受限 |
| Standalone | < 150MB | 95% | 中 | 边缘计算 |

---

## 下一步行动

1. **立即优化** (无风险):
   ```bash
   docker build -f Dockerfile.slim --target runtime-alpine -t mcb:slim .
   ```

2. **测试 Distroless** (推荐生产):
   ```bash
   docker build -f Dockerfile.slim --target runtime-distroless -t mcb:prod .
   ```

3. **激进优化** (需测试):
   - 移除 Sentry
   - 使用 standalone 模式
   - 评估所有依赖必要性
