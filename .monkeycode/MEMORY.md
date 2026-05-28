# 用户指令记忆

本文件记录了用户的指令、偏好和教导，用于在未来的交互中提供参考。

## 格式

### 用户指令条目
用户指令条目应遵循以下格式：

[用户指令摘要]
- Date: [YYYY-MM-DD]
- Context: [提及的场景或时间]
- Instructions:
  - [用户教导或指示的内容，逐行描述]

### 项目知识条目
Agent 在任务执行过程中发现的条目应遵循以下格式：

[项目知识摘要]
- Date: [YYYY-MM-DD]
- Context: Agent 在执行 [具体任务描述] 时发现
- Category: [运维部署 | 构建方法 | 测试方法 | 排错调试 | 工作流协作 | 环境配置]
- Instructions:
  - [具体的知识点，逐行描述]

## 去重策略
- 添加新条目前，检查是否存在相似或相同的指令
- 若发现重复，跳过新条目或与已有条目合并
- 合并时，更新上下文或日期信息
- 这有助于避免冗余条目，保持记忆文件整洁

## 条目

### 代码修改前必须先确认
- Date: 2026-05-28
- Context: 用户多次强调不要自作主张修改代码
- Instructions:
  - 用户没有明确说"修改"、"改一下"、"修复"时，不要主动修改代码
  - 发现解决方案后，先问"要我现在改吗？"，等用户确认后再动手
  - 只分析、只回答、只定位问题，除非用户明确要求修改
  - 如果用户说"停"，立刻停止提交

### Service Binding 配置方式
- Date: 2026-05-28
- Context: Agent 在执行 Service Binding 额度优化任务时发现
- Category: 环境配置
- Instructions:
  - callWorkerApi 函数必须接收 env 参数（从 Astro.locals.runtime.env 传入）
  - 工具函数不能直接访问 Astro.locals.runtime.env，必须由调用方传入 env
  - 所有 API 调用点统一使用 callWorkerApi(pathname, env, options)
  - 强制使用 Service Binding，不提供 HTTP 降级（避免 Worker API 暴露公网）
  - Worker 域名可以停掉，不影响功能（只用 Worker 名称，不用域名）

### SITE_URL 环境变量配置
- Date: 2026-05-28
- Context: Agent 在修复 sitemap/RSS 出现 pages.dev 域名问题时发现
- Category: 环境配置
- Instructions:
  - middleware.js 读取 import.meta.env.SITE_URL 获取自定义域名
  - 环境变量名是 SITE_URL，不是 SITE
  - 用于生成 sitemap.xml、rss.xml 等静态文件的绝对 URL
  - 在 Cloudflare Pages Dashboard 设置：SITE_URL=https://你的自定义域名
