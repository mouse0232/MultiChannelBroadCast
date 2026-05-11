import rss from '@astrojs/rss'
import sanitizeHtml from 'sanitize-html'
import { getPosts } from '../../../lib/d1-client'
import { getEnv } from '../../../lib/env'

export async function GET(context) {
  const { channel: channelName } = context.params
  
  let posts = []
  try {
    posts = await getPosts(context, { channel: channelName, limit: 50 })
  } catch (e) {
    console.error('Channel RSS: Failed to fetch posts:', e)
  }

  const { SITE_URL } = context.locals
  const site = getEnv(import.meta.env, context, 'SITE') || SITE_URL
  const locale = getEnv(import.meta.env, context, 'LOCALE') || 'zh-cn'

  return rss({
    title: `${channelName} Telegram Feed`,
    description: `RSS feed for Telegram channel ${channelName}`,
    site,
    items: posts.map((post) => ({
      title: post.title || 'New Post',
      pubDate: new Date(post.published_at || post.datetime),
      link: `${SITE_URL}posts/${encodeURIComponent(post.id)}`,
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
      customData: `<channel>${post.channel}</channel>`,
    })),
    customData: `<language>${locale}</language>`,
    stylesheet: '/rss.xsl',
  })
}
