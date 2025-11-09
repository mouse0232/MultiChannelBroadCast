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

### SEO 配置

```env
## 搜索引擎索引控制
NOFOLLOW=false
NOINDEX=false

## 启用Google站内搜索 (可选)
GOOGLE_SEARCH_SITE=your-domain.com

## 启用标签页 (使用英文逗号分隔)
TAGS=技术,生活,随笔

## 链接页面 (格式: 标题,URL;标题,URL)
LINKS=GitHub,https://github.com;博客,https://blog.com

## 侧边栏导航 (格式: 标题,URL;标题,URL)
NAVS=关于,/about;友链,/links
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

## 📦 部署指南

### Vercel 部署

1. Fork 本项目到你的 GitHub
2. 在 [Vercel](https://vercel.com) 导入项目
3. 设置环境变量 `CHANNELS=channel1,channel2,channel3`
4. 点击部署

### Cloudflare Pages 部署

1. Fork 本项目到你的 GitHub
2. 在 [Cloudflare Pages](https://pages.cloudflare.com) 创建项目
3. 选择你的 GitHub 仓库
4. 构建设置:
   - 构建命令: `pnpm build`
   - 输出目录: `dist`
5. 设置环境变量 `CHANNELS`
6. 部署

### Docker 部署

```bash
# 构建镜像
docker build -t multi-channel-broadcast .

# 运行容器
docker run -d \
  -p 4321:4321 \
  -e CHANNELS=channel1,channel2,channel3 \
  -e SITE_NAME="My Blog" \
  --name multi-channel-broadcast \
  multi-channel-broadcast
```

### Node.js 部署

```bash
# 构建
pnpm build

# 运行(生产模式)
node ./dist/server/entry.mjs
```

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

- [ ] 添加频道过滤功能
- [ ] 支持自定义排序规则
- [ ] 添加频道分组功能
- [ ] 支持更多内容平台

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request!

---

## 📄 许可证

MIT License

---

## 🙏 致谢

- 基于 [BroadcastChannel](https://github.com/ccbikai/BroadcastChannel) 项目
- 使用 [Sepia](https://github.com/Planetable/SiteTemplateSepia) 模板
- 感谢 [Astro](https://astro.build/) 框架

---

## 📧 联系方式

如有问题或建议,欢迎通过 Issue 反馈。
