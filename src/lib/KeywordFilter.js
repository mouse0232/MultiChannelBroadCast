/**
 * 关键词过滤器核心类
 * 用于 Cloudflare Workers 环境
 */

/**
 * 验证并标准化配置文件结构
 * 确保配置错误不会导致 Worker 崩溃
 */
export function validateFilterConfig(rawConfig) {
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
  } else {
    // 验证每条全局规则
    config.global.rules = config.global.rules.filter(rule => {
      if (!rule || typeof rule !== 'object') {
        console.error('⚠️ Invalid rule format, skipping');
        return false;
      }
      if (!rule.pattern || typeof rule.pattern !== 'string') {
        console.error('⚠️ Rule missing pattern, skipping');
        return false;
      }
      return true;
    });
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
    } else {
      // 验证每条渠道规则
      channelConfig.rules = channelConfig.rules.filter(rule => {
        if (!rule || typeof rule !== 'object') {
          console.error(`⚠️ Invalid rule format in channel ${channel}, skipping`);
          return false;
        }
        if (!rule.pattern || typeof rule.pattern !== 'string') {
          console.error(`⚠️ Rule missing pattern in channel ${channel}, skipping`);
          return false;
        }
        return true;
      });
    }
  }

  return config;
}

/**
 * 安全加载配置文件
 * JSON 解析失败时返回空配置，不影响主流程
 */
export async function safeLoadFilterRules() {
  try {
    // 使用动态 import 兼容 ESM
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const filterRulesPath = join(process.cwd(), 'filter-rules.json')
    const content = readFileSync(filterRulesPath, 'utf-8')
    const rawConfig = JSON.parse(content)
    const config = validateFilterConfig(rawConfig)

    const globalRuleCount = config.global.rules.length;
    const channelCount = Object.keys(config.channels).length;
    console.log(`✅ Filter rules loaded: ${globalRuleCount} global rules, ${channelCount} channels`);

    return config;
  } catch (error) {
    console.error('⚠️ Failed to load filter-rules.json:', error.message);
    console.error('📝 Falling back to no-filter mode');

    return {
      global: { mode: 'blacklist', rules: [] },
      channels: {}
    }
  }
}

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
            console.error(`⚠️ Invalid regex pattern: ${rule.pattern}`, error.message);
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
        console.error(`⚠️ Rule match error:`, error.message);
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
 * 规则加载器 (带缓存)
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
