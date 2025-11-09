# Multi-Channel Broadcast

**将多个 Telegram 频道聚合为一个微博客** - 基于 [BroadcastChannel](https://github.com/ccbikai/BroadcastChannel) 项目重构

---

## ✨ 核心特性

### 多频道聚合 🎯
- **支持多个 Telegram 频道聚合**到一个网站
- **智能去重**,避免重复内容
- **按时间倒序**展示所有频道的最新内容
- **频道来源标注**,清晰显示每条内容的来源频道

### 性能优化 ⚡
- **LRU 缓存机制** - 5分钟内存缓存,减少API请求
- **速率限制器** - 防止Telegram API风控,每10秒最多3个请求
- **随机延迟** - 模拟真实用户行为,避免被封禁
- **用户代理池** - 多个真实浏览器UA轮换
- **智能重试** - 请求失败自动重试,提高稳定性

### SEO 友好 📈
- **完整的SEO配置** - sitemap、robots.txt
- **RSS/JSON Feed支持** - `/rss.xml` `/rss.json`
- **浏览器端 0 JS** - 纯静态HTML,加载速度快
- **搜索功能** - 支持站内搜索和Google站内搜索

### 部署灵活 🚀
- **多平台支持** - Cloudflare Pages、Vercel、Netlify、Node.js
- **Docker支持** - 一键部署到任何支持Docker的平台
- **Serverless友好** - 基于Astro SSR,完美适配无服务器平台

---

## 🆚 与 BroadcastChannel 的区别

| 特性 | BroadcastChannel | Multi-Channel Broadcast |
|------|------------------|------------------------|
| 频道数量 | 单频道 | **多频道聚合** |
| 内容来源 | 单一频道 | **多个频道混合** |
| 去重处理 | 不需要 | **智能去重** |
| 频道标注 | 无 | **显示来源频道** |
| 速率控制 | 基础重试 | **强化速率限制** |
| 用户代理 | 固定 | **轮换UA池** |

---

## 🏗️ 技术栈

- **框架**: [Astro](https://astro.build/) v4.15+
- **内容源**: [Telegram Channels](https://telegram.org/tour/channels)
- **模板**: [Sepia](https://github.com/Planetable/SiteTemplateSepia)
- **缓存**: LRU Cache
- **代码高亮**: Prism.js
- **语言检测**: Flourite

---

## 🚀 快速开始

### 前置要求

- Node.js 18+
- pnpm 9.9+ (推荐) 或 npm

### 本地开发

```bash
# 克隆项目
git clone <your-repo-url>
cd MultiChannelBroadcast

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件,设置 CHANNELS

# 启动开发服务器
pnpm dev
```

访问 `http://localhost:4321` 查看效果

---

## ⚒️ 配置说明

创建 `.env` 文件并配置以下环境变量:

### 核心配置

```env
## 多频道配置 - 使用逗号分隔多个频道 (必需)
CHANNELS=channel1,channel2,channel3

## 或者使用单个频道 (向下兼容)
CHANNEL=your_channel_name

## 站点名称
SITE_NAME=My Multi-Channel Blog

## 语言和时区
LOCALE=zh-cn
TIMEZONE=Asia/Shanghai
```

### 社交媒体配置

```env
## 社交媒体用户名
TELEGRAM=your_telegram
TWITTER=your_twitter
GITHUB=your_github

## 需要完整URL的社交媒体
MASTODON=https://mastodon.social/@username
BLUESKY=https://bsky.app/profile/username
DISCORD=https://discord.gg/invite
PODCAST=https://your-podcast.com
```

### 高级配置

```env
## Telegram主机 (一般不需要修改)
TELEGRAM_HOST=t.me

## 静态资源代理 (可选)
STATIC_PROXY=/static/

## 代码注入 (支持HTML)
HEADER_INJECT=<!-- Google Analytics -->
FOOTER_INJECT=<!-- 页脚统计代码 -->

## Sentry错误追踪 (可选)
SENTRY_DSN=your_sentry_dsn
SENTRY_PROJECT=your_project
SENTRY_AUTH_TOKEN=your_auth_token
```

---

## 🎯 性能优化

### 预构建缓存

为了提升首次访问速度，项目支持在构建时预加载数据到缓存中：

1. 在构建过程中自动预加载频道数据
2. 部署完成后用户访问站点时可直接显示内容
3. 减少用户等待时间，提升用户体验

### 后台定时更新

项目支持后台定时更新缓存数据：

- **Vercel**: 使用Cron Jobs每30分钟自动更新一次缓存
- **Cloudflare**: 可配置Workers定时任务更新缓存
- **其他平台**: 可通过定时执行脚本更新缓存

### 缓存配置

```env
## 预构建缓存: 在构建时预加载数据到缓存中
PREBUILD_CACHE=true

## 后台定时更新缓存的时间间隔(分钟)
CACHE_UPDATE_INTERVAL=30
```

---

## 📈 缓存策略

- **LRU缓存**: 30分钟TTL，150MB最大缓存
- **预构建缓存**: 构建时预加载数据
- **后台更新**: 定时更新缓存数据
- **智能过期**: 允许返回过期数据，同时在后台更新

---

## 🎨 自定义样式

样式文件位于 `src/assets/` 目录:

- `normalize.css` - CSS重置
- `style.css` - 主样式
- `item.css` - 文章项样式
- `global.css` - 全局样式

可以直接修改这些文件来自定义网站外观。

---

## 🔧 常见问题

### 为什么部署后内容为空?

1. **检查频道是否公开** - 必须是公开频道(Public Channel)
2. **频道用户名格式** - 应该是 `username` 而不是数字ID
3. **频道内容保护** - 关闭频道的 "Restricting Saving Content" 设置
4. **环境变量** - 确认 `CHANNELS` 配置正确
5. **Telegram限制** - 访问 `https://t.me/s/频道用户名` 确认频道可见

### 如何避免 Telegram 风控?

本项目已经内置了多重防护:

1. **LRU缓存** - 减少实际请求次数
2. **速率限制** - 每10秒最多3个请求
3. **随机延迟** - 模拟真实用户行为
4. **UA轮换** - 使用真实浏览器用户代理
5. **智能重试** - 失败后延迟重试

建议:
- 不要设置过多频道(建议≤5个)
- 适当增加缓存时间
- 使用代理(如需要)

### 多频道内容如何排序?

所有频道的内容会按照 **发布时间倒序** 排列,最新的内容显示在最前面。同时会进行去重处理,避免重复显示。

### 如何区分不同频道的内容?

每条内容下方会显示 "来自频道: @channel_name",点击可以跳转到该频道。

---

## 📝 开发计划

### 部署相关
- [ ] 完善 Vercel 部署支持
- [ ] 优化 Cloudflare Pages 构建流程
- [ ] 添加 Netlify 部署文档

### 功能增强
- [ ] 添加频道过滤功能
- [ ] 支持自定义排序规则
- [ ] 添加频道分组功能
- [ ] 支持更多内容平台

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request!

---

## 📄 许可证

MIT