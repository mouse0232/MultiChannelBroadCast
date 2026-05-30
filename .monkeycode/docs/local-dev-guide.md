# Cloudflare Pages + Workers 本地开发指南

本指南描述如何在本地完整模拟线上环境，包括 Pages (Astro) 调用本地 SQLite、绑定线上 Worker 服务，验证直连 D1 与缓存逻辑。

## 1. 目录结构与配置文件

项目采用双配置文件模式：
- `wrangler.toml`：**Worker (mcb-crawler)** 的运行配置（含 KV, Queue, AI, R2）。
- `wrangler-pages.toml`：**Pages (Astro)** 的运行配置（含 D1, Service Binding）。

## 2. 前置准备

### 确保配置文件就位
在启动 Pages 开发服务前，需将 Pages 配置覆盖主配置（如果 `wrangler.toml` 已被 Worker 修改）：

```bash
cp wrangler-pages.toml wrangler.toml
pnpm install
```

### 检查本地 Wrangler 版本
```bash
npx wrangler --version
```
建议版本 >= 3.50.0。

## 3. 核心启动命令

### 场景 A：完整全链路测试 (推荐)
**启动 Pages 并绑定线上 Worker 与本地 D1 数据库。**
这适用于测试“直连 D1 + Worker 降级”的完整逻辑。

```bash
# --d1=DB=mcb-local-db 会自动创建一个本地 SQLite 并绑定给 env.DB
# --service=MCB_CRAWLER@production 绑定到线上的 Worker (需登录 wrangler login)
npx wrangler pages dev -- d1=DB=mcb-local-db --service=MCB_CRAWLER@production
```

**验证点：**
1. `http://localhost:8788/`：访问首页，检查日志。
2. 观察终端是否打印 `[Cache MISS]` 或 `[Cache HIT]`（Pages 端逻辑）。
3. 观察是否显示 D1 查询数据。

### 场景 B：仅测试 Pages 静态渲染
如果不依赖数据库，仅想看页面样式：

```bash
pnpm run dev
```
此时 `env.DB` 为 `undefined`，页面会显示空状态 (Empty State)。

### 场景 C：Worker 本地开发
如果需要修改 Worker 逻辑（`workers/cache-worker.js`）并验证：

```bash
# 注意：Worker 开发使用原始的 wrangler.toml
npx wrangler dev --local
```
访问 `http://localhost:8787/api/posts` 验证 Worker 代理接口。

## 4. 数据库本地重置与调试

本地 D1 数据是存在内存或临时 SQLite 文件中的。如果想测试“初始化”效果：

```bash
# 删除旧的本地数据库绑定，下次启动会重建空库
# 路径通常在当前目录或系统临时目录
npx wrangler pages dev --d1=DB=mcb-local-db-fresh
```

### 手动验证 D1 查询
如果你想知道本地数据库里到底有没有表，可以在 Pages 启动后，使用另一个终端：

```bash
# 查找 sqlite3 进程并获取其 socket 或文件路径（视 wrangler 实现而定）
# 或者在 Pages 代码中临时加 console.log(JSON.stringify(await env.DB.prepare("SELECT * FROM sqlite_master").all()))
```

## 5. 单元测试与类型检查

在提交代码前，务必运行以下命令：

```bash
# 运行所有逻辑测试 (包括 d1-client, d1-cache 等)
npm run test

# 运行静态构建，确保无语法错误和 Import 错误
npm run build
```

## 6. 常见问题

**Q: 日志里显示 "D1 Database 未配置"**
A: 说明你使用的是 `pnpm dev` 而不是 `wrangler pages dev`。只有 Wrangler 才能注入 `env.DB`。

**Q: 本地启动报错 "Service not found"**
A: 说明你使用了 `--service` 但没登录或没有线上 Worker 权限。
解决：运行 `npx wrangler login`，或者去掉 `--service` 参数（此时降级功能不可用，但不影响直连 D1 测试）。
