# 视频播放修复

## 问题

从 Telegram 抓取的视频在本地站点无法播放

**示例**：
- 原始链接：https://t.me/s/akile_notice/1446 - 视频可以播放
- 抓取后：https://broadcast.yxj.wang/posts/akile_notice%2F1446 - 视频无法播放

## 根本原因

**实际抓取到的 HTML**：
```html
<video src="https://cdn5.telesco.pe/file/5d1ec09dee.mp4?token=..." class="tgme_widget_message_video js-message_video" width="100%" height="100%"></video>
```

**问题**：
- 代码正则只匹配 `telegram-cdn.org`，不匹配 `telesco.pe`
- 导致 URL 没有被转换成 `/static/` 代理路径
- 浏览器直接访问原始 URL 失败（跨域、防盗链）

**位置**：`workers/cache-worker.js` 第 405 行

## 解决方案

修改 `workers/cache-worker.js` 第 404-409 行

**修改前**：
```javascript
html = html.replace(
    /(<(?:video|audio|source)[^>]*src=")(https?:\/\/(cdn\d+\.telegram-cdn\.org)(\/file\/[^"]+))(")/gi,
    (match, prefix, fullUrl, host, path, suffix) => {
        return `${prefix}/static/${host}${path}${suffix}`;
    }
);
```

**修改后**：
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

**关键改动**：
1. 添加 `telesco.pe` 到域名匹配
2. 保留 URL 查询参数（token）
3. 使用完整 URL 而不是拼接

## 验证

修改后重新抓取帖子，验证：
1. 视频显示播放器
2. 视频能够播放
3. 进度条拖动正常

## 说明

**不需要修改的地方**：
- `parsePosts` 函数 - 抓取逻辑正常
- `src/pages/static/[...url].js` - 白名单已包含 `telesco.pe`
- 数据库 - 数据已正确存储
- 前端渲染 - 渲染逻辑正常