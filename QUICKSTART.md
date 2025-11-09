# 快速开始指南 - Multi-Channel Broadcast

## 🎯 5分钟快速部署

### 步骤 1: 准备 Telegram 频道

确保你的频道符合以下要求:

- ✅ **公开频道** (Public Channel)
- ✅ 关闭 "Restricting Saving Content" 设置
- ✅ 记录频道用户名(如: `miantiao_me`)

### 步骤 2: 本地测试(可选)

```bash
# 克隆/下载项目
cd MultiChannelBroadcast

# 安装依赖
pnpm install
# 或者 npm install

# 配置环境变量
cp .env.example .env

# 编辑 .env 文件,设置频道
# CHANNELS=channel1,channel2,channel3

# 启动开发服务器
pnpm dev
```

访问 http://localhost:4321 查看效果

### 步骤 3: 部署到 Vercel (推荐)

1. **Fork 项目**
   - 访问项目 GitHub 页面
   - 点击右上角 "Fork"

2. **连接 Vercel**
   - 访问 [vercel.com](https://vercel.com)
   - 点击 "New Project"
   - 导入你 Fork 的仓库

3. **配置环境变量**
   - 在 Vercel 项目设置中添加:
   ```
   CHANNELS=your_channel1,your_channel2
   SITE_NAME=My Blog
   ```

4. **部署**
   - 点击 "Deploy"
   - 等待构建完成(约2-3分钟)

5. **绑定域名(可选)**
   - 在项目设置中添加自定义域名

✅ 完成!访问你的网站查看效果

---

## 📝 常用配置

### 最小化配置

只需要这一个环境变量即可运行:

```env
CHANNELS=your_channel1,your_channel2
```

### 推荐配置

```env
CHANNELS=channel1,channel2,channel3
SITE_NAME=My Multi-Channel Blog
LOCALE=zh-cn
TIMEZONE=Asia/Shanghai
TELEGRAM=your_telegram_username
GITHUB=your_github_username
```

### 完整配置

参考 `.env.example` 文件获取所有可用配置。

---

## 🔧 故障排查

### 问题: 部署后页面空白

**解决方案:**
1. 检查环境变量 `CHANNELS` 是否正确设置
2. 确认频道是公开的
3. 访问 `https://t.me/s/频道名` 确认可以访问
4. 查看部署日志是否有错误

### 问题: 内容加载缓慢

**解决方案:**
- 正常现象,首次加载需要从 Telegram 获取数据
- 后续访问会使用缓存,速度会变快
- 建议不要设置太多频道(≤5个)

### 问题: 部分内容没有显示

**解决方案:**
- 检查频道是否关闭了 "Restricting Saving Content"
- 确认频道有公开的文本内容
- 系统会自动过滤服务消息和空内容

---

## 🎨 自定义样式

编辑 `src/assets/` 目录下的 CSS 文件:

```css
/* src/assets/global.css */
:root {
  --highlight-color: #ff6b6b; /* 主题色 */
  --text-color: #333;         /* 文本颜色 */
  --background-color: #fff;   /* 背景色 */
}
```

---

## 📱 多平台部署

### Cloudflare Pages

```bash
构建命令: pnpm build
输出目录: dist
环境变量: CHANNELS=your_channels
```

### Netlify

```bash
构建命令: pnpm build
发布目录: dist
环境变量: CHANNELS=your_channels
```

### Docker

```bash
docker run -d \
  -p 4321:4321 \
  -e CHANNELS=channel1,channel2 \
  --name multi-channel-broadcast \
  your-image-name
```

---

## 🆘 获取帮助

- 📖 查看完整文档: [README.md](./README.md)
- 🐛 报告问题: GitHub Issues
- 💬 社区讨论: GitHub Discussions

---

## ✨ 下一步

- [ ] 添加更多频道
- [ ] 自定义样式和布局
- [ ] 配置社交媒体链接
- [ ] 设置 Google Analytics
- [ ] 启用评论功能
- [ ] 添加友情链接

祝你使用愉快! 🎉
