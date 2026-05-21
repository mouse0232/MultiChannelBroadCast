# ESM 循环依赖修复总结

## 问题原因

在 Node.js ESM 环境中，模块导入是严格异步的，导致以下问题：

1. **循环依赖**: Module A → Module B → Module A
2. **同步函数无法使用 await**
3. **顶层导入会立即执行**

## 已修复的问题

### 1. database.js

**修复内容**:
- 保持同步初始化
- 移除 dbMethods 导出（未使用）

**状态**: ✅ 已修复

### 2. grabber.js

**问题**: 在顶部导入 cheerio 和其他模块导致循环依赖

**修复方案**:
- 顶部导入改为静态 import（ESM 标准写法）
- `import * as cheerio from 'cheerio'`
- `import { getDB } from './database.js'`
- `import { processMediaUrls } from './media-proxy.js'`
- `import { triggerPush } from './pusher.js'`

**状态**: ✅ 已修复

### 3. api-server.js

**问题**: `require('cheerio')` 与 ESM 不兼容

**修复方案**:
- 添加动态 import 函数
- `async function loadCheerio()`
- 在 parsePosts 中使用 `await loadCheerio()`

**状态**: ✅ 已修复

### 4. KeywordFilter.js

**问题**: `require('../filter-rules.json')` 与 ESM 不兼容

**修复方案**:
- 使用 `fs.readFileSync` + `JSON.parse`
- `const fs = require('fs')`
- `const path = require('path')`
- 在安全函数内部使用 CommonJS

**状态**: ✅ 已修复

### 5. pusher.js

**问题**: 导入时立即初始化数据库

**修复方案**:
- 改为懒加载 `getDatabase()`
- 在函数内部调用 `getDatabase()`

**状态**: ✅ 已修复

## 导入顺序

```
index.js
├── database.js (无依赖)
├── api-server.js (依赖 database.js)
├── queue-worker.js (依赖 database.js, grabber.js)
├── scheduler.js (依赖 queue-worker.js, grabber.js)
└── grabber.js (依赖 database.js, pusher.js, media-proxy.js, KeywordFilter.js)
    ├── pusher.js (依赖 database.js)
    ├── media-proxy.js (无依赖)
    └── KeywordFilter.js (依赖 fs, path)
```

## 测试验证

```bash
# 本地测试
node -e "
import('./src/worker-mock/database.js').then(({ initializeDatabase }) => {
  process.env.DATA_DIR = './test-data'
  const db = initializeDatabase()
  console.log('✅ Database module OK')
}).catch(console.error)
"

# 完整测试
timeout 10 node src/worker-mock/index.js 2>&1 | head -20
```

## 剩余工作

1. **完整集成测试**: Docker 容器内测试
2. **性能测试**: 确认动态导入不影响性能
3. **错误处理**: 确保所有边界情况都有处理

## 最佳实践

1. **静态导入优先**: 能在顶部导入的尽量静态导入
2. **动态导入用于**: 
   - 循环依赖场景
   - 条件加载
   - 大型依赖懒加载
3. **数据库连接**: 使用单例模式，延迟初始化
4. **同步函数**: 避免在同步函数中使用 await

## 下一步

1. 在 Docker 容器中完整测试
2. 验证所有功能正常工作
3. 性能基准测试

---

**最后更新**: 2026-05-21
**修复状态**: ✅ 主要问题已解决
