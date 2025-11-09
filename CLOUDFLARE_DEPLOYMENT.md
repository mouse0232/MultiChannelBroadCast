# Cloudflare Pages 部署指南

## 🚨 关键问题修复

### 问题 1: URL 错误显示为 `/channel/xxx/page/:page`

**根本原因**: 
- Cloudflare Pages 可能缓存了旧的路由配置
- 或者 `SITE_URL` 环境变量设置不正确

**解决步骤**:

1. **删除现有部署**
   - 进入 Cloudflare Pages 项目
   - 删除所有现有部署

2. **清除构建缓存**
   - Settings → Builds & deployments → Clear build cache

3. **正确设置环境变量** (重要!)
   ```bash
   CHANNELS=miantiao_me,zaihuapd,sspai,zaobao_news,AI_News_CN,tnews365,kkaifenxiang
   SITE=https://multichannelbroadcast.pages.dev
   SITE_TITLE=多频道聚合
   SITE_AVATAR=https://linux.do/user_avatar/linux.do/banlan/288/1119097_2.png
   ```
   
   **注意**: 
   - `SITE` 不要加尾部斜杠 `/`
   - 或者根本不设置 `SITE`,让 Cloudflare 自动检测

4. **重新部署**
   - 触发新的构建
   - 等待完成

### 问题 2: 头像图片无法显示

**根本原因**: 
- 之前使用 `wsrv.nl` 图片代理,但处理 URL 时移除了协议前缀
- 导致 `https://linux.do/...` 变成了 `linux.do/...`

**已修复**:
- 移除了所有 `wsrv.nl` 图片代理逻辑
- 直接使用原始图片 URL
- 现在 `SITE_AVATAR` 可以正常工作

## 完整部署配置

### Cloudflare Pages 构建设置

```yaml
Framework preset: Astro
Build command: pnpm build  
Build output directory: dist
Root directory: /
Node version: 18 或 20
```

### 环境变量配置 (Production & Preview)

**必需**:
```bash
CHANNELS=channel1,channel2,channel3
```

**推荐设置**:
```bash
# 站点基础配置
SITE_TITLE=您的站点名称
SITE_AVATAR=https://your-avatar-url.com/avatar.png

# 不要设置 SITE_URL,让 Cloudflare 自动检测
# 如果一定要设置,确保格式正确(没有尾部斜杠):
# SITE=https://your-site.pages.dev

# 语言和时区
LOCALE=zh-cn
TIMEZONE=Asia/Shanghai

# 社交媒体
TELEGRAM=your_telegram
GITHUB=your_github
TWITTER=your_twitter
```

### 关键点检查清单

部署前检查:
- [ ] `CHANNELS` 环境变量已设置
- [ ] 不要设置 `SITE_URL`,或确保格式正确(无尾部斜杠)
- [ ] `SITE_AVATAR` 使用完整的 HTTPS URL
- [ ] 清除了构建缓存
- [ ] 删除了旧的部署

部署后验证:
- [ ] 访问首页 `/` 正常
- [ ] 访问频道页 `/channel/xxx` URL 正确
- [ ] 左侧导航显示正常
- [ ] 头像图片显示正常
- [ ] 点击"更早"/"更新"链接正确

### 常见URL问题调试

如果仍然出现 `/page/:page` 问题:

1. **检查浏览器开发者工具**
   ```
   Network → Headers → Request URL
   ```
   看实际请求的URL是什么

2. **检查 HTML 源代码**
   右键查看源代码,搜索 `href=`
   看生成的链接是否正确

3. **检查环境变量**
   ```bash
   # 在 Cloudflare Pages Functions 日志中查看
   console.log(process.env.SITE)
   console.log(import.meta.env.SITE)
   ```

4. **临时禁用缓存**
   在 URL 后加 `?t=123` 强制刷新

### 性能优化

### 2. 首次访问加载慢

**原因**: SSR 模式下,每次请求都需要实时获取 Telegram 数据

**优化策略**:

1. **增加缓存时间**
   - 已将 LRU 缓存从 5 分钟延长到 15 分钟
   - 增加缓存大小从 50MB 到 100MB
   - 启用过期数据保留

2. **Cloudflare Workers 缓存**
   - Cloudflare 会自动缓存函数响应
   - 首次访问慢,后续访问会很快

3. **边缘缓存优化**
   在 `public/_headers` 文件中添加:
   ```
   /*
     Cache-Control: public, max-age=300, s-maxage=900, stale-while-revalidate=1800
   ```

## 部署配置

### Cloudflare Pages 设置

**构建配置**:
```
Framework preset: Astro
Build command: pnpm build
Build output directory: dist
Node version: 18 或 20
```

**环境变量** (Production):
```bash
# 必需
CHANNELS=频道1,频道2,频道3
SITE_URL=https://your-site.pages.dev/

# 可选
SITE_TITLE=网站标题
SITE_DESCRIPTION=网站描述
SITE_AVATAR=自定义头像URL
LOCALE=zh-cn
```

### 性能优化建议

1. **使用 Cloudflare Workers KV 存储**
   可以考虑将缓存存储到 KV,实现跨请求共享缓存

2. **预热缓存**
   部署后可以使用脚本预先访问所有频道页面来填充缓存

3. **CDN 加速**
   确保静态资源(图片、CSS、JS)通过 Cloudflare CDN 分发

## 常见问题

### Q: 为什么本地开发正常,部署后URL错误?

A: 检查以下几点:
1. `SITE_URL` 环境变量是否正确设置(必须以 `/` 结尾)
2. 清除 Cloudflare 构建缓存
3. 查看部署日志是否有错误

### Q: 如何加快首次访问速度?

A: 
1. 部署后立即访问所有页面预热缓存
2. 使用 `curl` 脚本批量访问:
   ```bash
   curl https://your-site.pages.dev/
   curl https://your-site.pages.dev/channel/频道1
   curl https://your-site.pages.dev/channel/频道2
   ```

### Q: 缓存多久更新一次?

A: 
- LRU 缓存: 15 分钟
- Cloudflare 边缘缓存: 5-15 分钟
- 可以通过刷新页面强制更新

## 测试部署

部署后测试清单:
- [ ] 访问首页 `/`
- [ ] 访问各个频道 `/channel/xxx`
- [ ] 测试分页 `/channel/xxx/before/123`
- [ ] 测试搜索功能
- [ ] 检查左侧导航是否正常
- [ ] 检查 RSS 订阅是否可用

## 回滚方案

如果部署出现问题:
1. 在 Cloudflare Pages 控制台找到之前的部署
2. 点击 "Rollback" 回滚到上一个版本
3. 或者在 Git 仓库中回退提交并重新推送
