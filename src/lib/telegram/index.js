import { $fetch } from 'ofetch'
import * as cheerio from 'cheerio'
import { LRUCache } from 'lru-cache'
import flourite from 'flourite'
import prism from '../prism'
import { getEnv } from '../env'
import { preloadCache } from './preload-cache.js'

// LRU缓存配置 - 增强缓存策略避免频繁请求
const cache = new LRUCache({
  ttl: 1000 * 60 * 30, // 30分钟TTL - 进一步延长缓存时间以提高性能
  maxSize: 150 * 1024 * 1024, // 150MB最大缓存 - 增加缓存空间
  sizeCalculation: (item) => {
    return JSON.stringify(item).length
  },
  updateAgeOnGet: true, // 访问时更新年龄
  allowStale: true, // 允许返回过期数据
  ttlAutopurge: false, // 禁用自动清理,保留过期数据
})

// 从预加载的缓存数据初始化 LRU 缓存
if (preloadCache && preloadCache.length > 0) {
  console.info(`加载预构建缓存: ${preloadCache.length} 个缓存项`)
  preloadCache.forEach(({ key, value }) => {
    try {
      cache.set(key, value)
    } catch (error) {
      console.warn('加载缓存项失败:', error.message)
    }
  })
  console.info('预构建缓存加载完成')
}

// 请求速率限制器 - 防止Telegram风控
class RateLimiter {
  constructor(maxRequests = 5, timeWindow = 10000) {
    this.maxRequests = maxRequests // 每个时间窗口最多请求数
    this.timeWindow = timeWindow // 时间窗口(毫秒)
    this.requests = []
  }

  async waitForSlot() {
    const now = Date.now()
    // 清理过期的请求记录
    this.requests = this.requests.filter(time => now - time < this.timeWindow)

    if (this.requests.length >= this.maxRequests) {
      // 需要等待
      const oldestRequest = this.requests[0]
      const waitTime = this.timeWindow - (now - oldestRequest) + Math.random() * 1000
      console.info(`Rate limit reached, waiting ${Math.round(waitTime)}ms...`)
      await new Promise(resolve => setTimeout(resolve, waitTime))
      return this.waitForSlot() // 递归检查
    }

    this.requests.push(now)
  }
}

const rateLimiter = new RateLimiter(3, 10000) // 每10秒最多3个请求

// 不必要的请求头
const unnecessaryHeaders = ['host', 'cookie', 'origin', 'referer']

// 随机延迟函数 - 模拟真实用户行为
function randomDelay(min = 1000, max = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min
  return new Promise(resolve => setTimeout(resolve, delay))
}

// 用户代理池
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
]

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)]
}

function getVideoStickers($, item, { staticProxy, index }) {
  return $(item).find('.js-videosticker_video')?.map((_index, video) => {
    const url = $(video)?.attr('src')
    const imgurl = $(video).find('img')?.attr('src')
    return `
    <div style="background-image: none; width: 256px;">
      <video src="${staticProxy + url}" width="100%" height="100%" alt="Video Sticker" preload muted autoplay loop playsinline disablepictureinpicture >
        <img class="sticker" src="${staticProxy + imgurl}" alt="Video Sticker" loading="${index > 15 ? 'eager' : 'lazy'}" />
      </video>
    </div>
    `
  })?.get()?.join('')
}

function getImageStickers($, item, { staticProxy, index }) {
  return $(item).find('.tgme_widget_message_sticker')?.map((_index, image) => {
    const url = $(image)?.attr('data-webp')
    return `<img class="sticker" src="${staticProxy + url}" style="width: 256px;" alt="Sticker" loading="${index > 15 ? 'eager' : 'lazy'}" />`
  })?.get()?.join('')
}

