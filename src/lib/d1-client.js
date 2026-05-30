import { getEnv } from './env'
import { handleCachedQuery } from './d1-cache'

/**
 * 获取数据库实例
 * 设计文档 Section 2.1
 */
function getDatabase(env) {
  return env.DB || env.DATABASE
}

/**
 * 查询日志（安全审计）
 * 设计文档 Section 6.6
 */
function logQuery(Astro, options, type = 'query') {
  const env = Astro.locals?.runtime?.env || {}
  const loggingEnabled = env.API_LOGGING_ENABLED === 'true'

  if (loggingEnabled) {
    const realUserIP = Astro.request?.headers?.get('cf-connecting-ip') ||
                       Astro.request?.headers?.get('x-real-ip')

    console.log('API Query:', {
      timestamp: new Date().toISOString(),
      type,
      path: Astro.url?.pathname,
      realUserIP: realUserIP || 'unknown',
      params: options
    })
  }
}

/**
 * 从 D1 获取频道列表
 * 设计文档 Section 2.1: getChannels
 */
export async function getChannels(Astro) {
  const env = Astro.locals?.runtime?.env || {}
  const db = getDatabase(env)

  if (!db) {
    throw new Error('D1 Database 未配置')
  }

  logQuery(Astro, {}, 'getChannels')

  // 直接从 D1 读取已抓取的频道（不需要 env.CHANNELS）
  const { results } = await db.prepare(
    "SELECT channel, last_msg_id, title, avatar FROM channel_meta"
  ).all()

  return results
}

/**
 * 从 D1 获取帖子列表
 * 设计文档 Section 2.1: getPosts
 * 使用 published_at 作为游标（Section 7.2）
 */
export async function getPosts(Astro, { channel = 'all', limit = 20, before = '', after = '' } = {}) {
  const env = Astro.locals?.runtime?.env || {}
  const ctx = Astro.locals?.runtime?.ctx || null
  const db = getDatabase(env)

  if (!db) {
    throw new Error('D1 Database 未配置')
  }

  // 硬编码上限（Section 6.1）
  const safeLimit = Math.min(parseInt(limit) || 20, 100)

  logQuery(Astro, { channel, limit: safeLimit, before, after }, 'getPosts')

  return handleCachedQuery(db, { channel, limit: safeLimit, before, after }, async () => {
    let query = `SELECT * FROM posts WHERE 1=1`
    const bindings = []

    if (channel !== 'all') {
      query += ` AND channel = ?`
      bindings.push(channel)
    }

    if (after) {
      query += ` AND published_at > ?`
      bindings.push(after)
      query += ` ORDER BY published_at ASC LIMIT ?`
    } else if (before) {
      query += ` AND published_at < ?`
      bindings.push(before)
      query += ` ORDER BY published_at DESC LIMIT ?`
    } else {
      query += ` ORDER BY published_at DESC LIMIT ?`
    }

    bindings.push(safeLimit)

    const { results } = await db.prepare(query).bind(...bindings).all()

    if (after) {
      results.reverse()
    }

    return results
  }, true, ctx)
}

/**
 * 根据 ID 获取单个帖子
 * 设计文档 Section 6.2: ID 格式校验
 */
export async function getPostById(Astro, id) {
  const env = Astro.locals?.runtime?.env || {}
  const db = getDatabase(env)

  if (!db) {
    throw new Error('D1 Database 未配置')
  }

  // 校验 ID 格式：必须包含斜杠 (channel/id)
  if (!id.includes('/')) {
    throw new Error('Invalid post ID format. Expected: channel/id')
  }

  logQuery(Astro, { id }, 'getPostById')

  // 精确查询（命中主键索引）
  const result = await db.prepare(
    "SELECT * FROM posts WHERE id = ? LIMIT 1"
  ).bind(id).first()

  return result
}

/**
 * 搜索帖子
 * 设计文档 Section 6.3: 搜索限制
 */
export async function searchPosts(Astro, q, { channel = 'all', limit = 20 } = {}) {
  const env = Astro.locals?.runtime?.env || {}
  const ctx = Astro.locals?.runtime?.ctx || null
  const db = getDatabase(env)

  if (!db) {
    throw new Error('D1 Database 未配置')
  }

  if (!q || q.length < 2) {
    return []  // 空查询或单字查询返回空
  }

  const safeLimit = Math.min(limit, 100)

  logQuery(Astro, { q, channel, limit: safeLimit }, 'searchPosts')

  return handleCachedQuery(db, { q, channel, limit: safeLimit }, async () => {
        let query = `SELECT * FROM posts WHERE (title LIKE ? OR content LIKE ?)`
        const bindings = [`%${q}%`, `%${q}%`]

        // 强制频道过滤（减少扫描范围）
        if (channel !== 'all') {
          query += ` AND channel = ?`
          bindings.push(channel)
        }

        query += ` ORDER BY id DESC LIMIT ?`
        bindings.push(safeLimit)

    const { results } = await db.prepare(query).bind(...bindings).all()
    return results
  }, false, ctx)  // 搜索使用 URL-based 缓存 Key
}

/**
 * 降级：调用 Worker API（当 D1 不可用时使用）
 * 设计文档 Section 11.3: 混合模式降级
 */
export async function callWorkerApi(pathname, env, { headers = {} } = {}) {
  if (!env?.MCB_CRAWLER) {
    throw new Error('MCB_CRAWLER Service Binding 未配置 - 降级方案不可用')
  }

  const req = new Request(`https://mcb-crawler.internal${pathname}`, {
    headers: {
      ...headers,
      'X-Request-Source': 'service-binding',
    },
  })
  return env.MCB_CRAWLER.fetch(req)
}
