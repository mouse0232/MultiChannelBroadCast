# Pages 直连 D1 数据访问优化 - 任务清单

## 重要说明

**Worker 代码保留策略**：

- 改造后 **Worker 代码完整保留**，不删除任何读接口
- 作为降级备用方案，随时可切换回 Worker API
- 稳定运行 2-4 周后，根据监控数据决定是否清理

**阶段划分**：

| 阶段 | 时间 | 目标 |
|------|------|------|
| 阶段 1-6 | 第 1 周 | 完成改造和初步验证 |
| 观察期 | 第 2-4 周 | 监控指标，收集数据 |
| 阶段 7 | 第 5 周 | 根据数据决定是否清理 Worker 代码 |

## 实现任务

### 阶段 1: 前置准备 (预计 1 天)

- [ ] **创建 KV 命名空间**
  - 命令：`wrangler kv:namespace create "POSTS_CACHE"`
  - 记录返回的 namespace ID
  - 验证：Dashboard → Workers & Pages → KV 查看

- [ ] **配置 Pages D1 绑定**
  - Dashboard → Pages → multichannelbroadcast → Settings → Functions
  - D1 database bindings → Add binding
  - Variable name: `DB`
  - Database: `multi-channel-db` (database_id: 70ca97b0-ef88-4893-abaf-dffa4d2e4d86)
  - 截图保存配置

- [ ] **配置 Pages KV 绑定**
  - Dashboard → Pages → multichannelbroadcast → Settings → Functions
  - KV namespace bindings → Add binding
  - Variable name: `POSTS_CACHE`
  - KV namespace: 选择阶段 1.1 创建的命名空间
  - 截图保存配置

- [ ] **配置 Pages 环境变量**
  - Dashboard → Pages → multichannelbroadcast → Settings → Environment Variables
  - 添加以下变量（Production + Preview 环境）:
    - `CHANNELS`: `channel1,channel2,...` (与 Worker 保持一致)
    - `API_SECRET_KEY`: `your-secret-key` (与 Worker 保持一致)
    - `SITE_NAME`: `站点名称`
    - `SITE_AVATAR`: `头像 URL`
    - `SITE_URL`: `https://your-domain.pages.dev`
    - `TZ`: `Asia/Shanghai`
  - 截图保存配置

### 阶段 2: 代码改造 (预计 2 天)

#### 2.1 修改 `src/lib/d1-client.js`

- [ ] **删除 `callWorkerApi` 函数**
  - 移除 Service Binding 调用逻辑
  - 保留文件头部注释说明改造历史

- [ ] **实现 `getDatabase` 辅助函数**
  ```javascript
  function getDatabase(env) {
    return env.DB || env.DATABASE
  }
  ```

- [ ] **重构 `getChannels` 函数**
  - 直接查询 `channel_meta` 表
  - 补充 `env.CHANNELS` 中配置但未抓取的频道
  - 添加错误处理
  - 添加性能日志

- [ ] **重构 `getPosts` 函数**
  - 直接查询 `posts` 表
  - 实现 KV 缓存逻辑（TTL: 300s）
  - 保持分页逻辑不变（使用 `published_at`）
  - 添加缓存命中日志

- [ ] **新增 `getPostById` 函数**
  - 查询单个帖子（用于详情页）
  - 不缓存（访问频率低）

- [ ] **新增 `searchPosts` 函数**
  - 实现搜索逻辑（LIKE 查询）
  - 实现 KV 缓存（TTL: 600s）

- [ ] **新增 `buildCacheKey` 辅助函数**
  - 参数排序保证 Key 一致性
  - 用于 KV 缓存 Key 生成

- [ ] **添加错误处理**
  - D1 连接失败处理
  - KV 缓存失败处理（不阻塞主流程）
  - 降级策略（返回空数组）

- [ ] **添加日志埋点**
  - D1 查询日志
  - 缓存命中/未命中日志
  - 性能日志（查询耗时）

#### 2.2 清理 Worker API 代码（可选，建议后续执行）

- [ ] **移除读接口** (`workers/cache-worker.js`)
  - 删除 `/api/posts` GET 处理
  - 删除 `/api/channels` GET 处理
  - 删除 `/api/post/:id` GET 处理
  - 删除 `/api/posts/search` GET 处理
  - 删除 `handleCachedRequest` 函数
  - 删除 `VERSION_CACHE` 及相关逻辑

- [ ] **保留管理接口**
  - 保留 `/api/init` GET (初始化)
  - 保留 `/api/regrab` GET (重新抓取)
  - 保留 CORS 处理
  - 保留 Secret 校验

