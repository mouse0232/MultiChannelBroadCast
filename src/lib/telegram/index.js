import { $fetch } from 'ofetch'
import * as cheerio from 'cheerio'
import { LRUCache } from 'lru-cache'
import flourite from 'flourite'
import prism from '../prism'
import { getEnv } from '../env'

// 图片代理帮助函数
function getProxyUrl(url) {
  if (!url) return ''
  // 统一使用 wsrv.nl 代理
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}`
}

// 使用 BroadcastChannel 的简单缓存配置
const cache = new LRUCache({
  ttl: 1000 * 60 * 5, // 5分钟TTL
  maxSize: 50 * 1024 * 1024, // 50MB最大缓存
  sizeCalculation: (item) => {
    return JSON.stringify(item).length
  },
})

// 不必要的请求头
const unnecessaryHeaders = ['host', 'cookie', 'origin', 'referer']

function getVideoStickers($, item, { staticProxy, index }) {
  return $(item).find('.js-videosticker_video')?.map((_index, video) => {
    const url = $(video)?.attr('src')
    const imgurl = $(video).find('img')?.attr('src')
    return `
    <div style="background-image: none; width: 256px;">
      <video src="${staticProxy + url}" width="100%" height="100%" alt="Video Sticker" preload muted autoplay loop playsinline disablepictureinpicture >
        <img class="sticker" src="${getProxyUrl(imgurl)}" alt="Video Sticker" loading="${index > 4 ? 'eager' : 'lazy'}" />
      </video>
    </div>
    `
  })?.get()?.join('')
}

function getImageStickers($, item, { index }) {
  return $(item).find('.tgme_widget_message_sticker')?.map((_index, image) => {
    const url = $(image)?.attr('data-webp')
    return `<img class="sticker" src="${getProxyUrl(url)}" style="width: 256px;" alt="Sticker" loading="${index > 4 ? 'eager' : 'lazy'}" />`
  })?.get()?.join('')
}

function getImages($, item, { id, index, title }) {
  const images = $(item).find('.tgme_widget_message_photo_wrap')?.map((_index, photo) => {
    const url = $(photo).attr('style').match(/url\(["'](.*?)["']/)?.[1]
    const popoverId = `modal-${id}-${_index}`
    return `
      <button class="image-preview-button image-preview-wrap" popovertarget="${popoverId}" popovertargetaction="show">
        <img src="${getProxyUrl(url)}" alt="${title}" loading="${index > 4 ? 'eager' : 'lazy'}" />
      </button>
      <button class="image-preview-button modal" id="${popoverId}" popovertarget="${popoverId}" popovertargetaction="hide" popover>
        <img class="modal-img" src="${getProxyUrl(url)}" alt="${title}" loading="lazy" />
      </button>
    `
  })?.get()
  return images.length ? `<div class="image-list-container ${images.length % 2 === 0 ? 'image-list-even' : 'image-list-odd'}">${images?.join('')}</div>` : ''
}

function getVideo($, item, { staticProxy, index }) {
  const video = $(item).find('.tgme_widget_message_video_wrap video')
  video?.attr('src', staticProxy + video?.attr('src'))
    ?.attr('controls', true)
    ?.attr('preload', index > 4 ? 'auto' : 'metadata')
    ?.attr('playsinline', true).attr('webkit-playsinline', true)

  const roundVideo = $(item).find('.tgme_widget_message_roundvideo_wrap video')
  roundVideo?.attr('src', staticProxy + roundVideo?.attr('src'))
    ?.attr('controls', true)
    ?.attr('preload', index > 4 ? 'auto' : 'metadata')
    ?.attr('playsinline', true).attr('webkit-playsinline', true)
  return $.html(video) + $.html(roundVideo)
}

function getAudio($, item, { staticProxy }) {
  const audio = $(item).find('.tgme_widget_message_voice')
  audio?.attr('src', staticProxy + audio?.attr('src'))
    ?.attr('controls', true)
  return $.html(audio)
}

function getLinkPreview($, item, { staticProxy, index }) {
  const link = $(item).find('.tgme_widget_message_link_preview')
  const title = $(item).find('.link_preview_title')?.text() || $(item).find('.link_preview_site_name')?.text()
  const description = $(item).find('.link_preview_description')?.text()

  link?.attr('target', '_blank').attr('rel', 'noopener').attr('title', description)

  const image = $(item).find('.link_preview_image')
  const src = image?.attr('style')?.match(/url\(["'](.*?)["']/i)?.[1]
  const imageSrc = src ? getProxyUrl(src) : ''
  image?.replaceWith(`<img class="link_preview_image" alt="${title}" src="${imageSrc}" loading="${index > 4 ? 'eager' : 'lazy'}" />`)
  return $.html(link)
}

function getReply($, item, { channel }) {
  const reply = $(item).find('.tgme_widget_message_reply')
  reply?.wrapInner('<small></small>')?.wrapInner('<blockquote></blockquote>')

  const href = reply?.attr('href')
  if (href) {
    const url = new URL(href)
    reply?.attr('href', `${url.pathname}`.replace(new RegExp(`/${channel}/`, 'i'), '/posts/'))
  }

  // 处理回复消息的缩略图
  const thumb = reply?.find('.tgme_widget_message_reply_thumb')
  if (thumb && thumb.length > 0) {
    const style = thumb.attr('style')
    if (style) {
      const urlMatch = style.match(/url\(['"]?(.*?)['"]?\)/)
      if (urlMatch && urlMatch[1]) {
        const originalUrl = urlMatch[1]
        const proxiedUrl = getProxyUrl(originalUrl)
        const newStyle = style.replace(urlMatch[0], `url('${proxiedUrl}')`)
        thumb.attr('style', newStyle)
      }
    }
  }

  return $.html(reply)
}

function modifyHTMLContent($, content, { index } = {}) {
  $(content).find('.emoji')?.removeAttr('style')
  $(content).find('a')?.each((_index, a) => {
    $(a)?.attr('title', $(a)?.text())?.removeAttr('onclick')
  })
  $(content).find('tg-spoiler')?.each((_index, spoiler) => {
    const id = `spoiler-${index}-${_index}`
    $(spoiler)?.attr('id', id)
      ?.wrap('<label class="spoiler-button"></label>')
      ?.before(`<input type="checkbox" />`)
  })
  $(content).find('pre').each((_index, pre) => {
    try {
      $(pre).find('br')?.replaceWith('\n')

      const code = $(pre).text()
      const language = flourite(code, { shiki: true, noUnknown: true })?.language || 'text'
      const highlightedCode = prism.highlight(code, prism.languages[language], language)
      $(pre).html(`<code class="language-${language}">${highlightedCode}</code>`)
    }
    catch (error) {
      console.error(error)
    }
  })
  return content
}

function getPost($, item, { channel, staticProxy, index = 0 }) {
  item = item ? $(item).find('.tgme_widget_message') : $('.tgme_widget_message')
  const content = $(item).find('.js-message_reply_text')?.length > 0
    ? modifyHTMLContent($, $(item).find('.tgme_widget_message_text.js-message_text'), { index })
    : modifyHTMLContent($, $(item).find('.tgme_widget_message_text'), { index })
  const title = content?.text()?.match(/^.*?(?=[。\n]|http\S)/g)?.[0] ?? content?.text() ?? ''
  const id = $(item).attr('data-post')?.replace(new RegExp(`${channel}/`, 'i'), '')

  const tags = $(content).find('a[href^="?q="]')?.each((_index, a) => {
    $(a)?.attr('href', `/search/${encodeURIComponent($(a)?.text())}`)
  })?.map((_index, a) => $(a)?.text()?.replace('#', ''))?.get()

  return {
    id,
    title,
    channel, // 添加频道信息用于多频道聚合
    type: $(item).attr('class')?.includes('service_message') ? 'service' : 'text',
    datetime: $(item).find('.tgme_widget_message_date time')?.attr('datetime'),
    tags,
    text: content?.text(),
    content: [
      getReply($, item, { channel }),
      getImages($, item, { id, index, title }),
      getVideo($, item, { staticProxy, id, index, title }),
      getAudio($, item, { staticProxy, id, index, title }),
      content?.html(),
      getImageStickers($, item, { index }),
      getVideoStickers($, item, { staticProxy, index }),
      $(item).find('.tgme_widget_message_poll')?.html(),
      $.html($(item).find('.tgme_widget_message_document_wrap')),
      $.html($(item).find('.tgme_widget_message_video_player.not_supported')),
      $.html($(item).find('.tgme_widget_message_location_wrap')),
      getLinkPreview($, item, { staticProxy, index }),
    ].filter(Boolean).join(''),
  }
}

/**
 * 获取单个频道信息
 * @param {object} Astro - Astro context
 * @param {string} channel - 频道用户名
 * @param {object} options - 选项 {before, after, q, type, id}
 */
export async function getSingleChannelInfo(Astro, channel, { before = '', after = '', q = '', type = 'list', id = '' } = {}) {
  const cacheKey = JSON.stringify({ channel, before, after, q, type, id })
  const cachedResult = cache.get(cacheKey)

  if (cachedResult) {
    console.info('Match Cache', channel, { before, after, q, type, id })
    return JSON.parse(JSON.stringify(cachedResult))
  }

  /* Helper function to check if a URL is an image handled by wsrv */
  const isImageRequest = (url) => {
    return true; // We assume we use this proxy primarily for images in this context
  }

  // Load balance between wsrv.nl and statically.io

  // Keep using local proxy for non-image assets (video, audio) if needed
  // or fallback to '' if no local proxy defined (though local proxy is detected via env normally)
  const localProxy = getEnv(import.meta.env, Astro, 'STATIC_PROXY') ?? ''
  const host = getEnv(import.meta.env, Astro, 'TELEGRAM_HOST') ?? 't.me'

  const headers = Object.fromEntries(Astro.request.headers)
  Object.keys(headers).forEach((key) => {
    if (unnecessaryHeaders.includes(key)) {
      delete headers[key]
    }
  })

  // 如果是单个帖子,先获取频道首页来提取频道标题
  let channelTitle = channel
  let channelAvatar = null

  if (id) {
    try {
      // 请求频道首页获取频道标题
      const channelPageUrl = `https://${host}/s/${channel}`
      console.info('Fetching channel info from:', channelPageUrl)

      const channelHtml = await $fetch(channelPageUrl, {
        headers,
        retry: 2,
        retryDelay: 100,
      })

      const $channel = cheerio.load(channelHtml, {}, false)
      channelTitle = $channel('.tgme_page_title span')?.text()?.trim() ||
        $channel('.tgme_page_title')?.text()?.trim() ||
        $channel('.tgme_channel_info_header_title')?.text()?.trim() ||
        channel
      channelAvatar = $channel('.tgme_page_photo_image img')?.attr('src')

      // 通过静态代理加载头像
      if (channelAvatar) {
        channelAvatar = getProxyUrl(channelAvatar)
      }

      console.info('Channel info extracted:', { channel, channelTitle, hasAvatar: !!channelAvatar })
    } catch (error) {
      console.warn('Failed to fetch channel info, using username:', error.message)
    }
  }

  // 请求帖子内容
  const url = id ? `https://${host}/${channel}/${id}?embed=1&mode=tme` : `https://${host}/s/${channel}`
  console.info('Fetching content from:', url, { before, after, q, type, id })

  const html = await $fetch(url, {
    headers,
    query: {
      before: before || undefined,
      after: after || undefined,
      q: q || undefined,
    },
    retry: 3,
    retryDelay: 100,
  })

  const $ = cheerio.load(html, {}, false)

  if (id) {
    // Pass specific proxies for different media types
    const post = getPost($, null, {
      channel,
      staticProxy: localProxy, // Videos/Audio use local
    })

    // 返回包含频道信息的对象
    const result = {
      ...post,
      channelTitle, // 从频道首页获取的昵称
      channelAvatar,
    }
    cache.set(cacheKey, result)
    return result
  }

  // 列表页获取频道信息
  if (!channelTitle || channelTitle === channel) {
    channelTitle = $('.tgme_page_title span')?.text()?.trim() ||
      $('.tgme_page_title')?.text()?.trim() ||
      $('.tgme_channel_info_header_title')?.text()?.trim() ||
      channel
  }

  if (!channelAvatar) {
    channelAvatar = $('.tgme_page_photo_image img')?.attr('src')
    // 通过静态代理加载头像
    if (channelAvatar) {
      channelAvatar = getProxyUrl(channelAvatar)
    }
  }

  const posts = $('.tgme_channel_history .tgme_widget_message_wrap')?.map((index, item) => {
    return getPost($, item, {
      channel,
      staticProxy: localProxy,
      index
    })
  })?.get()?.reverse().filter(post => ['text'].includes(post.type) && post.id && post.content)

  const channelInfo = {
    posts,
    title: channelTitle,
    description: $('.tgme_channel_info_description')?.text(),
    descriptionHTML: modifyHTMLContent($, $('.tgme_channel_info_description'))?.html(),
    avatar: channelAvatar,
    username: channel,
  }

  cache.set(cacheKey, channelInfo)
  return channelInfo
}

