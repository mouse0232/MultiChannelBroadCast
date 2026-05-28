import { getEnv } from './env'

/**
 * 统一调用 Worker API
 * 优先使用 Service Binding（免费），降级为 HTTP 公网请求（兼容模式）
 * 
 * @param {string} pathname  - API 路径，如 '/api/channels'、'/api/posts?q=test'
 * @param {object} env       - 运行环境 env（从 context.locals.runtime.env 或 Astro.locals.runtime.env 传入）
 * @param {object} options   - 可选配置
 * @param {object} options.headers - 额外请求头
 * @returns {Promise<Response>} fetch Response
 */
export async function callWorkerApi(pathname, env, { headers = {} } = {}) {
  const binding = env?.MCB_CRAWLER ?? null

  if (binding) {
    const req = new Request(`https://mcb-crawler.internal${pathname}`, {
      headers: {
        ...headers,
        'X-Request-Source': 'service-binding',
      },
    })
    return binding.fetch(req)
  }

  // 临时屏蔽降级：直接报错，方便验证 Service Binding 是否生效
  throw new Error('MCB_CRAWLER Service Binding 未配置 - 请检查 Dashboard Bindings 设置')
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
 * @param {object} Astro - Astro context
 * @param {object} options - 选项 { channel, limit, before, after }
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
