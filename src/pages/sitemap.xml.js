import { getChannelInfo } from '../lib/telegram'

export async function GET(context) {
  const channel = await getChannelInfo(context)
  const { SITE_URL } = context.locals
  const site = new URL(SITE_URL)

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${site.origin}/</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>
  ${channel.posts
    .map(
      (post) => `
  <url>
    <loc>${site.origin}/posts/${post.id}</loc>
    <lastmod>${post.datetime}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`,
    )
    .join('')}
</urlset>`

  return new Response(sitemap, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  })
}
