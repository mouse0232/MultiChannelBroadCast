# 视频播放修复 - 技术方案

## 问题分析

### 现象

- 原始链接：https://t.me/s/akile_notice/1446 - 视频正常播放
- 抓取后：https://broadcast.yxj.wang/posts/akile_notice%2F1446 - 视频无法播放

### 根本原因

**实际 HTML**（从抓取后的页面获取）：
```html
<video src="https://cdn5.telesco.pe/file/5d1ec09dee.mp4?token=..." class="tgme_widget_message_video js-message_video" width="100%" height="100%"></video>
```

**问题**：
1. 域名是 `cdn5.telesco.pe`，不是 `cdnX.telegram-cdn.org`
2. 正则表达式不匹配，URL 没有被转换
3. 浏览器直接访问原始 URL 失败

### 为什么需要转换

**未转换**：`https://cdn5.telesco.pe/file/xxx.mp4?token=...`
- 浏览器直接访问
- 遇到跨域、防盗链限制
- 失败 ❌

**转换后**：`/static/cdn5.telesco.pe/file/xxx.mp4?token=...`
- 浏览器请求自己的服务器
- 服务器代理到 Telegram CDN（添加必要的请求头）
- 成功 ✅

## 修复方案

### 修改位置

**文件**：`workers/cache-worker.js`
**函数**：`processMediaUrls`
**行号**：404-409

### 当前代码

```javascript
html = html.replace(
    /(<(?:video|audio|source)[^>]*src=")(https?:\/\/(cdn\d+\.telegram-cdn\.org)(\/file\/[^"]+))(")/gi,
    (match, prefix, fullUrl, host, path, suffix) => {
        return `${prefix}/static/${host}${path}${suffix}`;
    }
);
```

**问题**：
- 只匹配 `cdn\d+\.telegram-cdn\.org`
- 不匹配 `telesco.pe`
- 丢失 URL 查询参数（token）

### 修复后代码

```javascript
html = html.replace(
    /(<(?:video|audio|source)[^>]*src=")(https?:\/\/(?:cdn\d+\.)?(?:telegram-cdn\.org|telesco\.pe)(\/file\/[^"]+))(")/gi,
    (match, prefix, fullUrl, host, pathWithQuery, suffix) => {
        const cleanPath = fullUrl.replace(/^https?:\/\//, '');
        console.log(`[Media URL] ${fullUrl} → /static/${cleanPath}`);
        return `${prefix}/static/${cleanPath}${suffix}`;
    }
);
```

**改动**：
1. `(?:cdn\d+\.)?` - 可选的 `cdnX.` 前缀
2. `(?:telegram-cdn\.org|telesco\.pe)` - 支持两个域名
3. `pathWithQuery` - 保留查询参数
4. `fullUrl.replace(/^https?:\/\//, '')` - 使用完整 URL

## 验证步骤

### 1. 部署代码

```bash
git add workers/cache-worker.js
git commit -m "fix: 修复视频播放 - 支持 telesco.pe 域名"
git push
```

### 2. 重新抓取

等待定时任务或手动触发重新抓取 `akile_notice` 频道

### 3. 验证

访问 https://broadcast.yxj.wang/posts/akile_notice%2F1446

检查：
- [ ] 页面显示视频播放器
- [ ] 视频能够播放
- [ ] 进度条可以拖动
- [ ] 无错误日志

## 不需要修改的地方

- ✅ `parsePosts` 函数 - 抓取逻辑正常，视频标签已被正确提取
- ✅ `src/pages/static/[...url].js` - 白名单已包含 `telesco.pe`
- ✅ 数据库 - 数据已正确存储
- ✅ 前端渲染 - 渲染逻辑正常