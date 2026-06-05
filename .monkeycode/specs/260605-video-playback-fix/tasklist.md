# 视频播放修复 - 任务清单

## 任务

修改 `workers/cache-worker.js` 的正则表达式，支持 `telesco.pe` 域名

## 步骤

### 1. 修改代码（5 分钟）

**文件**：`workers/cache-worker.js`
**位置**：第 404-409 行

**修改**：
```javascript
// 修改前
html = html.replace(
    /(<(?:video|audio|source)[^>]*src=")(https?:\/\/(cdn\d+\.telegram-cdn\.org)(\/file\/[^"]+))(")/gi,
    (match, prefix, fullUrl, host, path, suffix) => {
        return `${prefix}/static/${host}${path}${suffix}`;
    }
);

// 修改后
html = html.replace(
    /(<(?:video|audio|source)[^>]*src=")(https?:\/\/(?:cdn\d+\.)?(?:telegram-cdn\.org|telesco\.pe)(\/file\/[^"]+))(")/gi,
    (match, prefix, fullUrl, host, pathWithQuery, suffix) => {
        const cleanPath = fullUrl.replace(/^https?:\/\//, '');
        console.log(`[Media URL] ${fullUrl} → /static/${cleanPath}`);
        return `${prefix}/static/${cleanPath}${suffix}`;
    }
);
```

### 2. 提交代码（5 分钟）

```bash
git add workers/cache-worker.js
git commit -m "fix: 修复视频播放 - 支持 telesco.pe 域名"
git push
```

### 3. 重新抓取（等待或手动触发）

**方式 1**：等待定时任务（5 分钟）

**方式 2**：检查是否有 `/api/regrab` 接口，手动触发重新抓取

### 4. 验证（5 分钟）

访问 https://broadcast.yxj.wang/posts/akile_notice%2F1446

检查：
- [ ] 页面显示视频播放器
- [ ] 视频能够播放
- [ ] 进度条可以拖动

### 5. 查看日志（可选）

查看 Worker 日志，确认：
```
[Media URL] https://cdn5.telesco.pe/file/xxx.mp4?token=... → /static/cdn5.telesco.pe/file/xxx.mp4?token=...
```

## 验收标准

- ✅ 视频显示播放器
- ✅ 视频能够播放
- ✅ 进度条可以拖动
- ✅ 无控制台错误

## 预计时间

总计：15-20 分钟

- 修改代码：5 分钟
- 提交部署：5 分钟
- 重新抓取：5-10 分钟（等待）
- 验证：5 分钟