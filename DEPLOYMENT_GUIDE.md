# 多平台部署指南

本项目支持多个部署平台。根据你的需求选择一个平台进行部署。

## 🚀 推荐: Cloudflare Pages (免费 + 快速)

### 优势
- ✅ 完全免费
- ✅ 全球 CDN 加速
- ✅ 自动 HTTPS
- ✅ 无冷启动问题
- ✅ 无限带宽

### 部署步骤

1. **连接 GitHub 仓库**
   - 访问 [Cloudflare Pages](https://pages.cloudflare.com/)
   - 连接你的 GitHub 账户
   - 选择 `MultiChannelBroadCast` 仓库

2. **构建配置**
   ```
   Framework preset: Astro
   Build command: pnpm build
   Build output directory: dist
   Node version: 18
   ```

3. **环境变量**
   ```bash
   CHANNELS=miantiao_me,zaihuapd,sspai,zaobao_news,AI_News_CN,tnews365,kkaifenxiang
   SITE_TITLE=多频道聚合
   SITE_AVATAR=https://your-avatar-url.png
   LOCALE=zh-cn
   ```

4. **部署**
   - 点击 "Save and Deploy"
   - 等待构建完成

### 注意事项
- ❌ 不要设置 `SITE` 或 `SITE_URL` 环境变量
- ✅ 让 Cloudflare 自动检测域名
- ✅ 如需自定义域名,在 Cloudflare Pages 设置中添加

---

## Vercel 部署 (备选)

### 为什么不推荐 Vercel?
- ⚠️ 免费套餐有调用次数限制
- ⚠️ 有冷启动延迟
- ⚠️ 中国大陆访问速度慢

### 部署步骤

如果你仍然要使用 Vercel:

1. **删除旧的构建配置**
   ```bash
   # vercel.json 已被重命名为 vercel.json.bak
   # 如需使用 Vercel,创建新的 vercel.json:
   ```

2. **创建正确的 vercel.json**
   ```json
   {
     "buildCommand": "pnpm build"
   }
   ```

3. **在 Vercel 控制台设置**
   - Framework Preset: Astro
   - Build Command: `pnpm build`
   - Output Directory: `dist`
   - Install Command: `pnpm install`
   - Node.js Version: 18.x

4. **环境变量**
   与 Cloudflare Pages 相同

---

## Netlify 部署 (备选)

### 部署步骤

1. **netlify.toml** (已配置)
   ```toml
   [build]
     command = "pnpm build"
     publish = "dist"
   ```

2. **在 Netlify 控制台**
   - 连接 GitHub 仓库
   - 构建命令会自动读取 netlify.toml

3. **环境变量**
   与 Cloudflare Pages 相同

---

## Docker 部署 (自托管)

### 部署步骤

1. **构建镜像**
   ```bash
   docker build -t multi-channel-broadcast .
   ```

2. **运行容器**
   ```bash
   docker run -d \
     -p 4321:4321 \
     -e CHANNELS=channel1,channel2 \
     -e SITE_TITLE=我的站点 \
     --name broadcast \
     multi-channel-broadcast
   ```

3. **使用 docker-compose**
   ```bash
   docker-compose up -d
   ```

---

## 平台对比

| 平台 | 价格 | 速度 | 冷启动 | 推荐度 |
|------|------|------|--------|--------|
| Cloudflare Pages | 免费 | ⚡⚡⚡ | 无 | ⭐⭐⭐⭐⭐ |
| Netlify | 免费(有限制) | ⚡⚡ | 无 | ⭐⭐⭐⭐ |
| Vercel | 免费(有限制) | ⚡⚡ | 有 | ⭐⭐⭐ |
| Docker | 自托管 | ⚡⚡⚡ | 无 | ⭐⭐⭐⭐ |

---

## 常见问题

### Q: 为什么推荐 Cloudflare Pages?

A: 
- 完全免费,无使用限制
- 全球 CDN,中国访问友好
- 无冷启动问题
- 构建速度快

### Q: Vercel 部署失败怎么办?

A:
1. 确保删除了 `vercel.json` 中的 `builds` 配置
2. 使用 Cloudflare Pages 替代
3. 如果必须用 Vercel,确保 Node.js 版本为 18.x

### Q: 如何切换部署平台?

A:
- 从 Vercel 切换到 Cloudflare: 直接在 Cloudflare Pages 连接仓库即可
- 从 Cloudflare 切换到 Vercel: 恢复 `vercel.json.bak` 为 `vercel.json`

### Q: 部署后访问慢怎么办?

A:
- 使用 Cloudflare Pages (全球 CDN)
- 开启缓存优化 (已默认开启)
- 使用自定义域名而非 `.vercel.app` 域名

---

## 推荐配置

**生产环境推荐**: Cloudflare Pages
**开发测试**: 本地运行 `pnpm dev`
**自托管**: Docker

现在就开始部署吧! 🚀
