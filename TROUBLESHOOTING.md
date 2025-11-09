# 🔧 故障排查指南

## ✅ 已修复的问题

### 1. Vercel Node.js 版本错误

**问题**:
```
Error: The following Serverless Functions contain an invalid "runtime":
  - _render (nodejs18.x)
```

**原因**:
- Astro Vercel 适配器默认使用 Node.js 18
- Vercel 已不再支持 `nodejs18.x` 运行时
- 仅设置 `package.json` 的 `engines` 字段不够

**解决方案**:
在 `astro.config.mjs` 中明确指定运行时:
```javascript
vercel: vercel({
  runtime: 'nodejs20.x',  // 👈 关键配置
  isr: false,
  edgeMiddleware: false,
  functionPerRoute: false,
  imageService: true,
  devImageService: 'sharp',
})
```

**验证**:
等待 Vercel 重新部署,查看构建日志不再出现 `nodejs18.x` 错误。

---

### 2. Cloudflare Pages 路由问题

**问题**:
- 访问首页 `/` 跳转到 `/channel/miantiao_me/page/:page`
- `/debug` 页面访问不到

**原因**:
`_routes.json` 配置过于复杂,可能导致:
- 路由匹配冲突
- 静态资源被错误处理
- Functions 路由未正确生效

**旧配置**:
```json
{
  "include": [
    "/",
    "/channel/*",
    "/before/*",
    "/after/*",
    "/posts/*",
    "/search/*",
    "/rss.xml",
    "/rss.json",
    "/sitemap.xml",
    "/sitemap/*",
    "/tags",
    "/links"
  ],
  "exclude": [...]
}
```

**问题分析**:
1. ❌ `/debug` 不在 include 列表中,无法访问
2. ❌ 路由规则太具体,可能导致新路由失效
3. ❌ `/before/*` 和 `/after/*` 应该在 `/channel/*/before/*` 下

**新配置**:
```json
{
  "version": 1,
  "include": [
    "/*"  // 所有动态路由都交给 Functions
  ],
  "exclude": [
    "/robots.txt",
    "/favicon.ico", 
    "/favicon.svg",
    "/rss.xsl"
  ]
}
```

**优势**:
- ✅ 简洁明了,所有动态路由都能访问
- ✅ 只排除真正的静态文件
- ✅ Cloudflare 会自动识别 `_astro/*` 等静态资源

---

## 🧪 测试步骤

### Vercel 测试

1. **等待重新部署**
   - 访问 https://vercel.com/dashboard
   - 查看最新部署状态
   - 确认构建日志没有 `nodejs18.x` 错误

2. **测试页面**
   ```bash
   # 替换为你的 Vercel URL
   curl https://your-project.vercel.app/
   curl https://your-project.vercel.app/debug
   curl https://your-project.vercel.app/channel/miantiao_me
   ```

3. **预期结果**
   - ✅ 首页正常显示聚合内容
   - ✅ `/debug` 显示环境变量信息
   - ✅ 频道页正常显示

---

### Cloudflare Pages 测试

