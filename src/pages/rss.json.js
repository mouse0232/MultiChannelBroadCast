import { getChannelInfo } from '../lib/telegram'

export async function GET(context) {
  const channel = await getChannelInfo(context)
  const { SITE_URL } = context.locals

  return new Response(
    JSON.stringify({
      version: 'https://jsonfeed.org/version/1.1',
      title: channel.title,
      home_page_url: SITE_URL,
      feed_url: `${SITE_URL}rss.json`,
      description: channel.description,
      icon: channel.avatar,
      authors: [
        {
          name: channel.title,
          url: SITE_URL,
          avatar: channel.avatar,
        },
      ],
      language: 'zh-CN',
      items: channel.posts.map((post) => ({
        id: `${SITE_URL}posts/${post.id}`,
        url: `${SITE_URL}posts/${post.id}`,
        title: post.title,
        content_html: post.content,
        date_published: post.datetime,
        tags: post.tags,
        _channel: post.channel,
      })),
    }),
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
  )
}
