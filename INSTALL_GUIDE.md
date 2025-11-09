# 安装和测试指南

## 🎉 重构已完成!

基于 BroadcastChannel 的成熟架构,MultiChannelBroadcast 项目已经彻底重构完成。

---

## 📦 安装依赖

在项目根目录执行:

```powershell
# 使用 pnpm (推荐)
pnpm install

# 或使用 npm
npm install

# 或使用 yarn
yarn install
```

**注意:** 首次安装可能需要几分钟,请耐心等待。

---

## ⚙️ 配置环境变量

### 1. 创建 .env 文件

```powershell
Copy-Item .env.example .env
```

### 2. 编辑 .env 文件

最少配置(用你的频道替换):
```env
CHANNELS=miantiao_me,v2ex,telegram
SITE_NAME=My Multi-Channel Blog
```

完整配置参考 `.env.example` 文件。

---

## 🚀 本地开发

### 启动开发服务器

```powershell
pnpm dev
```

访问: http://localhost:4321

**热重载**: 修改代码后会自动刷新

### 常用命令

```powershell
# 开发
pnpm dev

# 构建生产版本
pnpm build

# 预览生产构建
pnpm preview

# 构建后本地预览
pnpm build; pnpm preview
```

---

## 🧪 测试功能

### 1. 测试多频道聚合

访问首页,应该看到:
- ✅ 来自多个频道的内容混合显示
- ✅ 按时间倒序排列
- ✅ 每条内容显示来源频道
- ✅ 顶部显示所有聚合频道的徽章

### 2. 测试单篇文章

点击任意文章时间,应该:
- ✅ 跳转到文章详情页
- ✅ URL 格式: `/posts/123`
- ✅ 显示完整内容

### 3. 测试分页

- ✅ 页面底部有 "Before" / "After" 按钮
- ✅ 点击可以查看更早/更晚的内容

### 4. 测试 RSS

访问这些 URL:
- http://localhost:4321/rss.xml (RSS Feed)
- http://localhost:4321/rss.json (JSON Feed)
- http://localhost:4321/sitemap.xml (站点地图)

### 5. 测试搜索

在侧边栏搜索框输入关键词,应该:
- ✅ 跳转到搜索结果页
- ✅ 显示匹配的内容

---

## 🔍 检查缓存和速率限制

### 查看控制台日志

开发服务器的控制台会显示:

```
Fetching channel: channel1 { before: '', after: '', q: '', type: 'list', id: '' }
Cache hit for channel: channel1
Match Cache { channel: 'channel1', before: '', after: '', q: '', type: 'list', id: '' }
Rate limit reached, waiting 3500ms...
```

**说明:**
- `Fetching channel`: 正在请求频道数据
- `Cache hit`: 缓存命中,不需要请求
- `Rate limit reached`: 速率限制生效,等待中

---

## 🐛 常见问题排查

### 问题 1: 安装依赖失败

**解决:**
```powershell
# 清理缓存
Remove-Item -Recurse -Force node_modules
Remove-Item -Force pnpm-lock.yaml

# 重新安装
pnpm install
```

### 问题 2: 页面空白/没有内容

**检查:**
1. `.env` 文件是否正确配置
2. 频道名称是否正确(如 `miantiao_me`)
3. 频道是否公开
4. 控制台是否有错误信息

**测试频道可访问性:**
访问 `https://t.me/s/你的频道名`

### 问题 3: 构建失败

**尝试:**
```powershell
# 清理构建缓存
Remove-Item -Recurse -Force dist
Remove-Item -Recurse -Force .astro

# 重新构建
pnpm build
```

### 问题 4: 端口被占用

**修改端口:**
```powershell
$env:PORT = "3000"
pnpm dev
```

---

## 📊 性能检查

### 1. 查看缓存效果

第一次访问:
- 加载时间: ~2-3秒(需要请求 Telegram)

5分钟内再次访问:
- 加载时间: ~500ms(使用缓存)

### 2. 查看网络请求

打开浏览器开发者工具(F12) → Network 标签:
- 首次: 看到 Telegram API 请求
- 缓存后: 直接返回数据,无外部请求

---

## 🚢 准备部署

### 1. 测试生产构建

```powershell
# 构建
pnpm build

# 预览
pnpm preview
```

访问 http://localhost:4321 检查是否正常

### 2. 检查环境变量

确保以下变量已设置:
```env
CHANNELS=your_channels        # 必需
SITE_NAME=Your Site Name      # 推荐
LOCALE=zh-cn                  # 推荐
TIMEZONE=Asia/Shanghai        # 推荐
```

### 3. 选择部署平台

- **Vercel**: 最简单,推荐新手
- **Cloudflare Pages**: 免费额度大,速度快
- **Netlify**: 功能强大,易用
- **Docker**: 适合 VPS 部署

---

## 📝 部署前检查清单

- [ ] 依赖安装成功
- [ ] 本地开发正常运行
- [ ] 环境变量已配置
- [ ] 生产构建测试通过
- [ ] 频道可以正常访问
- [ ] 内容正常显示
- [ ] RSS/Sitemap 正常
- [ ] 搜索功能正常

---

## 🎯 下一步

1. **本地测试完成** → 继续部署
2. **部署到 Vercel** → 参考 [README.md](./README.md#vercel-部署)
3. **部署到其他平台** → 参考 [README.md](./README.md#部署到其他平台)
4. **自定义样式** → 编辑 `src/assets/*.css`
5. **添加功能** → 参考项目结构自行扩展

---

## 📚 更多资源

- 📖 [完整文档](./README.md)
- 🚀 [快速开始](./QUICKSTART.md)
- 📊 [项目总结](./PROJECT_SUMMARY.md)
- 📋 [重构日志](./REFACTOR_LOG.md)

---

**祝你使用愉快! 如有问题欢迎提 Issue。** 🎉
