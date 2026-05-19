# 关键词过滤功能技术设计文档

**版本**: 5.0  
**创建日期**: 2026-05-19  
**更新日期**: 2026-05-19  
**状态**: 草案

---

## 1. 架构概述

### 1.1 方案设计

**核心思想**: 使用 **JSON 配置文件** 定义过滤规则，打包进 Worker 代码，部署后生效。

| 特性 | 设计方案 |
|------|----------|
| **规则存储** | `filter-rules.json` (打包进 Worker) |
| **规则加载** | `import filterRules from '../filter-rules.json'` |
| **规则更新** | 修改配置文件后重新部署 Worker |
| **环境变量** | `FILTER_ENABLED` (统一开关) |

### 1.2 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    关键词过滤功能                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         filter-rules.json (打包进 Worker)             │   │
│  │         import filterRules from '../filter-rules.json'│   │
│  └─────────────────────────────────────────────────────┘   │
│                          ▲                                  │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             workers/cache-worker.js                  │   │
│  │                                                       │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │  1. 导入配置文件 (只读)                        │    │   │
│  │  │  2. 解析规则 (缓存到内存)                      │    │   │
│  │  │  3. 过滤帖子                                   │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 配置文件设计

### 2.1 文件位置

```
project-root/
├── workers/
│   └── cache-worker.js           # 主 Worker
├── src/
│   └── lib/
│       └── KeywordFilter.js      # 核心过滤类
└── filter-rules.json             # 过滤规则配置 (打包进 Worker)
```

### 2.2 配置格式

```json
{
  "global": {
    "mode": "blacklist",
    "rules": [
      {
        "id": "1",
        "pattern": "垃圾广告",
        "ruleType": "keyword",
        "isActive": true,
        "description": "过滤垃圾广告",
        "createdAt": "2026-05-19T00:00:00.000Z"
      },
      {
        "id": "2",
        "pattern": "spam|advertisement",
        "ruleType": "regex",
        "isActive": true,
        "description": "过滤英文广告",
        "createdAt": "2026-05-19T00:00:00.000Z"
      }
    ]
  },
  "channels": {
    "channel1": {
      "mode": "blacklist",
      "inheritGlobal": true,
      "rules": [
        {
          "id": "3",
          "pattern": "特定关键词",
          "ruleType": "keyword",
          "isActive": true,
          "description": "",
          "createdAt": "2026-05-19T00:00:00.000Z"
        }
      ]
    }
  }
}
```

### 2.3 配置字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `global.mode` | string | 是 | 全局过滤模式：`blacklist` 或 `whitelist` |
| `global.rules` | array | 是 | 全局规则列表 |
| `channels.{id}.mode` | string | 否 | 渠道过滤模式，默认继承全局 |
| `channels.{id}.inheritGlobal` | boolean | 否 | 是否继承全局规则，默认 `true` |
| `channels.{id}.rules` | array | 否 | 渠道特有规则列表 |
| `rules[].id` | string | 是 | 规则唯一 ID |
| `rules[].pattern` | string | 是 | 关键词或正则表达式 |
| `rules[].ruleType` | string | 是 | `keyword` 或 `regex` |
| `rules[].isActive` | boolean | 是 | 是否启用 (默认 `true`) |
| `rules[].description` | string | 否 | 规则描述 (可选) |
| `rules[].createdAt` | string | - | 创建时间 |

### 2.4 空配置模板

```json
{
  "global": {
    "mode": "blacklist",
    "rules": []
  },
  "channels": {}
}
```

---

## 3. 核心代码实现

### 3.1 KeywordFilter 类

**文件**: `src/lib/KeywordFilter.js`

