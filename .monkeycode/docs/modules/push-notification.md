# 推送通知模块（Worker）

## 概述

推送通知模块集成在 `workers/cache-worker.js` 中，负责在新帖子写入 D1 后自动推送到 Telegram 频道。

## 架构位置

- **部署平台**：Cloudflare Workers
- **触发时机**：Queue 消费完成后，新帖子写入 D1 时
- **推送目标**：Telegram Bot API
- **去重存储**：D1 push_logs 表

## 推送流程

```
新帖子写入 D1
  ↓
检查 TELEGRAM_PUSH_ENABLED
  ↓
遍历新帖子列表
  ↓
检查 push_logs（D1 去重）
  ↓
提取纯文本摘要（150 字符）
  ↓
提取首图 URL
  ↓
有图？ → sendPhoto（图文）
  ↓
无图？ → sendMessage（纯文本）
  ↓
记录 push_logs
  ↓
随机延迟 1-2 秒
```

## 推送消息格式

### 图文消息（有图片时）

```
📢 [频道名] 标题

内容摘要（前 150 字符）...

阅读原文
```

调用 `sendPhoto` API：

```javascript
await $fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
  method: 'POST',
  body: {
    chat_id: channelId,
    photo: imageUrl,        // 帖子中的第一张图片
    caption: text,          // HTML 格式文本
    parse_mode: 'HTML'
  },
  timeout: 10000
})
```

### 纯文本消息（无图片时）

调用 `sendMessage` API：

```javascript
await $fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
  method: 'POST',
  body: {
    chat_id: channelId,
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  },
  timeout: 10000
})
```

## 去重机制

使用 D1 `push_logs` 表持久化记录已推送的帖子：

```sql
-- 检查是否已推送
SELECT 1 FROM push_logs WHERE post_id = ?

-- 记录已推送
INSERT OR IGNORE INTO push_logs (post_id) VALUES (?)
```

优势：
- 服务重启后去重记录不丢失
- 持久化存储，无容量限制

## 首次运行保护

```javascript
const isFirstRun = !meta || !lastMsgId

if (isFirstRun) {
  console.log(`First run for ${channel}, skipping push notifications.`)
} else {
  await triggerPush(posts, env)
}
```

首次抓取（初始化数据）时不推送，防止消息轰炸。

## 辅助函数

### triggerPush()

推送主函数，遍历帖子列表：

1. 检查推送开关 `TELEGRAM_PUSH_ENABLED`
2. 检查 Bot Token 和频道 ID 配置
3. 遍历每个帖子
4. 检查 push_logs 去重
5. 提取摘要和首图
6. 发送图文或纯文本消息
7. 记录 push_logs
8. 随机延迟 1-2 秒

### stripHtml()

去除 HTML 标签获取纯文本：

```javascript
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim()
}
```

### extractFirstImage()

提取第一张图片 URL：

```javascript
function extractFirstImage(html) {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match ? match[1] : null
}
```

### escapeHtml()

HTML 转义（Telegram parse_mode='HTML' 必需）：

```javascript
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
```

## 环境变量

| 变量 | 必需 | 说明 |
|------|------|------|
| `TELEGRAM_PUSH_ENABLED` | 否 | 设为 `true` 启用推送 |
| `TELEGRAM_BOT_TOKEN` | 是 | Telegram Bot Token |
| `TELEGRAM_PUSH_CHANNEL_ID` | 是 | 目标频道 ID（如 `@channel` 或 `-100xxx`） |

## 错误处理

| 错误类型 | 处理方式 |
|---------|---------|
| 配置无效 | 跳过推送 |
| Bot Token 无效（401） | 记录警告 |
| 无权限（403） | 记录警告 |
| 速率限制（429） | 记录警告 |
| 超时 | 10 秒超时，跳过 |
| 网络错误 | 记录警告 |

所有推送错误使用 `console.warn()` 记录，不阻塞主流程。

## 防风控

- 每条推送间随机延迟 1-2 秒
- 避免短时间内大量推送触发 Telegram 风控

## 日志格式

```
📩 Pushed: channel/123
Push failed for channel/123: error message
First run for channel, skipping push notifications.
```

## 初始化 API

访问 `/api/init` 可触发：
1. 发送测试消息（确认推送配置有效）
2. 全量抓取所有频道
3. 返回成功/失败统计

```json
{
  "status": "ok",
  "message": "Init complete. Refresh your website.",
  "totalChannels": 5,
  "successCount": 5,
  "errors": []
}
```
