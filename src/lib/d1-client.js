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
 * 策略：接入 Versioned Key 缓存 & TTL 7200s
 */
export async function getChannels(Astro) {
  const env = Astro.locals?.runtime?.env || {}
  const ctx = Astro.locals?.runtime?.ctx || null
  const db = getDatabase(env)

  if (!db) {
    throw new Error('D1 Database 未配置')
  }

  // 获取 env.CHANNELS 配置（缓存外部也要用）
  const configuredChannelsStr = env.CHANNELS || ''

  // 接入 handleCachedQuery 缓存层（合并逻辑移入 queryFunc，只有 MISS 时执行）
  const response = await handleCachedQuery(db, { type: 'channels' }, async () => {
    const result = await db.prepare(
      "SELECT channel, last_msg_id, title, avatar FROM channel_meta"
    ).all()
    let results = result.results || []
    
    // 补充 env.CHANNELS 中配置但未抓取过的频道
    const configuredChannels = configuredChannelsStr.split(',').map(c => c.trim()).filter(Boolean)
    const existingChannels = new Set(results.map(r => r.channel))
    
    // 注意：不覆盖已有的 title 和 avatar
    configuredChannels.forEach(ch => {
      if (!existingChannels.has(ch)) {
        results.push({ channel: ch, last_msg_id: null, title: ch, avatar: null })
      }
    })
    
    return results
  }, true, ctx)

  let results = response.data || []

  // 异步上报日志（带上缓存层输出的 consoleLog）
  reportTraceLog(ctx, env, {
    path: '/api/channels',
    resultCount: results.length,
    status: response.status,
    consoleLog: response.consoleLog || ''
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

  const response = await handleCachedQuery(db, { channel, limit: safeLimit, before, after }, async () => {
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

  const posts = response.data;

  // 异步上报日志（带上缓存层输出的 consoleLog）
  reportTraceLog(ctx, env, {
    path: '/api/posts',
    params: { channel, limit: safeLimit, before, after },
    resultCount: posts?.length || 0,
    status: response.status,
    consoleLog: response.consoleLog || ''
  }, 'getPosts')

  return posts
}

/**
 * 根据 ID 获取单个帖子
 * 设计文档 Section 6.2: ID 格式校验 & 1.3: 缓存策略
 */
export async function getPostById(Astro, id) {
  const env = Astro.locals?.runtime?.env || {}
  const ctx = Astro.locals?.runtime?.ctx || null
  const db = getDatabase(env)

  if (!db) {
    throw new Error('D1 Database 未配置')
  }

  // 校验 ID 格式：必须包含斜杠 (channel/id)
  if (!id.includes('/')) {
    throw new Error('Invalid post ID format. Expected: channel/id')
  }

  logQuery(Astro, { id }, 'getPostById')

  // 接入缓存逻辑：不随版本号失效，仅靠 TTL (URL Key)
  const response = await handleCachedQuery(db, { id }, async () => {
    // 精确查询（命中主键索引）
    const result = await db.prepare(
      "SELECT * FROM posts WHERE id = ? LIMIT 1"
    ).bind(id).first()

    return result
  }, false, ctx)

  // 异步上报日志，加入状态标识和 consoleLog
  reportTraceLog(ctx, env, {
    path: `/api/posts/${id}`,
    resultCount: response.data ? 1 : 0,
    status: response.status,
    consoleLog: response.consoleLog || ''
  }, 'getPostById')

  return response.data
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

  const response = await handleCachedQuery(db, { q, channel, limit: safeLimit }, async () => {
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

  const results = response.data;

  // 异步上报日志（带上缓存层输出的 consoleLog）
  reportTraceLog(ctx, env, {
    path: '/api/posts/search',
    params: { q, channel, limit: safeLimit },
    resultCount: results?.length || 0,
    status: response.status,
    consoleLog: response.consoleLog || ''
  }, 'searchPosts')

  return results
}

/**
 * 异步上报日志到 Worker (方案 A)
 * 改用 GET 请求并将所有业务参数拼接到 URL 中，确保 CF 日志面板直接可见
 */
export async function reportTraceLog(ctx, env, logData, type = 'query') {
  // 仅当 Worker 可用且有密钥时执行
  if (!env?.MCB_CRAWLER) return
  const secret = env.API_SECRET_KEY || import.meta.env.PUBLIC_API_SECRET_KEY || ''
  if (!secret) return

  // 将数据结构化为 GET 参数
  const paramsObj = {
    type: type,
    path: logData.path || '/',
    count: String(logData.resultCount || 0),
    status: logData.status || 'DB_QUERY',
    consoleLog: logData.consoleLog || '',
    elapsed: logData.elapsed || '',
    ...(logData.params || {})
  }

  // 过滤空参数
  const cleanParams = {}
  Object.entries(paramsObj).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      cleanParams[key] = value
    }
  })

  // 如果有错误信息，附加上去
  if (logData.error) {
    cleanParams['error'] = logData.error
  }

  const queryString = new URLSearchParams(cleanParams).toString()

  // 异步发送，不阻塞渲染（验证版本问题已解决）
  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(
      env.MCB_CRAWLER.fetch(
        new Request(`/api/trace-log?${queryString}`, {
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
/**
 * Pages 直连模式下的统一 API 路由入口 (替代 callWorkerApi)
 * 自动分发到直连函数，并返回 Response 对象以保持页面代码零修改
 */
export async function fetchLocalApi(context, pathName, options = {}) {
  const url = new URL(pathName, 'https://local')
  const pathname = url.pathname

  // 路由分发
  try {
    if (pathname === '/api/posts/search') {
      const res = await searchPosts(context, url.searchParams.get('q'), {
        channel: url.searchParams.get('channel') || 'all'
      })
      // Worker 返回格式: { posts: [...] }
      return new Response(JSON.stringify({ posts: res }))
      
    } else if (pathname.startsWith('/api/post/')) {
      const id = decodeURIComponent(pathName.replace('/api/post/', ''))
      const res = await getPostById(context, id)
      // Worker 返回格式: { post: {...} }
      return new Response(JSON.stringify({ post: res }))

    } else if (pathname === '/api/posts') {
      const res = await getPosts(context, {
        channel: url.searchParams.get('channel') || 'all',
        limit: parseInt(url.searchParams.get('limit')) || 20,
        before: url.searchParams.get('before'),
        after: url.searchParams.get('after')
      })
      // Worker 返回格式: { posts: [...] }
      return new Response(JSON.stringify({ posts: res }))

    } else if (pathname === '/api/channels') {
      const res = await getChannels(context)
      // Worker 返回格式: { channels: [...] }
      return new Response(JSON.stringify({ channels: res }))
      
    } else {
      throw new Error(`Unknown path: ${pathName}`)
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}

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