```javascript
/**
 * 关键词过滤器
 */
export class KeywordFilter {
  /**
   * @param {Object} config - 过滤配置
   * @param {string} config.mode - 'blacklist' | 'whitelist'
   * @param {Array} config.rules - 规则数组 [{ pattern, ruleType, isActive }]
   */
  constructor(config = { mode: 'blacklist', rules: [] }) {
    this.mode = config.mode;
    this.rules = config.rules || [];
    this.compiledRules = this.compileRules(this.rules);
  }

  /**
   * 预编译规则 (提升性能)
   */
  compileRules(rules) {
    return rules
      .filter(rule => rule.isActive !== false)
      .map(rule => {
        if (rule.ruleType === 'regex') {
          try {
            return {
              ...rule,
              regex: new RegExp(rule.pattern, 'i')
            };
          } catch (error) {
            console.error(`Invalid regex pattern: ${rule.pattern}`, error);
            return null;
          }
        } else {
          return {
            ...rule,
            keyword: rule.pattern.toLowerCase()
          };
        }
      })
      .filter(Boolean);
  }

  /**
   * 过滤单个帖子
   * @param {Object} post - { title, content, channel }
   * @returns {Object} { passed: boolean, matchedRules: [], mode: string }
   */
  filter(post) {
    const content = `${post.title || ''} ${post.content || ''}`;
    const matchedRules = [];

    for (const rule of this.compiledRules) {
      try {
        const matched = rule.ruleType === 'regex'
          ? rule.regex.test(content)
          : content.toLowerCase().includes(rule.keyword);

        if (matched) {
          matchedRules.push({
            id: rule.id,
            pattern: rule.pattern,
            ruleType: rule.ruleType
          });
        }
      } catch (error) {
        console.error(`Rule match error:`, error);
      }
    }

    const passed = this.evaluate(matchedRules);

    return {
      passed,
      matchedRules,
      mode: this.mode
    };
  }

  /**
   * 评估过滤结果
   */
  evaluate(matchedRules) {
    if (this.mode === 'blacklist') {
      return matchedRules.length === 0;
    } else {
      return matchedRules.length > 0;
    }
  }
}

/**
 * 规则加载器
 */
export class RuleLoader {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
  }

  /**
   * 获取渠道规则集
   * @param {string} channel - 渠道 ID
   * @returns {Object} { mode, rules }
   */
  loadRules(channel = 'global') {
    const cacheKey = channel;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // 1. 获取渠道配置
    let channelConfig = this.config.channels?.[channel];
    
    // 2. 如果渠道没有配置，使用全局配置
    if (!channelConfig) {
      channelConfig = this.config.global || { mode: 'blacklist', rules: [] };
    }

    // 3. 处理继承逻辑
    let finalRules = channelConfig.rules || [];
    const inheritGlobal = channelConfig.inheritGlobal !== false;

    if (inheritGlobal && channel !== 'global') {
      const globalRules = this.config.global?.rules || [];
      const patternSet = new Set(globalRules.map(r => r.pattern));
      globalRules.forEach(r => {
        if (!patternSet.has(r.pattern) && r.isActive !== false) {
          finalRules.push(r);
        }
      });
    }

    // 过滤掉未启用的规则
    finalRules = finalRules.filter(r => r.isActive !== false);

    const result = {
      mode: channelConfig.mode || 'blacklist',
      rules: finalRules
    };

    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * 清除缓存 (重新加载配置时调用)
   */
  clearCache() {
    this.cache.clear();
  }
}
```

---

## 4. 集成到采集流程

### 4.1 修改 cache-worker.js

**文件**: `workers/cache-worker.js` (修改)

```javascript
import filterRules from '../filter-rules.json';
import { KeywordFilter, RuleLoader } from '../src/lib/KeywordFilter.js';

// 全局规则加载器 (只初始化一次)
const ruleLoader = new RuleLoader(filterRules);

async function processSingleChannel(task, env) {
  const { channel } = task;
  
  // ... 前序逻辑保持不变

  // ==========================================
  // 关键词过滤 (带开关控制)
  // ==========================================
  const filterEnabled = env.FILTER_ENABLED === 'true';
  let filteredPosts = posts;
  let blockedPosts = [];

  if (filterEnabled) {
    const ruleConfig = ruleLoader.loadRules(channel);
    const filter = new KeywordFilter(ruleConfig);

    filteredPosts = [];
    blockedPosts = [];

    for (const post of posts) {
      const filterResult = filter.filter(post);
      
      if (filterResult.passed) {
        filteredPosts.push(post);
      } else {
        blockedPosts.push({
          post,
          reason: filterResult.matchedRules.map(r => r.pattern).join(', '),
          mode: filterResult.mode
        });
      }
    }

    if (blockedPosts.length > 0) {
      console.log(`🚫 Blocked ${blockedPosts.length} posts for ${channel}`);
      blockedPosts.forEach(bp => {
        console.log(`   - ${bp.post.id}: ${bp.reason} (${bp.mode})`);
      });
    }
  } else {
    console.log(`ℹ️ Filter disabled for ${channel}`);
  }
  // ==========================================

  // 使用 filteredPosts 继续后续处理
  const postsToSave = [];
  for (const post of filteredPosts) {
    // ... 写入 D1 逻辑
  }

  // ... 后续逻辑保持不变
}
```