function getImages($, item, { staticProxy, id, index, title }) {
  const images = $(item).find('.tgme_widget_message_photo_wrap')?.map((_index, photo) => {
    const url = $(photo).attr('style').match(/url\(["'](.*?)["']/)?.[1]
    const popoverId = `modal-${id}-${_index}`
    return `
      <button class="image-preview-button image-preview-wrap" popovertarget="${popoverId}" popovertargetaction="show">
        <img src="${staticProxy + url}" alt="${title}" loading="${index > 15 ? 'eager' : 'lazy'}" />
      </button>
      <button class="image-preview-button modal" id="${popoverId}" popovertarget="${popoverId}" popovertargetaction="hide" popover>
        <img class="modal-img" src="${staticProxy + url}" alt="${title}" loading="lazy" />
      </button>
    `
  })?.get()
  return images.length ? `<div class="image-list-container ${images.length % 2 === 0 ? 'image-list-even' : 'image-list-odd'}">${images?.join('')}</div>` : ''
}

function getVideo($, item, { staticProxy, index }) {
  const video = $(item).find('.tgme_widget_message_video_wrap video')
  video?.attr('src', staticProxy + video?.attr('src'))
    ?.attr('controls', true)
    ?.attr('preload', index > 15 ? 'auto' : 'metadata')
    ?.attr('playsinline', true).attr('webkit-playsinline', true)

  const roundVideo = $(item).find('.tgme_widget_message_roundvideo_wrap video')
  roundVideo?.attr('src', staticProxy + roundVideo?.attr('src'))
    ?.attr('controls', true)
    ?.attr('preload', index > 15 ? 'auto' : 'metadata')
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
  const imageSrc = src ? staticProxy + src : ''
  image?.replaceWith(`<img class="link_preview_image" alt="${title}" src="${imageSrc}" loading="${index > 15 ? 'eager' : 'lazy'}" />`)
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
      getImages($, item, { staticProxy, id, index, title }),
      getVideo($, item, { staticProxy, id, index, title }),
      getAudio($, item, { staticProxy, id, index, title }),
      content?.html(),
      getImageStickers($, item, { staticProxy, index }),
      getVideoStickers($, item, { staticProxy, index }),
      $(item).find('.tgme_widget_message_poll')?.html(),
      $.html($(item).find('.tgme_widget_message_document_wrap')),
      $.html($(item).find('.tgme_widget_message_video_player.not_supported')),
      $.html($(item).find('.tgme_widget_message_location_wrap')),
      getLinkPreview($, item, { staticProxy, index }),
    ].filter(Boolean).join('').replace(/(url\(["'])((https?:)?\/\/)/g, (match, p1, p2, _p3) => {
      if (p2 === '//') {
        p2 = 'https://'
      }
      if (p2?.startsWith('t.me')) {
        return false
      }
      return `${p1}${staticProxy}${p2}`
    }),
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
    console.info('Cache hit for channel:', channel)
    return JSON.parse(JSON.stringify(cachedResult))
  }

  // 速率限制
  await rateLimiter.waitForSlot()

  const host = getEnv(import.meta.env, Astro, 'TELEGRAM_HOST') ?? 't.me'
  const staticProxy = getEnv(import.meta.env, Astro, 'STATIC_PROXY') ?? ''

  const url = id ? `https://${host}/${channel}/${id}?embed=1&mode=tme` : `https://${host}/s/${channel}`
  const headers = Object.fromEntries(Astro.request.headers)

  Object.keys(headers).forEach((key) => {
    if (unnecessaryHeaders.includes(key)) {
      delete headers[key]
    }
  })

  // 添加随机User-Agent
  headers['User-Agent'] = getRandomUserAgent()

  console.info('Fetching channel:', channel, { before, after, q, type, id })

  try {
    const html = await $fetch(url, {
      headers,
      query: {
        before: before || undefined,
        after: after || undefined,
        q: q || undefined,
      },
      retry: 3,
      retryDelay: 1000, // 增加重试延迟
      timeout: 15000, // 增加超时时间
    })

    const $ = cheerio.load(html, {}, false)

    if (id) {
      const post = getPost($, null, { channel, staticProxy })
      cache.set(cacheKey, post)
      return post
    }

    const posts = $('.tgme_channel_history .tgme_widget_message_wrap')?.map((index, item) => {
      return getPost($, item, { channel, staticProxy, index })
    })?.get()?.reverse().filter(post => ['text'].includes(post.type) && post.id && post.content)

    const channelInfo = {
      posts,
      title: $('.tgme_channel_info_header_title')?.text(),
      description: $('.tgme_channel_info_description')?.text(),
      descriptionHTML: modifyHTMLContent($, $('.tgme_channel_info_description'))?.html(),
      avatar: $('.tgme_page_photo_image img')?.attr('src'),
      username: channel,
    }

    cache.set(cacheKey, channelInfo)

    // 添加随机延迟
    await randomDelay(500, 1500)

    return channelInfo
  }
  catch (error) {
    console.error(`Error fetching channel ${channel}:`, error)
    // 返回空数据而不是抛出错误
    return {
      posts: [],
      title: channel,
      description: '',
      descriptionHTML: '',
      avatar: null,
      username: channel,
    }
  }
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
    console.info('Cache hit for multi-channel')
    return JSON.parse(JSON.stringify(cachedResult))
  }

  console.info('Fetching multi-channel:', channels)

  try {
    // 并发获取所有频道数据(带速率限制)
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
      return timeB - timeA // 降序
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
  catch (error) {
    console.error('Error fetching multi-channel:', error)
    throw error
  }
}