- [ ] **简化 Worker Handler**
  ```javascript
  export default {
    async fetch(request, env, ctx) {
      // 仅保留管理接口
      if (url.pathname === '/api/regrab') { ... }
      if (url.pathname === '/api/init') { ... }
      
      return new Response('Worker running (write-only).', { status: 200 })
    },
    scheduled,
    queue
  }
  ```

#### 2.3 更新配置文件

- [ ] **更新 `astro.config.mjs`** (如有需要)
  - 确认 D1 binding 已正确配置
  - 移除对 `MCB_CRAWLER` Service Binding 的依赖

- [ ] **更新 `wrangler.toml`** (Worker 配置)
  - 移除不再需要的读接口相关配置
  - 保留抓取和推送相关配置

- [ ] **更新 `.env.example`**
  - 添加 Pages 所需环境变量示例
  - 注释说明 D1 和 KV 绑定需在 Dashboard 配置

#### 2.4 添加日志和监控

- [ ] **在 Astro 页面添加调试信息** (开发环境)
  - `src/pages/debug.astro`: 显示 D1 查询性能
  - `src/pages/diagnose.astro`: 显示缓存命中率

- [ ] **添加 Sentry 错误上报** (如果已集成)
  - 捕获 D1 查询错误
  - 上报缓存失败错误

### 阶段 3: 本地测试 (预计 1 天)

- [ ] **安装依赖**
  ```bash
  pnpm install
  ```

- [ ] **本地构建**
  ```bash
  pnpm build
  ```

- [ ] **本地预览**
  ```bash
  pnpm preview
  ```
  - 监听 Functions 日志，确认 D1 查询正常
  - 确认 KV 缓存写入

- [ ] **功能测试**
  - [ ] 访问首页 `http://localhost:4321/`
    - 验证帖子列表显示正常
    - 验证频道列表显示正常
    - 查看控制台日志，确认 D1 查询
  - [ ] 访问频道页 `http://localhost:4321/channel/xxx`
    - 验证频道过滤功能
  - [ ] 分页测试
    - 点击"更早"按钮 → 验证 `before` 游标
    - 点击"更新"按钮 → 验证 `after` 游标
  - [ ] 搜索测试
    - 访问 `http://localhost:4321/search/keyword`
    - 验证搜索结果
  - [ ] 缓存测试
    - 刷新页面 → 查看日志确认缓存命中
    - 等待 5 分钟 → 刷新 → 查看日志确认缓存过期重新查询

- [ ] **性能测试**
  - 使用 Lighthouse 测量页面加载时间
  - 记录 D1 查询响应时间
  - 与改造前对比（应该有提升）

### 阶段 4: 部署验证 (预计 1 天)

- [ ] **提交代码**
  ```bash
  git add .
  git commit -m "feat: 直连 D1 数据访问优化 (CQRS 架构)"
  git push
  ```

- [ ] **监控 Cloudflare Pages 部署**
  - Dashboard → Pages → multichannelbroadcast → Deployments
  - 查看构建日志
  - 确认 Functions 构建成功

- [ ] **生产环境验证**
  - 访问线上站点 `https://your-domain.pages.dev/`
  - [ ] 首页正常显示
  - [ ] 频道页正常显示
  - [ ] 分页功能正常
  - [ ] 搜索功能正常
  - 打开浏览器开发者工具 → Network
  - [ ] 确认没有调用 Worker API（应该直接 SSR）

- [ ] **检查 Functions 日志**
  - Dashboard → Pages → multichannelbroadcast → Functions → Logs
  - [ ] 确认 D1 查询日志出现
  - [ ] 确认缓存命中日志出现
  - [ ] 确认无错误日志

- [ ] **检查 D1 Dashboard**
  - Dashboard → D1 → multi-channel-db → Metrics
  - [ ] 查看查询次数（应有明显增加）
  - [ ] 查询响应时间（应在正常范围：50-100ms）

- [ ] **检查 KV Dashboard**
  - Dashboard → KV → POSTS_CACHE → Metrics
  - [ ] 查看读取次数（缓存命中）
  - [ ] 查看写入次数（缓存设置）

- [ ] **检查 Worker 正常运行**
  - Dashboard → Workers → mcb-crawler → Logs
  - [ ] 确认 Cron 定时抓取仍在执行
  - [ ] 确认 Queue 消费仍在执行
  - [ ] 确认 D1 写入正常

### 阶段 5: 性能对比 (预计 0.5 天)

- [ ] **收集改造前数据** (如果改造前有记录)
  - 首页加载时间（Lighthouse）
  - Worker API 响应时间
  - Worker 请求配额消耗

- [ ] **收集改造后数据**
  - 首页加载时间（Lighthouse）
  - D1 查询响应时间
  - Worker 请求配额消耗
  - KV 读取/写入次数

