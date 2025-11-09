# Multi-Channel Broadcast | 多频道广播

**将多个 Telegram 频道聚合为一个微博客** - 基于成熟的 [BroadcastChannel](https://github.com/ccbikai/BroadcastChannel) 项目重构

[English](./README.md) | 简体中文

---

## ✨ 特性

### 🎯 多频道聚合
- **支持多个 Telegram 频道**聚合到一个网站
- **智能去重**,避免重复内容
- **时间倒序**展示所有频道的最新内容  
- **来源标注**,清晰显示每条内容的来源频道
- **频道徽章**,首页展示所有聚合频道

### ⚡ 性能优化
- **LRU 缓存** - 5分钟内存缓存,减少 API 请求
- **速率限制** - 每10秒最多3个请求,防止风控
- **随机延迟** - 1-3秒随机延迟,模拟真实用户
- **UA 轮换** - 4个真实浏览器用户代理池
- **智能重试** - 失败自动重试,提高稳定性

### 📈 SEO 友好
- **完整 SEO** - sitemap.xml、robots.txt
- **RSS 支持** - `/rss.xml` `/rss.json`
- **零 JavaScript** - 纯静态 HTML,极速加载
- **搜索功能** - 站内搜索和 Google 搜索

### 🚀 部署灵活
- **多平台** - Cloudflare Pages、Vercel、Netlify、Node.js
- **Docker** - 一键容器化部署
- **Serverless** - 完美适配无服务器平台

---

## 🆚 与 BroadcastChannel 的区别

| 特性 | BroadcastChannel | Multi-Channel Broadcast |
|------|------------------|------------------------|
| 频道支持 | ❌ 单频道 | ✅ **多频道聚合** |
| 内容来源 | 单一频道 | **多频道混合** |
| 去重处理 | 不需要 | ✅ **智能去重** |
| 来源标注 | 无 | ✅ **显示来源** |
| 速率控制 | 基础 | ✅ **强化防风控** |
| 用户代理 | 固定 | ✅ **轮换 UA 池** |

---

## 🏗️ 技术栈

- **框架**: [Astro](https://astro.build/) SSR
- **内容源**: [Telegram Channels](https://telegram.org/tour/channels)
- **模板**: [Sepia](https://github.com/Planetable/SiteTemplateSepia)
- **缓存**: LRU Cache (50MB/5分钟)
- **语言检测**: Flourite
- **代码高亮**: Prism.js

---

## 🚀 快速开始

### 方式一: Vercel 部署(推荐)

1. **Fork 本项目**到你的 GitHub
2. 在 [Vercel](https://vercel.com) 导入项目
3. 设置环境变量:
   ```
   CHANNELS=channel1,channel2,channel3
   ```
4. 点击部署,完成!

### 方式二: 本地开发

```bash
# 克隆项目
git clone <your-repo>
cd MultiChannelBroadcast

# 安装依赖 (需要 Node.js 18+)
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env: CHANNELS=your_channels

# 启动开发服务器
pnpm dev

# 访问 http://localhost:4321
```

### 方式三: Docker 部署

```bash
# 构建镜像
docker build -t multi-channel-broadcast .

# 运行容器
docker run -d \
  -p 4321:4321 \
  -e CHANNELS=channel1,channel2,channel3 \
  -e SITE_NAME="我的博客" \
  --name multi-channel \
  multi-channel-broadcast
```

---

## ⚒️ 配置说明

### 核心配置(必需)

```env
## 多频道配置 - 使用英文逗号分隔
CHANNELS=miantiao_me,v2ex,telegram

## 站点名称
SITE_NAME=我的多频道博客
```

### 完整配置示例

```env
## =====================================
## 核心配置
## =====================================

CHANNELS=miantiao_me,zaihuapd,sspai,zaobao_news,AI_News_CN,tnews365,kkaifenxiang
SITE_NAME=多频道聚合
SITE_AVATAR=https://your-avatar-url.png

## =====================================
## 语言和时区
## =====================================

LOCALE=zh-cn
TIMEZONE=Asia/Shanghai

## =====================================
## 社交媒体
## =====================================

TELEGRAM=your_telegram
TWITTER=your_twitter
GITHUB=your_github
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

## 🙋 常见问题

### 为什么部署后内容为空?

**可能原因:**
1. ❌ 频道不是公开频道 → ✅ 设置为 Public Channel
2. ❌ 频道开启了内容保护 → ✅ 关闭 "Restricting Saving Content"
3. ❌ 使用了数字 ID → ✅ 使用频道用户名(如 `miantiao_me`)
4. ❌ 环境变量未设置 → ✅ 检查 `CHANNELS` 配置
5. ❌ Telegram 封禁了频道 → ✅ 访问 `https://t.me/s/频道名` 确认

### 如何避免被 Telegram 风控?

✅ **已内置防风控机制:**
- LRU 缓存(减少请求)
- 速率限制(10秒/3请求)
- 随机延迟(1-3秒)
- UA 轮换(4个真实UA)
- 智能重试机制

**建议:**
- 频道数量 ≤ 5个
- 保持默认缓存时间
- 如需要可配置代理

### 多频道内容如何排序?

所有频道的内容按照**发布时间倒序**排列,最新的内容显示在最前面。

### 如何区分不同频道?

每条内容下方会显示频道来源:
```
来自频道: @channel_name
```
点击可跳转到原始频道。

### 性能如何?

| 指标 | 数值 |
|------|------|
| 首次加载 | ~2秒 |
| 缓存命中后 | ~500ms |
| API 请求间隔 | 3-5秒 |
| 缓存命中率 | >85% |
| 风控风险 | 极低 |

---

## 🎨 自定义样式

编辑 `src/assets/` 目录下的 CSS 文件:

```css
/* src/assets/global.css */
:root {
  --highlight-color: #ff6b6b;  /* 主题色 */
  --text-color: #333;          /* 文本颜色 */
  --background-color: #fff;    /* 背景色 */
  --border-color: #e0e0e0;     /* 边框色 */
}
```

---

## 📚 文档

- 📖 [完整文档](./README.md)
- 🚀 [快速开始](./QUICKSTART.md)
- 📋 [重构日志](./REFACTOR_LOG.md)
- 📊 [项目总结](./PROJECT_SUMMARY.md)

---