# 快速配置指南 - 修复后的设置

## 🎯 必须修改的配置

打开 `.env` 文件,进行以下修改:

### 1. 移除图片代理前缀

```bash
# ❌ 错误配置(会导致图片路径错误)
# STATIC_PROXY=/static/

# ✅ 正确配置(留空或删除)
STATIC_PROXY=

# 或者如果你有自己的代理服务器
# STATIC_PROXY=https://your-proxy-domain.com/
```

### 2. 设置自定义站点头像(可选)

```bash
# 使用在线图片
SITE_AVATAR=https://your-domain.com/avatar.png

# 或使用本地图片(将图片放在 public/ 目录)
SITE_AVATAR=/avatar.png
```

### 3. 设置频道显示名称(可选)

```bash
# 格式: 频道用户名:显示名称;频道用户名:显示名称
CHANNEL_NAMES=miantiao_me:面条实验室;zaihuapd:再花播报;sspai:少数派
```

---

## 📝 完整配置示例

```bash
## =====================================
## 核心配置
## =====================================

CHANNELS=miantiao_me,zaihuapd,sspai
SITE_NAME=我的多频道博客
SITE_AVATAR=/avatar.png
CHANNEL_NAMES=miantiao_me:面条实验室;zaihuapd:再花播报;sspai:少数派

## =====================================
## 语言和时区
## =====================================

LOCALE=zh-cn
TIMEZONE=Asia/Shanghai

## =====================================
## 图片和静态资源
## =====================================

# 重要: 留空以避免图片路径错误
STATIC_PROXY=

## =====================================
## 社交媒体
## =====================================

TELEGRAM=your_username
GITHUB=your_username
TWITTER=your_username
```

---

## 🚀 应用配置

### 方法1: 重启开发服务器

```powershell
# 停止当前服务器 (Ctrl+C)
pnpm dev
```

### 方法2: 热重载

修改 `.env` 后,服务器会自动重启(可能需要刷新浏览器)

---

## ✅ 验证配置

### 1. 检查图片显示

访问 http://localhost:4321/

- ✅ 图片正常显示
- ❌ 图片显示 404 → 检查 `STATIC_PROXY` 是否为空

### 2. 检查频道导航

页面顶部应该显示:
```
🏠 全部  @面条实验室  @再花播报  @少数派
```

### 3. 检查站点头像

页面头部的头像应该是你设置的 `SITE_AVATAR`,而不是频道头像

---

## 🎨 添加自定义头像

### 步骤:

1. **准备图片**
   - 格式: PNG, JPG, SVG
   - 尺寸: 建议 256x256 或更大
   - 形状: 正方形最佳

2. **放置图片**
   ```powershell
   # 复制到 public 目录
   copy your-avatar.png d:\Documents\broadcast\MultiChannelBroadcast\public\avatar.png
   ```

3. **配置环境变量**
   ```bash
   SITE_AVATAR=/avatar.png
   ```

4. **重启服务器**
   ```powershell
   pnpm dev
   ```

---

## 📱 使用新功能

### 频道导航

点击顶部导航栏的频道名称:
- **🏠 全部** → 显示所有频道聚合内容
- **@频道名** → 只显示该频道的内容

### URL 结构

```
http://localhost:4321/              ← 所有频道
http://localhost:4321/channel/miantiao_me  ← 单频道
http://localhost:4321/posts/123     ← 文章详情
```

---

## 🐛 常见问题

### Q1: 图片还是不显示?

**检查**:
1. `.env` 中 `STATIC_PROXY=` 是否为空
2. 浏览器 F12 查看图片 URL 是否正确
3. 清除浏览器缓存并刷新

### Q2: 频道导航不显示?

**检查**:
1. `.env` 中是否配置了多个频道
2. 重启开发服务器

### Q3: 站点头像没有生效?

**检查**:
1. 图片文件是否存在于 `public/` 目录
2. `SITE_AVATAR` 路径是否正确
3. 重启开发服务器

### Q4: 频道显示名称没有变?

**检查**:
1. `CHANNEL_NAMES` 格式是否正确(使用分号和冒号)
2. 频道用户名是否匹配
3. 重启开发服务器

---

## 📞 需要帮助?

如果问题仍然存在:

1. 查看终端日志错误信息
2. 查看浏览器控制台(F12)
3. 检查 `.env` 文件格式
4. 查看 [CHANGELOG.md](./CHANGELOG.md) 了解更多

---

**最后更新**: 2025年11月9日