- [ ] **对比分析**
  - 性能提升：加载时间减少 X ms（目标：50-100ms）
  - 成本降低：Worker 请求减少 X%（目标：90%+）
  - 缓存命中率：KV Cache HIT / (HIT + MISS) （目标：70%+）

- [ ] **编写性能报告**
  - 更新 `.monkeycode/MEMORY.md` 记录性能数据
  - 更新本项目 README 说明性能优化成果

### 阶段 6: 清理和文档 (预计 0.5 天)

- [ ] **清理 Worker API 代码** (阶段 2.2 未完成的部分)
  - 移除所有读接口
  - 更新 Worker 描述为"Write-only Worker"
  - 提交清理后的代码

- [ ] **更新项目文档**
  - 更新 `README.md`: 说明新的架构
  - 更新 `.monkocode/docs/`: 更新系统架构说明
  - 更新 `.env.example`: 补充 Pages 环境变量

- [ ] **更新架构图**
  - 绘制新的数据流图
  - 标注 CQRS 模式
  - 添加到 `README.md` 或 `.monkocode/docs/architecture.md`

- [ ] **更新 MEMORY.md**
  ```markdown
  [Pages 直连 D1 架构改造]
  - Date: 2026-05-29
  - Context: 性能和成本优化
  - Instructions:
    - Pages 通过 D1 binding 直接查询数据，不再通过 Worker API
    - Worker 专注于写操作（抓取、队列处理、推送）
    - 使用 KV 缓存优化 D1 读取（TTL: 300s）
    -  Dashboard 配置：Pages → Settings → Functions → D1 binding (DB) + KV binding (POSTS_CACHE)
  ```

## 验证清单

### 功能验证

- [ ] 首页帖子列表正常显示
- [ ] 频道列表正常显示
- [ ] 频道过滤功能正常
- [ ] 分页"更早"按钮正常
- [ ] 分页"更新"按钮正常
- [ ] 搜索功能正常
- [ ] 帖子详情页正常

### 性能验证

- [ ] 首页加载时间 < 3 秒（Lighthouse）
- [ ] D1 查询响应时间 < 100ms
- [ ] KV 缓存命中率 > 70%
- [ ] Worker 请求量减少 > 90%

### 稳定性验证

- [ ] 连续运行 24 小时无错误日志
- [ ] Worker 抓取功能正常（检查最新帖子时间）
- [ ] KV 缓存自动过期（等待 TTL 后刷新）
- [ ] D1 查询配额在预算内

### 成本验证

- [ ] Worker 请求配额使用量下降
- [ ] D1 读取配额使用量正常
- [ ] KV 操作配额使用量正常
- [ ] 总体成本下降（对比账单预估）

## 回滚方案

### 快速回滚（遇到问题时）

- [ ] **代码回滚**
  ```bash
  git revert HEAD
  git push
  ```

- [ ] **恢复 Service Binding**
  - Dashboard → Pages → Settings → Functions
  - 重新添加 `MCB_CRAWLER` Service Binding

- [ ] **验证旧架构恢复**
  - 访问首页 → 确认数据正常
  - 检查 Worker 日志 → 确认 API 调用恢复

### 混合模式（降级运行）

- [ ] **启用双模式代码**
  - 使用 `src/lib/d1-client.js` 的双模式版本
  - 优先尝试 D1 直连，失败降级到 Worker API

- [ ] **监控运行**
  - 观察 D1 稳定性
  - 确认 Worker API 作为后备正常

## 验收标准

### 必须满足（Blocker）

1. 所有功能测试通过（阶段 3.3）
2. 生产环境验证通过（阶段 4.3）
3. 无严重错误日志（阶段 4.4）
4. Worker 抓取功能正常（阶段 4.7）

### 建议满足（Enhancement）

1. 性能提升达 50%以上（阶段 5.3）
2. 缓存命中率达70%以上（阶段 5.3）
3. 成本降低10% 以上（阶段 5.4）
4. 文档完善（阶段6.2）

## 时间估算

| 阶段 | 任务 | 预计时间 |
|------|------|----------|
| 阶段 1 | 前置准备 | 1 天 |
| 阶段 2 | 代码改造 | 2 天 |
| 阶段 3 | 本地测试 | 1 天 |
| 阶段 4 | 部署验证 | 1 天 |
| 阶段 5 | 性能对比 | 0.5 天 |
| 阶段 6 | 清理文档 | 0.5 天 |
| **总计** | | **6 天** |

## 负责人

- [ ] 开发负责人：@待定
- [ ] 测试负责人：@待定
- [ ] 部署负责人：@待定

## 备注

1. 改造过程中保持 Worker 功能不变，确保数据持续抓取
2. 建议先在 Preview 环境验证，再部署到 Production
3. 如遇节假日或重大活动，暂缓改造以确保稳定性
4. 每次部署后保留 24 小时观察期
