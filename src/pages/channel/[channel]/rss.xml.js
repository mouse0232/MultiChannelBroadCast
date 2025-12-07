import rss from '@astrojs/rss'
import sanitizeHtml from 'sanitize-html'
import { getSingleChannelInfo } from '../../../lib/telegram'
import { getEnv } from '../../../lib/env'

export async function GET(context) {
  const { channel: channelName } = context.params
  const channel = await getSingleChannelInfo(context, channelName)
  const { SITE_URL } = context.locals

  const site = getEnv(import.meta.env, context, 'SITE') || SITE_URL
  const locale = getEnv(import.meta.env, context, 'LOCALE') || 'zh-cn'

  return rss({
    title: channel.title,
    description: channel.description,
    site,
    items: channel.posts.map((post) => ({
      title: post.title,
      pubDate: new Date(post.datetime),
      link: `${SITE_URL}posts/${post.id}`,
      content: sanitizeHtml(post.content, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'video', 'audio']),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          img: ['src', 'alt', 'loading', 'class', 'style'],
          video: ['src', 'controls', 'preload', 'playsinline', 'webkit-playsinline', 'width', 'height'],
          audio: ['src', 'controls'],
          a: ['href', 'title', 'target', 'rel'],
        },
      }),
      categories: post.tags,
      customData: `<channel>${post.channel}</channel>`,
    })),
    customData: `<language>${locale}</language>`,
    stylesheet: '/rss.xsl',
  })
}
