import { getEnv } from './env'

/**
 * 统一调用 Worker API
 * 优先使用 Service Binding（免费），降级为 HTTP 公网请求（兼容模式）
 * 
 * @param {string} pathname  - API 路径，如 '/api/channels'、'/api/posts?q=test'
 * @param {object} env       - 运行环境 env（从 Astro.locals.runtime.env 传入）
 * @param {object} options   - 可选配置
 * @param {object} options.headers - 额外请求头
 * @returns {Promise<Response>} fetch Response
 */
export async function callWorkerApi(pathname, env, { headers = {} } = {}) {
  // 1. Service Binding（免费）
  if (env?.MCB_CRAWLER) {
    const req = new Request(`https://mcb-crawler.internal${pathname}`, {
      headers: {
        ...headers,
        'X-Request-Source': 'service-binding',
      },
    })
    return env.MCB_CRAWLER.fetch(req)
  }

  // 2. HTTP 降级（兼容模式）
  const baseUrl = env?.WORKER_URL || 'https://mcb-crawler.mouse0232.workers.dev'
  return fetch(`${baseUrl}${pathname}`, {
    headers: {
      ...headers,
      'X-Request-Source': 'http',
    },
  })
}

/**
 * 从 D1 获取频道列表
 */
export async function getChannels(Astro) {
  const env = Astro.locals?.runtime?.env || {}
  const secret = env.API_SECRET_KEY || import.meta.env.PUBLIC_API_SECRET_KEY || ''
  const res = await callWorkerApi('/api/channels', env, {
      headers: { 'X-API-Secret': secret }
  })
  if (!res.ok) throw new Error('Failed to fetch channels')
  const data = await res.json()
  return data.channels
}

/**
 * 从 D1 获取帖子列表
 */
export async function getPosts(Astro, { channel = 'all', limit = 20, before = '', after = '' } = {}) {
  const env = Astro.locals?.runtime?.env || {}
  const secret = env.API_SECRET_KEY || import.meta.env.PUBLIC_API_SECRET_KEY || ''
  const params = new URLSearchParams({ channel, limit: String(limit) })
  if (before) params.set('before', before)
  if (after) params.set('after', after)
  
  const realIP = Astro.request?.headers?.get('cf-connecting-ip') || Astro.request?.headers?.get('x-real-ip')
  
  const headers = {
      'X-API-Secret': secret,
  }
  if (realIP) {
      headers['X-Real-User-IP'] = realIP
  }

  const res = await callWorkerApi(`/api/posts?${params}`, env, { headers })
  if (!res.ok) throw new Error('Failed to fetch posts')
  const data = await res.json()
  return data.posts
}