/**
 * 获取多个频道聚合信息 - 核心多频道功能
 * @param {object} Astro - Astro context  
 * @param {object} options - 选项 {before, after, q}
 */
export async function getChannelInfo(Astro, { before = '', after = '', q = '' } = {}) {
  const channelsStr = getEnv(import.meta.env, Astro, 'CHANNELS') || getEnv(import.meta.env, Astro, 'CHANNEL')
  if (!channelsStr) {
    throw new Error('No CHANNELS or CHANNEL environment variable set')
  }

  const channels = channelsStr.split(',').map(c => c.trim()).filter(Boolean)

  // 如果只有一个频道,直接返回
  if (channels.length === 1) {
    return getSingleChannelInfo(Astro, channels[0], { before, after, q })
  }

  // 多频道聚合
  const cacheKey = JSON.stringify({ channels, before, after, q })
  const cachedResult = cache.get(cacheKey)

  if (cachedResult) {
    console.info('Match Cache (multi-channel)')
    return JSON.parse(JSON.stringify(cachedResult))
  }

  console.info('Fetching multi-channel:', channels)

  // 并发获取所有频道数据
  const channelInfos = await Promise.all(
    channels.map(channel => getSingleChannelInfo(Astro, channel, { before, after, q }))
  )

  // 聚合所有帖子
  let allPosts = []
  channelInfos.forEach(info => {
    if (info.posts && info.posts.length > 0) {
      allPosts = allPosts.concat(info.posts)
    }
  })

  // 按时间倒序排序
  allPosts.sort((a, b) => {
    const timeA = new Date(a.datetime).getTime()
    const timeB = new Date(b.datetime).getTime()
    return timeB - timeA
  })

  // 去重(基于频道+ID)
  const seen = new Set()
  allPosts = allPosts.filter(post => {
    const key = `${post.channel}-${post.id}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })

  // 构建聚合结果
  const siteName = getEnv(import.meta.env, Astro, 'SITE_NAME') || 'Multi-Channel Broadcast'
  const aggregatedInfo = {
    posts: allPosts,
    title: siteName,
    description: `Aggregated content from ${channels.length} channels: ${channels.join(', ')}`,
    descriptionHTML: `<p>Aggregated content from ${channels.length} channels: ${channels.join(', ')}</p>`,
    avatar: channelInfos[0]?.avatar || null,
    channels: channelInfos.map(info => ({
      username: info.username,
      title: info.title,
      avatar: info.avatar,
    })),
  }

  cache.set(cacheKey, aggregatedInfo)
  return aggregatedInfo
}

