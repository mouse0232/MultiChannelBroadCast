// Cache API 与版本缓存管理（直连 D1 模式）
// 移植自 workers/cache-worker.js 核心逻辑
// 严格按照 design.md Section 2.1 / 6.4 实现，增强 ctx.waitUntil 和性能日志

import { getEnv } from './env'

// ==========================================
// 1. Globals & Version Cache (Memory Strategy)
// ==========================================
// Astro SSR 进程内存维护的版本号清单
let VERSION_CACHE = {
  ts: 0, // 上次从 D1 加载的时间戳
  versions: {} // { channel: "last_msg_id" }
}

// 从 D1 获取版本号并更新内存缓存 (带 60s 软过期时间)
// 设计文档 Section 6.4 指定实现
async function getVersionMap(db) {
  const now = Date.now()
  // 缓存过期或为空时回源 D1
  if (!VERSION_CACHE.ts || (now - VERSION_CACHE.ts > 60000)) {
    try {
      const { results } = await db.prepare(
        "SELECT channel, last_msg_id FROM channel_meta"
      ).all()

      const map = {}
      let maxId = 0

      results.forEach(r => {
        const id = parseInt(r.last_msg_id || '0', 10)
        map[r.channel] = r.last_msg_id || '0'
        if (id > maxId) maxId = id
      })

      // 全站聚合版本号
      map['__ALL__'] = String(maxId)
      VERSION_CACHE = { ts: now, versions: map }
      console.log(`[Cache] Version map refreshed from D1. Total channels: ${results.length}`)
    } catch (e) {
      console.error('[Cache] Failed to refresh version map:', e)
    }
  }
  return VERSION_CACHE.versions
}

// 清除内存版本缓存
export function invalidateVersionCache() {
  VERSION_CACHE.ts = 0
  console.log('[Cache] Version map invalidated.')
}

// ==========================================
// 2. Cache Key Utilities
// ==========================================
// 设计文档 Section 2.1: getVersionedKey 基于 options 对象
function getVersionedKey(options, versions) {
  // 适配频道列表缓存 Key
  if (options.type === 'channels') {
    const ver = versions['__ALL__'] || '0'
    return `https://cache.internal/api/channels?_cv=${ver}`
  }
  
  // 适配帖子列表缓存 Key
  const channel = options.channel || 'all'
  const ver = channel === 'all'
    ? (versions['__ALL__'] || '0')
    : (versions[channel] || versions['__ALL__'] || '0')

  const params = new URLSearchParams({
    channel: options.channel || 'all',
    limit: String(options.limit || 20),
    before: options.before || '',
    after: options.after || ''
  })

  const separator = params.toString() ? '&' : '?'
  return `https://cache.internal/posts?${params.toString()}${separator}_cv=${ver}`
}

// 设计文档 Section 2.1: normalizeUrl 基于 options 对象
function normalizeUrl(options) {
  // 针对单条帖子详情（不随版本号失效，仅靠 TTL）
  if (options.id) {
    return `https://cache.internal/posts/${options.id}`
  }

  const params = new URLSearchParams({
    q: options.q || '',
    channel: options.channel || 'all',
    limit: String(options.limit || 20)
  })
  return `https://cache.internal/search?${params.toString()}`
}

// ==========================================
// 3. Cache API Helper
// ==========================================
// 设计文档 Section 2.1 / 6.4: handleCachedQuery
// 参数：(db, options, queryFunc, isVersioned, ctx)
// 返回：JSON 数据对象（非 Response）
// 增强：支持 ctx.waitUntil 异步缓存和性能计时日志
export async function handleCachedQuery(db, options, queryFunc, isVersioned = true, ctx = null) {
  const startTime = Date.now()
  let cacheKey

  if (isVersioned) {
    const versions = await getVersionMap(db)
    cacheKey = getVersionedKey(options, versions)
  } else {
    cacheKey = normalizeUrl(options)
  }

  const fakeRequest = new Request(cacheKey, {
    headers: { 'Accept': 'application/json' }
  })

  // 确定 TTL (Table 1.2: Channels=7200s, ID/Search=600s, Posts=300s)
  let ttl = 300
  if (options.type === 'channels') ttl = 7200
  else if (options.id || options.q) ttl = 600
  
  // 检查缓存 (带环境检查)
  if (typeof caches !== 'undefined' && caches.default) {
    const cachedResponse = await caches.default.match(fakeRequest)
    if (cachedResponse) {
      const elapsed = Date.now() - startTime
      console.log(`[Cache HIT] ${cacheKey} (${elapsed}ms)`)
      // 返回状态 'HIT'
      return { data: await cachedResponse.json(), status: 'HIT' }
    }
  }

  console.log(`[Cache MISS] ${cacheKey}`)

  // 执行查询
  const start = Date.now()
  const results = await queryFunc()
  const elapsed = Date.now() - start
  console.log(`[Cache STORE] ${cacheKey} (Query: ${elapsed}ms)`)

  // 写入缓存 (带 TTL 控制)
  const response = new Response(JSON.stringify(results), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttl}, stale-while-revalidate=${ttl / 2}`
    }
  })

  if (typeof caches !== 'undefined' && caches.default) {
    try {
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(caches.default.put(fakeRequest, response.clone()))
      } else {
        caches.default.put(fakeRequest, response.clone())
      }
    } catch (e) {
      console.error('[Cache] Store failed:', e.message)
    }
  }

  // 返回状态 'STORE'
  return { data: results, status: 'STORE' }
}
