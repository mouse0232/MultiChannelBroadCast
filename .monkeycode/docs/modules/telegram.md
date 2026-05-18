# Telegram 内容抓取模块（Worker）

## 概述

`workers/cache-worker.js` 中的抓取模块负责从 Telegram 频道获取和解析内容。

## 架构位置

- **部署平台**：Cloudflare Workers
- **触发方式**：Cron 定时触发 + Queue 异步消费
- **数据存储**：Cloudflare D1 数据库
- **依赖服务**：Telegram t.me/s/{channel} 公开频道页面

## 主要功能

### 1. 定时抓取

通过 Cloudflare Cron 触发器，每 5 分钟执行一次：

1. 读取 `CHANNELS` 环境变量
2. 将每个频道发送到 Queue 消息队列
3. 清理一年前的旧数据

### 2. Queue 消费

Queue 消费者并行处理多个频道：

1. 读取 `channel_meta.last_msg_id`（上次抓取进度）
2. 请求 Telegram 页面
3. 解析 HTML 提取新消息
4. 写入 D1 数据库
5. 触发推送通知（非首次运行）
6. 更新 `channel_meta` 进度

### 3. 内容解析

使用 Cheerio 解析 Telegram 频道页面 (`t.me/s/{channel}`) 的 HTML，提取：

| 元素 | 选择器 | 说明 |
|------|--------|------|
| 频道标题 | `.tgme_page_title span` | 频道显示名称 |
| 频道头像 | `.tgme_page_photo_image img` | 头像 URL |
| 消息容器 | `.tgme_widget_message_wrap` | 每条消息的包装 |
| 消息 ID | `data-post` 属性 | 格式：`channel/12345` |
| 消息文本 | `.tgme_widget_message_text` | 文本内容 |
| 消息时间 | `.tgme_widget_message_date time` | 发布时间 |
| 照片 | `.tgme_widget_message_photo_wrap` | 背景图 URL |
| 视频 | `.tgme_widget_message_video_wrap` | 视频元素 |
| 链接预览图 | `.tgme_widget_message_link_image` | 预览图片 |

### 4. 多媒体处理

#### 方案 1：图片代理（wsrv.nl，默认）

```javascript
// 照片背景图
background-image:url('https://cdn5.telesco.pe/file/...')
// 转换为
<img src="https://wsrv.nl/?url=https%3A%2F%2Fcdn5.telesco.pe%2Ffile%2F..." />
```

- 所有图片使用 `https://wsrv.nl/?url={encoded_url}` 代理
- 确保国内可访问
- wsrv.nl 自带 CDN 缓存

#### 方案 2：图片代理（R2 存储，可选）

```javascript
// 上传到 R2
await env.R2.put(key, imageBuffer)
// 访问 URL
<img src="/r2/{key}" />
```

- 图片持久化存储在 Cloudflare R2
- 完全可控，符合数据合规要求
- 占用 R2 存储配额

#### 视频/音频代理（Worker 本地）

```javascript
// 视频源
<video src="https://cdn4.telegram-cdn.org/file/xyz.mp4">
// 转换为
<video src="/static/cdn4.telegram-cdn.org/file/xyz.mp4">
```

- URL 格式：`/static/{host}/{path}`
- Worker 代理转发，支持 Range 请求
- 可拖动进度条

### 5. 防风控配置

#### UA 池

```javascript
const USER_AGENTS = [
  'Chrome 122 (Windows)',
  'Chrome 121 (Mac)',
  'Firefox 123 (Windows)',
  'Safari 17.2 (Mac)',
]
```

每次请求随机选择 User-Agent。

#### Host 池

```javascript
const hosts = (env.TELEGRAM_HOST || 't.me').split(',')
const host = hosts[Math.floor(Math.random() * hosts.length)]
```

支持配置多个 Telegram 主机轮询。

#### 随机延迟

```javascript
await randomDelay(1000, 3000)  // 抓取间隔
await randomDelay(1000, 2000)  // 推送间隔
```

### 6. 增量抓取

```javascript
// 获取上次抓取进度
const meta = await env.DB.prepare(
  "SELECT last_msg_id FROM channel_meta WHERE channel = ?"
).bind(channel).first()

// 跳过已抓取的旧消息
if (lastMsgId && parseInt(rawId) <= parseInt(lastMsgId)) {
  continue
}

// 更新进度
INSERT OR REPLACE INTO channel_meta
  (channel, last_msg_id, title, avatar)
  VALUES (?, ?, ?, ?)
```

## 数据结构

### 抓取结果

```javascript
{
  posts: [
    {
      id: 'channel/12345',           // 完整 ID
      channel: 'channel',            // 频道用户名
      title: '帖子标题',              // 自动提取（最多 100 字符）
      content: '<p>HTML 内容</p>',   // 含代理后媒体的 HTML
      datetime: '2024-05-07T11:54:14+00:00'  // 发布时间
    }
  ],
  info: {
    title: 'Channel Name',           // 频道标题
    avatar: 'https://wsrv.nl/?url=...'  // 代理后的头像
  }
}
```

## 辅助函数

### parsePosts()

从 HTML 解析帖子列表：

1. 提取频道标题和头像
2. 遍历 `.tgme_widget_message_wrap` 元素
3. 过滤已抓取的旧消息（基于 lastMsgId）
4. 提取文本内容
5. 提取照片（background-image URL）
6. 提取视频（video 标签或缩略图）
7. 提取链接预览图片
8. 合并文本和媒体到 contentHtml
9. 提取发布时间

### processMediaUrls()

替换 HTML 中的媒体链接：

1. `<img>` src → wsrv.nl 代理
2. `<video/audio>` src → /static/ 代理

### fetchAndParse()

带防风控的抓取：

1. 随机选择 UA 和 Host
2. 请求 `t.me/s/{channel}`
3. 调用 `parsePosts()` 解析

## 错误处理

- 网络请求：重试 2 次，间隔 2 秒
- UA 池：随机切换避免被封
- Host 池：随机轮询
- 解析错误：跳过问题消息

## 性能优化

- Queue 并发处理多个频道
- 增量抓取（只获取新消息）
- 批量写入 D1（`env.DB.batch()`）
- 随机延迟避免触发 Telegram 风控
- Cache API 缓存响应（可选，降低 D1 读取）
- 基于 published_at 索引优化查询
