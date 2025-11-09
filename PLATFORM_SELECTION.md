# ⚠️ 重要:选择部署平台

## 问题说明

你的项目同时连接了多个部署平台:
- ✅ **Cloudflare Pages** (推荐)
- ⚠️ **Vercel** (不推荐,有限制)

每次 Git 推送都会触发两个平台同时构建,这会:
- 浪费构建资源
- 造成混淆(不知道访问哪个)
- 可能导致配置冲突

## 🎯 建议:只用一个平台

### 推荐方案:使用 Cloudflare Pages

**为什么?**
- ✅ 完全免费,无限制
- ✅ 全球 CDN,中国访问快
- ✅ 无冷启动问题
- ✅ 更简单的配置

**保留的 URL**:
```
https://multichannelbroadcast.pages.dev
```

**如何禁用 Vercel**:
1. 访问 [Vercel Dashboard](https://vercel.com/dashboard)
2. 找到 `MultiChannelBroadCast` 项目
3. Settings → Git → 断开 GitHub 连接
4. 或直接删除项目

### 备选方案:只用 Vercel

如果你坚持使用 Vercel:

**禁用 Cloudflare Pages**:
1. 访问 [Cloudflare Pages](https://dash.cloudflare.com/)
2. 找到项目
3. 删除项目

**注意事项**:
- Vercel 免费套餐有调用限制
- 需要在项目设置中确认 Node.js 版本为 20.x

## 📋 当前修复

### Vercel 部署错误修复

**问题**: `invalid "runtime": nodejs18.x`

**已修复**:
1. ✅ `package.json` 添加 `engines.node: ">=20.0.0"`
2. ✅ 创建简化的 `vercel.json`
3. ✅ Astro 配置优化

**现在 Vercel 应该可以正常部署了**

## 🔧 Cloudflare Pages URL 问题

你提到的问题:
```
访问 https://multichannelbroadcast.pages.dev/
跳转到 https://multichannelbroadcast.pages.dev/channel/miantiao_me/page/:page
```

**下一步调试**:
1. 确保只在一个平台部署
2. 清除 Cloudflare Pages 所有缓存
3. 删除所有旧部署
4. 访问 `/debug` 页面查看配置信息

## 🎯 推荐操作步骤

### 第一步:选择平台

**选 A: Cloudflare Pages (推荐)**
```bash
1. 禁用/删除 Vercel 项目
2. 在 Cloudflare Pages 清除缓存
3. 重新部署
4. 访问 https://multichannelbroadcast.pages.dev/debug
```

**选 B: Vercel**
```bash
1. 禁用/删除 Cloudflare Pages 项目
2. 等待 Vercel 重新部署
3. 访问你的 Vercel URL
```

### 第二步:确认环境变量

无论哪个平台,确保设置:
```bash
CHANNELS=miantiao_me,zaihuapd,sspai,zaobao_news,AI_News_CN,tnews365,kkaifenxiang
SITE_TITLE=多频道聚合
SITE_AVATAR=https://linux.do/user_avatar/linux.do/banlan/288/1119097_2.png
LOCALE=zh-cn
```

**不要设置**:
- ❌ SITE
- ❌ SITE_URL
- ❌ BASE_URL

### 第三步:测试

访问以下页面确认:
- [ ] 首页 `/`
- [ ] 调试页 `/debug`
- [ ] 频道页 `/channel/miantiao_me`
- [ ] RSS `/rss.xml`

## 📞 需要帮助?

告诉我:
1. 你想用哪个平台?
2. 访问 `/debug` 页面看到了什么?
3. 是否还有其他错误?

## 🔗 相关链接

- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Vercel 文档](https://vercel.com/docs)
- [项目部署指南](./DEPLOYMENT_GUIDE.md)
- [Cloudflare 部署指南](./CLOUDFLARE_DEPLOYMENT.md)
