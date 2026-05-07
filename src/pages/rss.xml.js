import rss from '@astrojs/rss'
import sanitizeHtml from 'sanitize-html'
import { getPosts } from '../lib/d1-client'
import { getEnv } from '../lib/env'

export async function GET(context) {
  // 从 D1 获取最新帖子
  let posts = []
  try {
    posts = await getPosts(context, { channel: 'all', limit: 50 })
  } catch (e) {
    console.error('RSS: Failed to fetch posts:', e)
  }

  const { RSS_URL, RSS_PREFIX, SITE_URL } = context.locals
  const siteName = getEnv(import.meta.env, context, 'SITE_NAME') || 'Multi-Channel Broadcast'
  const site = getEnv(import.meta.env, context, 'SITE') || SITE_URL
  const locale = getEnv(import.meta.env, context, 'LOCALE') || 'zh-cn'

  return rss({
    title: `${RSS_PREFIX}${siteName}`,
    description: `Aggregated RSS feed from multiple Telegram channels`,
    site,
    items: posts.map((post) => {
      // 修复标题为空的问题：如果数据库里没有标题，尝试从内容中提取纯文本
      let title = post.title;
      if (!title && post.content) {
        const text = post.content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        title = text.substring(0, 60) || 'New Post';
      }
      
      return ({
        title: title,
        pubDate: new Date(post.published_at || post.datetime),
      link: `${SITE_URL}posts/${post.id.split('/').pop()}`,
      content: sanitizeHtml(post.content || '', {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'video', 'audio']),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          img: ['src', 'alt', 'loading', 'class', 'style'],
          video: ['src', 'controls', 'preload', 'playsinline', 'webkit-playsinline', 'width', 'height'],
          audio: ['src', 'controls'],
          a: ['href', 'title', 'target', 'rel'],
        },
      }),
      categories: post.tags || [],
      customData: post.channel ? `<channel>${post.channel}</channel>` : '',
    })),
    customData: `<language>${locale}</language>`,
    stylesheet: '/rss.xsl',
  })
}
