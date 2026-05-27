import { getEnv } from './env'

/**
 * 统一调用 Worker API
 * 优先使用 Service Binding（免费），降级为 HTTP 公网请求（兼容模式）
 * 
 * @param {string} pathname  - API 路径，如 '/api/channels'、'/api/posts?q=test'
 * @param {object} ctx       - Astro 上下文 (Astro 对象)
 * @param {object} options   - 可选配置
 * @param {object} options.headers - 额外请求头
 * @returns {Promise<Response>} fetch Response
 */
export async function callWorkerApi(pathname, ctx, { headers = {} } = {}) {
  // 1. 尝试从 Astro 运行时获取 Service Binding
  const runtimeEnv = ctx?.locals?.runtime?.env ?? ctx?.locals?.cfContext?.env ?? {}
  const binding = runtimeEnv.MCB_CRAWLER ?? null

  if (binding) {
    // Service Binding 模式（免费）
    const req = new Request(`https://mcb-crawler.internal${pathname}`, {
      headers: {
        ...headers,
        'X-Request-Source': 'service-binding',
      },
    })
    return binding.fetch(req)
  }

  // 2. 降级为 HTTP 公网请求（兼容模式）
  const baseUrl = getEnv(import.meta.env, ctx, 'WORKER_URL') 
               || 'https://mcb-crawler.mouse0232.workers.dev'
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
  // 优先从运行时环境获取 Secret，避免暴露给客户端
  const secret = Astro.locals?.runtime?.env?.API_SECRET_KEY || import.meta.env.PUBLIC_API_SECRET_KEY || '';
  const res = await callWorkerApi('/api/channels', Astro, {
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
  // 优先从运行时环境获取 Secret，避免暴露给客户端
  const secret = Astro.locals?.runtime?.env?.API_SECRET_KEY || import.meta.env.PUBLIC_API_SECRET_KEY || '';
  const params = new URLSearchParams({ channel, limit: String(limit) })
  if (before) params.set('before', before)
  if (after) params.set('after', after)
  
  // 获取真实用户 IP
  const realIP = Astro.request?.headers?.get('cf-connecting-ip') || Astro.request?.headers?.get('x-real-ip');
  
  // 构建请求头
  const headers = {
      'X-API-Secret': secret,
  };
  if (realIP) {
      headers['X-Real-User-IP'] = realIP;
  }

  const res = await callWorkerApi(`/api/posts?${params}`, Astro, { headers })
  if (!res.ok) throw new Error('Failed to fetch posts')
  const data = await res.json()
  return data.posts
}
