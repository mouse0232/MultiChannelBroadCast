export async function onRequest(context, next) {
  // 确保 SITE_URL 正确生成,优先使用 context.url.origin
  // 修复Cloudflare Pages默认域名和预览域名的处理问题
  const siteBase = import.meta.env.SITE || context.url.origin;
  const baseUrl = import.meta.env.BASE_URL || '/';
  
  // 确保SITE_URL格式正确
  let siteUrl = siteBase;
  if (!siteUrl.endsWith('/')) {
    siteUrl += '/';
  }
  
  // 添加baseUrl路径（如果存在且不为根路径）
  if (baseUrl !== '/' && !siteUrl.endsWith(baseUrl)) {
    siteUrl += baseUrl.substring(1);
  }
  
  // 确保最终URL以斜杠结尾
  if (!siteUrl.endsWith('/')) {
    siteUrl += '/';
  }
  
  context.locals.SITE_URL = siteUrl;
  
  context.locals.RSS_URL = `${context.locals.SITE_URL}rss.xml`
  context.locals.RSS_PREFIX = ''

  if (context.params?.channel) {
    context.locals.RSS_URL = `${context.locals.SITE_URL}channel/${context.params.channel}/rss.xml`
    context.locals.RSS_PREFIX = `${context.params.channel} | `
  } else if (context.url.pathname.startsWith('/search') && context.params.q?.startsWith('#')) {
    const tag = context.params.q.replace('#', '')
    context.locals.RSS_URL = `${context.locals.SITE_URL}rss.xml?tag=${tag}`
    context.locals.RSS_PREFIX = `${tag} | `
  }

  const response = await next()

  if (!response.bodyUsed) {
    if (response.headers.get('Content-type') === 'text/html') {
      // 移除不存在的prefetch.json文件引用
      response.headers.delete('Speculation-Rules');
    }

    if (!response.headers.has('Cache-Control')) {
      // 增强缓存策略: public 15分钟浏览器缓存, 15分钟 CDN 缓存
      response.headers.set('Cache-Control', 'public, max-age=900, s-maxage=900, stale-while-revalidate=300')
    }
  }
  return response
}