### 4.2 wrangler.toml 配置

确保 `filter-rules.json` 被打包进 Worker：

```toml
name = "mcb-crawler"
main = "workers/cache-worker.js"
compatibility_date = "2024-05-01"

# JSON 文件会自动被打包进 Worker
```

---

## 5. 配置管理

### 5.1 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `FILTER_ENABLED` | `false` | 是否启用过滤功能 (`true`/`false`) |

### 5.2 使用流程

```bash
# 1. 创建/修改配置文件
vim filter-rules.json

# 2. 配置环境变量
wrangler secret put FILTER_ENABLED
# 输入：true

# 3. 部署 Worker
wrangler deploy

# 4. 验证过滤生效
wrangler tail  # 查看日志
```

### 5.3 更新规则

修改 `filter-rules.json` 后，重新部署即可：

```bash
wrangler deploy
```

---

## 6. 错误处理与容错

### 6.1 JSON 配置文件容错

**核心原则**: JSON 格式错误不应导致 Worker 崩溃，应降级为"不过滤"模式。

```javascript
// workers/cache-worker.js

import { KeywordFilter, RuleLoader } from '../src/lib/KeywordFilter.js';

/**
 * 安全加载配置文件
 * JSON 解析失败时返回空配置，不影响主流程
 */
function safeLoadFilterRules() {
  try {
    // 动态 import JSON，捕获解析错误
    return require('../filter-rules.json');
  } catch (error) {
    console.error('⚠️ Failed to load filter-rules.json:', error.message);
    console.error('📝 Falling back to no-filter mode');
    return {
      global: { mode: 'blacklist', rules: [] },
      channels: {}
    };
  }
}

// Worker 启动时加载配置
let filterRules;
try {
  filterRules = safeLoadFilterRules();
} catch (error) {
  console.error('⚠️ Filter config load error, using empty config');
  filterRules = {
    global: { mode: 'blacklist', rules: [] },
    channels: {}
  };
}

const ruleLoader = new RuleLoader(filterRules);
```

### 6.2 常见 JSON 错误处理

| 错误类型 | 示例 | 处理方式 |
|----------|------|----------|
| **语法错误** | 缺少逗号、括号不匹配 | 捕获 `SyntaxError`，使用空配置 |
| **类型错误** | `rules` 不是数组 | 验证配置结构，使用默认值 |
| **字段缺失** | 缺少 `global.mode` | 使用默认值 `blacklist` |
| **规则无效** | `pattern` 为空字符串 | 跳过该规则，记录警告 |
| **正则无效** | `pattern` 是无效正则 | 跳过该规则，记录错误 |

### 6.3 配置验证函数

```javascript
/**
 * 验证配置文件结构，返回标准化配置
 */
function validateFilterConfig(rawConfig) {
  const defaultConfig = {
    global: { mode: 'blacklist', rules: [] },
    channels: {}
  };

  if (!rawConfig || typeof rawConfig !== 'object') {
    console.error('⚠️ Invalid config type, using default');
    return defaultConfig;
  }

  const config = { ...defaultConfig, ...rawConfig };

  // 验证 global
  if (!config.global || typeof config.global !== 'object') {
    console.error('⚠️ Missing global config, using default');
    config.global = defaultConfig.global;
  }

  config.global.mode = config.global.mode === 'whitelist' ? 'whitelist' : 'blacklist';
  
  if (!Array.isArray(config.global.rules)) {
    console.error('⚠️ global.rules is not an array, using empty array');
    config.global.rules = [];
  }

  // 验证 channels
  if (!config.channels || typeof config.channels !== 'object') {
    console.error('⚠️ Missing channels config, using empty object');
    config.channels = {};
  }

  // 验证每个渠道的规则
  for (const [channel, channelConfig] of Object.entries(config.channels)) {
    if (!channelConfig || typeof channelConfig !== 'object') {
      console.error(`⚠️ Invalid config for channel ${channel}, skipping`);
      delete config.channels[channel];
      continue;
    }

    channelConfig.mode = channelConfig.mode === 'whitelist' ? 'whitelist' : 'blacklist';
    channelConfig.inheritGlobal = channelConfig.inheritGlobal !== false;

    if (!Array.isArray(channelConfig.rules)) {
      console.error(`⚠️ Invalid rules for channel ${channel}, using empty array`);
      channelConfig.rules = [];
    }
  }

  return config;
}
```

