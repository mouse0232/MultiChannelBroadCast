export async function onRequest(context, next) {
  // 确保 SITE_URL 正确生成,优先使用 context.url.origin
  // 修复Cloudflare Pages默认域名和预览域名的处理问题
  const siteBase = import.meta.env.SITE || context.url.origin
  const baseUrl = import.meta.env.BASE_URL || '/'
  context.locals.SITE_URL = siteBase + (baseUrl.endsWith('/') ? baseUrl : baseUrl + '/')
  
  // 确保SITE_URL以斜杠结尾，避免路径问题
  if (!context.locals.SITE_URL.endsWith('/')) {
    context.locals.SITE_URL += '/'
  }
  
  context.locals.RSS_URL = `${context.locals.SITE_URL}rss.xml`
  context.locals.RSS_PREFIX = ''

  if (context.url.pathname.startsWith('/search') && context.params.q?.startsWith('#')) {
    const tag = context.params.q.replace('#', '')
    context.locals.RSS_URL = `${context.locals.SITE_URL}rss.xml?tag=${tag}`
    context.locals.RSS_PREFIX = `${tag} | `
  }

  const response = await next()

  if (!response.bodyUsed) {
    if (response.headers.get('Content-type') === 'text/html') {
      response.headers.set('Speculation-Rules', '"/rules/prefetch.json"')
    }

    if (!response.headers.has('Cache-Control')) {
      // 增强缓存策略: public 5分钟浏览器缓存, 5分钟 CDN 缓存
      response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60')
    }
  }
  return response
}