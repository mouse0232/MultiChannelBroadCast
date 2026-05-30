# Pages 直连 D1 数据访问优化

## 项目概述

将当前 Pages 通过 Worker API 间接读取 D1 数据的架构，改造为 Pages 直接读取 D1 数据，实现 CQRS（命令查询职责分离）模式，提升性能并降低成本。

## 背景

当前项目中，Cloudflare Pages 获取数据需要通过 Service Binding 调用 Worker API，Worker 再查询 D1 数据库返回数据。这种架构存在以下问题：

1. **性能损耗**: 每次 Pages 请求都需要经过 Worker API 中转，增加 50-100ms 延迟
2. **成本增加**: Pages 的每次 SSR 请求都计入 Worker 请求配额
3. **架构复杂**: 读操作依赖 Worker，不利于独立扩展

## 目标

1. Pages 直接读取 D1 数据库，减少中间层
2. Worker 专注于写操作（抓取、队列处理、推送）
3. 保持数据一致性和分页逻辑不变
4. 实现缓存策略，优化 D1 读取成本

## 范围

### 包含
- Pages 数据读取逻辑改造（直连 D1）
- Worker 缓存逻辑移植到 Pages（`handleCachedQuery`、`getVersionMap`）
- D1 数据库绑定配置
- 安全措施继承（Secret 认证、LIMIT 限制、ID 校验等）
- Worker 代码完整保留（作为降级备用）

### 不包含
- Worker 代码删除（Worker 保持完整，不删除任何功能）
- Worker 抓取逻辑修改（保持不变）
- 数据库表结构变更
- 前端页面 UI 改动

### 降级策略

**Worker 代码完整保留，作为热备份**：

| 场景 | 正常模式 | 降级模式 |
|------|---------|---------|
| **数据读取** | Pages → D1（直连） | Pages → Worker API → D1 |
| **触发条件** | `USE_DIRECT_D1 = true` | `USE_DIRECT_D1 = false` 或 D1 故障 |
| **切换方式** | 环境变量或代码开关 | 手动切换或自动降级 |

**保留的 Worker API**（完整保留，不删除）：
- `GET /api/posts` - 帖子列表
- `GET /api/channels` - 频道列表
- `GET /api/post/:id` - 单个帖子
- `GET /api/posts/search` - 搜索
- `GET /api/init` - 初始化
- `GET /api/regrab` - 重新抓取
- `/img-proxy` - 图片代理
- `/static/*` - 视频/音频代理

## 用户故事

1. **作为开发者**，我希望 Pages 直接读取 D1，以便减少 API 调用延迟
2. **作为运维人员**，我希望降低 Worker 请求配额消耗，以便控制成本
3. **作为用户**，我希望页面加载更快，以便获得更好的浏览体验

## 验收标准

1. Pages 能够成功直接查询 D1 数据库
2. 首页、频道页、搜索页等所有数据展示正常
3. 分页功能正常工作（before/after cursor）
4. 频道过滤功能正常
5. 性能测试：页面加载时间减少 50ms 以上
6. 成本分析：Worker 请求量减少 90% 以上（仅保留写操作）

## 约束条件

1. 必须保持与现有数据库 schema 兼容
2. 不能影响 Worker 的抓取和推送功能
3. 必须实现缓存策略，避免 D1 额度过快消耗
4. 改造过程需保证服务连续性，不能中断现有服务

## 依赖关系

- Cloudflare D1 数据库已配置并正常运行
- Pages 项目已部署在 Cloudflare Pages
- Worker 项目已部署在 Cloudflare Workers

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| D1 读取额度超限 | 高 | 实现 KV 缓存策略，设置合理 TTL |
| 数据不一致 | 中 | 保持 Worker 写入逻辑不变，Pages 查询逻辑与 Worker API 一致 |
| 环境变量配置错误 | 中 | 在 Dashboard 仔细配置，本地测试验证 |
| 分页游标混乱 | 中 | 严格使用 published_at 作为游标，保持逻辑一致 |

## 术语定义

- **CQRS**: Command Query Responsibility Segregation，命令查询职责分离
- **D1**: Cloudflare D1 数据库服务
- **Pages**: Cloudflare Pages 托管的 Astro 前端应用
- **Worker**: Cloudflare Workers 后端服务
- **Service Binding**: Cloudflare 服务间内部调用机制
- **KV**: Cloudflare KV 键值存储服务

## 参考资料

- [Cloudflare D1 文档](https://developers.cloudflare.com/d1/)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [CQRS 模式介绍](https://martinfowler.com/bliki/CQRS.html)
