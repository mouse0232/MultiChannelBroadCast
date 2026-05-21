/**
 * 处理媒体资源 URL
 * @param {string} html - HTML 内容
 * @param {string} workerUrl - Worker/站点 URL
 * @returns {string} 处理后的 HTML
 */
export function processMediaUrls(html, workerUrl) {
  if (!html) return html

  const imgProxyPrefix = workerUrl ? `${workerUrl}/img-proxy?url=` : 'https://wsrv.nl/?url='

  html = html.replace(
    /(<img[^>]*src=")(https?:\/\/cdn\d+\.telegram-cdn\.org\/file\/[^"]+)(")/gi,
    (match, prefix, url, suffix) => {
      return `${prefix}${imgProxyPrefix}${encodeURIComponent(url)}${suffix}`
    }
  )

  html = html.replace(
    /(<(?:video|audio|source)[^>]*src=")(https?:\/\/(cdn\d+\.telegram-cdn\.org)(\/file\/[^"]+))(")/gi,
    (match, prefix, fullUrl, host, path, suffix) => {
      return `${prefix}/static/${host}${path}${suffix}`
    }
  )

  return html
}