1. **清除缓存**
   - 访问 [Cloudflare Pages Dashboard](https://dash.cloudflare.com/)
   - 进入项目设置
   - 删除所有旧部署(保留最新的)

2. **测试路由**
   ```bash
   # 测试首页
   curl https://multichannelbroadcast.pages.dev/
   
   # 测试调试页
   curl https://multichannelbroadcast.pages.dev/debug
   
   # 测试频道页
   curl https://multichannelbroadcast.pages.dev/channel/miantiao_me
   
   # 测试分页
   curl https://multichannelbroadcast.pages.dev/channel/miantiao_me/after/1
   ```

3. **预期结果**
   - ✅ 首页不再跳转,显示聚合内容
   - ✅ `/debug` 可以访问,显示环境变量
   - ✅ 所有频道页和分页正常

---

## 🔍 如果问题仍然存在

### Cloudflare 持续跳转问题

如果首页仍然跳转到 `/channel/miantiao_me/page/:page`:

1. **检查中间件逻辑**
   访问 `/debug` 查看:
   ```javascript
   SITE_URL: ???
   url.origin: ???
   url.pathname: ???
   ```

2. **可能的原因**
   - 环境变量 `SITE` 被意外设置了错误的值
   - 中间件中的重定向逻辑有问题

3. **临时禁用重定向**
   ```bash
   # 在 Cloudflare Pages 设置中添加环境变量
   DISABLE_REDIRECT=true
   ```

---

### Vercel 构建错误

如果仍然出现 Node.js 版本错误:

1. **检查构建日志**
   ```
   [@astrojs/vercel/serverless] 
   The local Node.js version (22) is not supported...
   Your project will use Node.js 18 as the runtime instead.
   ```

2. **手动配置 Vercel 项目**
   - 访问项目设置 → Functions
   - 设置 Node.js 版本为 `20.x`
   - 重新部署

3. **如果还是不行**
   ```bash
   # 删除 .vercel 目录和缓存
   rm -rf .vercel node_modules
   pnpm install
   
   # 推送触发重新部署
   git commit --allow-empty -m "chore: rebuild"
   git push
   ```

---

## 📋 检查清单

部署后请确认:

### 必须测试
- [ ] 首页 `/` 正常显示
- [ ] 调试页 `/debug` 可以访问
- [ ] 频道页 `/channel/miantiao_me` 正常
- [ ] 分页 `/channel/miantiao_me/after/1` 正常
- [ ] RSS `/rss.xml` 可以访问
- [ ] 静态资源加载正常(CSS/图片)

### 可选测试  
- [ ] 搜索 `/search/test` 正常
- [ ] 标签页 `/tags` 正常(如果启用)
- [ ] 友链页 `/links` 正常(如果启用)

---

## 🎯 最佳实践建议

### 1. 选择主要部署平台

**为什么?**
- 同时部署到多个平台会造成混淆
- 每次推送触发多次构建浪费资源
- 环境变量配置不一致导致问题

**建议: 使用 Cloudflare Pages**
- ✅ 完全免费,无限制
- ✅ 全球 CDN,访问快
- ✅ 支持环境变量
- ✅ 自动 HTTPS

**如果要用 Vercel**:
- 去 Cloudflare 删除项目
- 在 `.gitignore` 添加 `public/_routes.json`
- 在 `.gitignore` 添加 `public/_headers`

---

### 2. 环境变量配置

**Cloudflare Pages**:
```bash
CHANNELS=miantiao_me,zaihuapd,sspai,zaobao_news,AI_News_CN,tnews365,kkaifenxiang
SITE_TITLE=多频道聚合
SITE_AVATAR=https://linux.do/user_avatar/linux.do/banlan/288/1119097_2.png
LOCALE=zh-cn
TIMEZONE=Asia/Shanghai
```

**不要设置**:
- ❌ `SITE` (会被自动检测)
- ❌ `SITE_URL` (会导致路由问题)
- ❌ `BASE_URL` (不需要)

---

### 3. 调试技巧

**访问调试页**:
```
https://your-domain.com/debug
```

**检查内容**:
- `SITE_URL`: 应该是完整的域名,如 `https://your-domain.com`
- `url.origin`: 应该与 SITE_URL 一致
- `CHANNELS`: 应该显示你的频道列表
- `adapter`: 应该显示正确的适配器名称

**常见问题**:
- 如果 `SITE_URL` 是 `undefined` → 环境变量未设置
- 如果 `SITE_URL` 包含路径 → 配置错误
- 如果重定向到其他页面 → 中间件有问题

---

## 📞 还需要帮助?

访问 `/debug` 页面后,把以下信息发给我:

1. **Debug 页面输出**
   ```
   SITE_URL: ???
   url.origin: ???
   url.pathname: ???
   CHANNELS: ???
   ```

2. **访问哪个平台?**
   - [ ] Cloudflare Pages
   - [ ] Vercel
   - [ ] 其他

3. **具体问题描述**
   - 访问什么 URL?
   - 实际发生了什么?
   - 预期应该是什么?

4. **浏览器控制台错误**(F12 → Console)
   - 截图或复制错误信息

---

## 📚 相关文档

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - 完整部署指南
- [CLOUDFLARE_DEPLOYMENT.md](./CLOUDFLARE_DEPLOYMENT.md) - Cloudflare 专属指南
- [PLATFORM_SELECTION.md](./PLATFORM_SELECTION.md) - 平台选择建议
- [README.md](./README.md) - 项目介绍

---

**最后更新**: 2025-11-09  
**适用版本**: v1.0.0+  
**修复提交**: 878c3d4
