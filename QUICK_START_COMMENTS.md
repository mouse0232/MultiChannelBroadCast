# 快速启用评论功能

## 3 步启用评论

### 1️⃣ 配置环境变量

编辑 `.env` 文件,添加:
```env
COMMENTS=true
```

### 2️⃣ 确保频道支持评论

在 Telegram 中:
1. 打开频道设置
2. 找到 "讨论" / "Discussion" 选项
3. 关联一个讨论组

### 3️⃣ 重启项目

```bash
pnpm dev
```

## ✅ 测试

访问任意帖子详情页,例如:
```
http://localhost:4321/posts/123
```

页面底部应该会显示 Telegram 评论组件。

## 🔧 故障排查

### 评论区不显示?

检查清单:
- [ ] `.env` 文件中设置了 `COMMENTS=true`
- [ ] 频道已开启讨论组功能
- [ ] URL 中的消息 ID 正确
- [ ] 浏览器控制台无 JavaScript 错误

### 如何查看控制台?

**Chrome / Edge**:
- 按 `F12` 或 `Ctrl+Shift+I`
- 切换到 "Console" 标签

**Firefox**:
- 按 `F12` 或 `Ctrl+Shift+K`

### 检查频道是否支持评论

1. 在 Telegram 中打开你的频道
2. 发送一条测试消息
3. 点击消息,查看是否有 "评论" 按钮
4. 如果没有,说明未开启讨论组

## 📚 完整文档

详细说明请参考:
- [COMMENTS_FEATURE.md](./COMMENTS_FEATURE.md) - 完整功能文档
- [COMMENTS_IMPLEMENTATION.md](./COMMENTS_IMPLEMENTATION.md) - 实现总结
- [test-comments.html](./test-comments.html) - 测试页面

## 🎯 Widget 参数

可以在 `src/components/item.astro` 中修改:

```astro
<script
  data-comments-limit="50"    <!-- 评论数量 -->
  data-colorful="1"           <!-- 彩色头像 -->
  data-color="454545"         <!-- 主题颜色 -->
  data-dark="1"               <!-- 强制深色模式(可选) -->
/>
```

## 💡 提示

- 评论数据存储在 Telegram,不占用你的服务器资源
- 首次加载需要 1-3 秒,这是正常现象
- 用户需要登录 Telegram 才能发表评论
- 最多显示 50 条评论(可配置)

---

**问题?** 查看 [COMMENTS_FEATURE.md](./COMMENTS_FEATURE.md) 的故障排除章节
