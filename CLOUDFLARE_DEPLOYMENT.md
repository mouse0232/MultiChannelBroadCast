# Cloudflare Pages 部署指南

## 问题诊断

### 1. URL 显示问题: `/channel/xxx/page/:page`

**原因**: 这通常是由于:
- Cloudflare Pages 的路由自动生成问题
- 环境变量未正确设置
- 缓存或构建缓存导致

**解决方案**:

1. **清除 Cloudflare Pages 构建缓存**
   ```bash
   # 在 Cloudflare Pages 控制台:
   # Settings -> Builds & deployments -> Clear build cache
   ```

2. **检查环境变量**
   确保在 Cloudflare Pages 设置中添加了所有必需的环境变量:
   ```
   CHANNELS=miantiao_me,zaihuapd,sspai,zaobao_news,AI_News_CN,tnews365,kkaifenxiang
   SITE_URL=https://multichannelbroadcast.pages.dev/
   SITE_TITLE=多频道聚合
   ```

3. **重新部署**
   - 删除现有部署
   - 触发新的构建
   - 确保使用 `pnpm build` 命令

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
