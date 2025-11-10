# Telegram 评论功能实现文档

## 功能概述

MultiChannelBroadcast 现已支持 Telegram 评论功能,可以在帖子详情页展示 Telegram 频道消息的评论区。

## 实现方式

使用 Telegram 官方提供的 [Comments Widget](https://core.telegram.org/widgets/discussion) 嵌入式组件。

## 已修改的文件

### 1. `.env.example`
添加了 `COMMENTS` 配置项:
```env
## 启用 Telegram 评论功能 (在帖子详情页显示评论区)
## 设置为 true 启用,false 或留空禁用
# COMMENTS=true
```

### 2. `src/components/item.astro`
在组件中添加了评论区渲染逻辑:
```astro
{/* Telegram 评论区 */}
{getEnv(import.meta.env, Astro, 'COMMENTS') === 'true' && isItem && post.channel && (
  <div class="comments">
    <script
      is:inline
      async
      src="https://telegram.org/js/telegram-widget.js"
      data-telegram-discussion={`${post.channel}/${post.id}`}
      data-comments-limit="50"
      data-colorful="1"
      data-color="454545"
    />
  </div>
)}
```

**说明**:
- 仅在 `COMMENTS=true` 且 `isItem=true` (详情页) 且 `post.channel` 存在时显示
- `data-telegram-discussion`: 格式为 `频道名/消息ID`
- `data-comments-limit`: 最多显示 50 条评论
- `data-colorful`: 启用彩色头像
- `data-color`: 深色主题颜色

### 3. `src/pages/posts/[id].astro`
确保 post 对象包含 channel 信息:
```javascript
for (const channel of channels) {
  try {
    const result = await getSingleChannelInfo(Astro, channel, { id })
    if (result && result.id) {
      post = result
      // 将频道名称添加到 post 对象中,用于评论功能
      post.channel = channel
      channelName = channel
      break
    }
  } catch (e) {
    continue
  }
}
```

## 使用方法

### 1. 启用评论功能

在项目根目录创建或编辑 `.env` 文件:
```env
COMMENTS=true
```

### 2. 确保频道支持评论

评论功能需要 Telegram 频道开启了 **讨论组** 功能:

1. 打开 Telegram 频道设置
2. 进入 "讨论" 或 "Discussion" 选项
3. 关联一个讨论组

### 3. 测试评论功能

1. 启动开发服务器:
```bash
pnpm dev
```

2. 访问任意帖子详情页:
```
http://localhost:4321/posts/消息ID
```

3. 检查页面底部是否显示评论组件

## Widget 参数说明

| 参数 | 说明 | 可选值 |
|------|------|--------|
| `data-telegram-discussion` | 频道和消息ID | `频道名/消息ID` |
| `data-comments-limit` | 显示评论数量 | 1-999 (建议 50) |
| `data-colorful` | 启用彩色头像 | `1` (启用) / `0` (禁用) |
| `data-color` | 组件颜色主题 | 十六进制颜色代码 |
| `data-dark` | 强制深色模式 | `1` (启用) / `0` (禁用) |

## 样式定制

评论区的样式已在 `item.astro` 中定义:
```css
.comments {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color, #e0e0e0);
}
```

可以根据需要修改这些样式。

## 故障排除

### 评论区不显示

**可能原因**:
1. ❌ 未设置 `COMMENTS=true`
2. ❌ 频道未开启讨论组功能
3. ❌ 消息 ID 不正确
4. ❌ 网络问题导致 widget 脚本加载失败

**解决方法**:
1. 检查 `.env` 文件中的 `COMMENTS` 配置
2. 在 Telegram 中确认频道有讨论组
3. 确认 URL 中的消息 ID 正确
4. 检查浏览器控制台是否有 JavaScript 错误

### 评论显示不全

Telegram widget 默认只显示有限数量的评论。可以通过调整 `data-comments-limit` 参数修改:

```astro
data-comments-limit="100"  <!-- 最多显示 100 条 -->
```

### 样式冲突

如果评论区样式与网站主题不协调,可以:

1. 修改 `data-color` 参数以匹配网站主题
2. 使用 `data-dark="1"` 强制深色模式
3. 在 CSS 中覆盖 widget 样式 (部分可用)

## 性能考虑

- Widget 使用 `async` 异步加载,不会阻塞页面渲染
- 评论数据存储在 Telegram,不占用服务器资源
- 首次加载会有 1-3 秒延迟 (正常现象)

## 隐私说明

- 评论功能使用 Telegram 官方 widget
- 评论数据存储在 Telegram 服务器
- 用户需要登录 Telegram 才能发表评论
- 网站仅嵌入显示,不存储评论数据

## 参考资源

- [Telegram Discussion Widget 官方文档](https://core.telegram.org/widgets/discussion)
- [BroadcastChannel 项目](https://github.com/ccbikai/BroadcastChannel)
- [测试页面](./test-comments.html)

## 更新日志

### 2024-01-XX
- ✅ 实现 Telegram 评论功能
- ✅ 添加 `COMMENTS` 环境变量配置
- ✅ 更新文档和示例
- ✅ 创建测试页面

## 下一步改进

- [ ] 支持评论数量显示
- [ ] 支持评论预加载
- [ ] 支持自定义评论主题
- [ ] 添加评论加载状态提示