### 6.4 完整错误处理流程

```javascript
// workers/cache-worker.js

let filterRules;

try {
  // 1. 尝试加载 JSON
  filterRules = require('../filter-rules.json');
  
  // 2. 验证配置结构
  filterRules = validateFilterConfig(filterRules);
  
  console.log(`✅ Filter rules loaded: ${filterRules.global.rules.length} global rules, ${Object.keys(filterRules.channels).length} channels`);
} catch (error) {
  // 3. 降级到空配置
  console.error('⚠️ Filter config error:', error.message);
  console.error('📝 Falling back to no-filter mode');
  
  filterRules = {
    global: { mode: 'blacklist', rules: [] },
    channels: {}
  };
}

const ruleLoader = new RuleLoader(filterRules);
```

### 6.5 错误场景处理矩阵

| 场景 | 表现 | 日志输出 | 影响 |
|------|------|----------|------|
| **JSON 文件不存在** | 降级为空配置 | `⚠️ Failed to load filter-rules.json` | 不拦截任何帖子 |
| **JSON 语法错误** | 降级为空配置 | `⚠️ Filter config error: Unexpected token` | 不拦截任何帖子 |
| **JSON 缺少逗号** | 降级为空配置 | `⚠️ Filter config error: Unexpected token` | 不拦截任何帖子 |
| **JSON 括号不匹配** | 降级为空配置 | `⚠️ Filter config error: Unexpected end of JSON` | 不拦截任何帖子 |
| **rules 不是数组** | 使用空数组 | `⚠️ global.rules is not an array` | 不拦截任何帖子 |
| **正则表达式无效** | 跳过该规则 | `Invalid regex pattern: [xxx]` | 其他规则正常生效 |
| **`FILTER_ENABLED=false`** | 跳过过滤 | `ℹ️ Filter disabled for xxx` | 不拦截任何帖子 |

---

## 7. 性能优化

---

## 7. 性能优化

### 7.1 规则缓存

- 规则在 Worker 启动时加载一次
- 每个渠道的规则缓存到 `Map` 中
- 减少重复解析 JSON 和预编译正则的开销

### 7.2 正则预编译

- 启动时预编译所有正则表达式
- 运行时直接使用预编译的正则，避免重复编译

### 7.3 性能指标

| 指标 | 目标值 | 测量方式 |
|------|--------|----------|
| 单次过滤耗时 | < 5ms | `console.time` |
| 规则加载耗时 | < 50ms | 启动时一次性加载 |
| 内存占用 | < 10MB | Workers 限制 |

---

## 8. 附录

### 8.1 文件清单

```
project-root/
├── filter-rules.json                    # 过滤规则配置
├── src/lib/
│   └── KeywordFilter.js                 # 核心过滤类 + 规则加载器
├── workers/
│   └── cache-worker.js                  # Worker 主文件 (修改)
└── wrangler.toml                        # Worker 配置
```

### 8.2 版本历史

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| 1.0 | 2026-05-19 | 本地文件方案 (不适用) |
| 2.0 | 2026-05-19 | Workers D1 专用方案 |
| 3.0 | 2026-05-19 | 双环境双方案 (过于复杂) |
| 4.0 | 2026-05-19 | 统一 JSON 方案 (含在线 API) |
| **5.0** | **2026-05-19** | **纯 JSON 配置方案 (只读，打包进 Worker)** |
