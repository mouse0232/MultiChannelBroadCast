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
  const ctx = Astro.locals?.runtime?.ctx || null
  const db = getDatabase(env)

  if (!db) {
    throw new Error('D1 Database 未配置')
  }

  const result = await db.prepare(
    "SELECT channel, last_msg_id, title, avatar FROM channel_meta"
  ).all()

  const results = result.results || []

  // 异步上报日志，参数将全部暴露在 URL 中以便监控
  reportTraceLog(ctx, env, {
    path: '/api/channels',
    resultCount: results.length
  }, 'getChannels')

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

  const posts = await handleCachedQuery(db, { channel, limit: safeLimit, before, after }, async () => {
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

  // 异步上报日志，参数将全部暴露在 URL 中以便监控
  reportTraceLog(ctx, env, {
    path: '/api/posts',
    params: { channel, limit: safeLimit, before, after },
    resultCount: posts?.length || 0
  }, 'getPosts')

  return posts
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
  // 空查询也记录日志
  reportTraceLog(ctx, env, { path: '/api/posts/search', params: { q, channel }, resultCount: 0 }, 'searchPosts')
    return []
  }

  const safeLimit = Math.min(limit, 100)

  const results = await handleCachedQuery(db, { q, channel, limit: safeLimit }, async () => {
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
  }, false, ctx)

  // 异步上报日志，参数将全部暴露在 URL 中以便监控
  reportTraceLog(ctx, env, {
    path: '/api/posts/search',
    params: { q, channel, limit: safeLimit },
    resultCount: results?.length || 0
  }, 'searchPosts')

  return results
}

/**
 * 异步上报日志到 Worker (方案 A)
 * 改用 GET 请求并将所有业务参数拼接到 URL 中，确保 CF 日志面板直接可见
 */
async function reportTraceLog(ctx, env, logData, type = 'query') {
  // 仅当 Worker 可用且有密钥时执行
  if (!env?.MCB_CRAWLER) return
  const secret = env.API_SECRET_KEY || import.meta.env.PUBLIC_API_SECRET_KEY || ''
  if (!secret) return

  // 将数据结构化为 GET 参数
  const paramsObj = {
    type: type,
    path: logData.path || '/',
    count: String(logData.resultCount || 0),
    ...(logData.params || {})
  }
  
  const queryString = new URLSearchParams(paramsObj).toString()
  const logUrl = `https://trace.internal/api/trace-log?${queryString}`

  // 使用 waitUntil 异步发送，不阻塞页面渲染
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(
      env.MCB_CRAWLER.fetch(
        new Request(logUrl, {
          method: 'GET',
          headers: { 'X-API-Secret': secret }
        })
      ).catch(err => console.error('Trace log failed:', err))
    )
  }
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
