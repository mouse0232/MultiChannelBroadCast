import { getEnv } from './env'

/**
 * 获取 D1 客户端的基础 URL
 * 优先使用环境变量 WORKER_URL，否则尝试从 Astro locals 获取，最后使用默认值
 */
export function getWorkerBaseUrl(Astro) {
  return getEnv(import.meta.env, Astro, 'WORKER_URL') || 'https://mcb-crawler.mouse0232.workers.dev'
}

/**
 * 从 D1 获取频道列表
 */
export async function getChannels(Astro) {
  const baseUrl = getWorkerBaseUrl(Astro)
  const res = await fetch(`${baseUrl}/api/channels`)
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
  const baseUrl = getWorkerBaseUrl(Astro)
  const params = new URLSearchParams({ channel, limit: String(limit) })
  if (before) params.set('before', before)
  if (after) params.set('after', after)
  
  // 获取真实用户 IP (从 Cloudflare Pages 请求头中)
  const realIP = Astro.request?.headers?.get('cf-connecting-ip') || Astro.request?.headers?.get('x-real-ip');
  const headers = {};
  if (realIP) {
      headers['X-Real-User-IP'] = realIP;
  }

  const res = await fetch(`${baseUrl}/api/posts?${params}`, { headers })
  if (!res.ok) throw new Error('Failed to fetch posts')
  const data = await res.json()
  return data.posts
}
