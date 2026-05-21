import { getDB } from './database.js'
import { processMediaUrls } from './media-proxy.js'
import { triggerPush } from './pusher.js'
import { KeywordFilter, RuleLoader } from '../lib/KeywordFilter.js'
import { $fetch } from 'ofetch'
import * as cheerio from 'cheerio'

let db = null
let filterRules = null
let ruleLoader = null

async function loadFilterRules() {
  if (!filterRules) {
    const { safeLoadFilterRules } = await import('../lib/KeywordFilter.js')
    filterRules = await safeLoadFilterRules()
    ruleLoader = new RuleLoader(filterRules)
  }
  return { filterRules, ruleLoader }
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
]

export function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

export function randomDelay(min = 1000, max = 3000) {
  return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min))
}

function getDatabase() {
  if (!db) {
    db = getDB()
  }
  return db
}

/**
 * 处理单个频道抓取任务
 */
export async function processSingleChannel(task) {
  const database = getDatabase()
  const { ruleLoader } = await loadFilterRules()
  
  const { channel } = task
  console.log(`🚀 Processing channel: ${channel}`)

  const meta = database.prepare("SELECT last_msg_id FROM channel_meta WHERE channel = ?").get(channel)
  const lastMsgId = meta?.last_msg_id
  const isFirstRun = !meta || !lastMsgId

  const workerUrl = process.env.WORKER_URL || process.env.SITE_URL || ''
  const result = await fetchAndParse(channel, lastMsgId, workerUrl)
  const posts = result.posts
  const channelInfo = result.info
  
  if (posts.length === 0) {
    console.log(`ℹ️ No new posts for ${channel}`)
  }

  console.log(`📦 Parsed ${posts.length} posts for ${channel}`)

  const filterEnabled = process.env.FILTER_ENABLED === 'true'
  let filteredPosts = posts
  let blockedPosts = []

  if (filterEnabled) {
    const ruleConfig = ruleLoader.loadRules(channel)
    const filter = new KeywordFilter(ruleConfig)

    filteredPosts = []
    blockedPosts = []

    for (const post of posts) {
      const filterResult = filter.filter(post)
      
      if (filterResult.passed) {
        filteredPosts.push(post)
      } else {
        blockedPosts.push({
          post,
          reason: filterResult.matchedRules.map(r => r.pattern).join(', '),
          mode: filterResult.mode
        })
      }
    }

    if (blockedPosts.length > 0) {
      console.log(`🚫 Blocked ${blockedPosts.length} posts for ${channel}:`)
      blockedPosts.forEach(bp => {
        console.log(`   - ${bp.post.id}: ${bp.reason} (${bp.mode})`)
      })
    }
  } else {
    console.log(`ℹ️ Filter disabled for ${channel}`)
  }

  const postsToSave = []
  
  for (const post of filteredPosts) {
    const rawId = post.id.split('/').pop()
    if (lastMsgId && parseInt(rawId) <= parseInt(lastMsgId)) {
      const existing = database.prepare("SELECT published_at FROM posts WHERE id = ?").get(post.id)
      if (existing && post.datetime > existing.published_at) {
        postsToSave.push(post)
        console.log(`📝 Updated post: ${post.id} (edited)`)
        
        await syncTelegramEdit(post)
      }
    } else {
      postsToSave.push(post)
    }
  }

  if (postsToSave.length > 0) {
    const transaction = database.transaction(() => {
      for (const post of postsToSave) {
        database.prepare(`
          INSERT OR REPLACE INTO posts (id, channel, title, content, published_at) 
          VALUES (?, ?, ?, ?, ?)
        `).run(post.id, post.channel, post.title, post.content, post.datetime)
      }
    })
    transaction()
    console.log(`💾 Saved ${postsToSave.length} posts`)
  }

  const rawIds = posts.map(p => p.id.split('/').pop() || p.id)
  const maxRawId = rawIds.length > 0 ? rawIds.reduce((a, b) => parseInt(a) > parseInt(b) ? a : b, '0') : (lastMsgId || '0')
  const finalMsgId = rawIds.length > 0 ? maxRawId : lastMsgId

  database.prepare(
    "INSERT OR REPLACE INTO channel_meta (channel, last_msg_id, title, avatar, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)"
  ).run(channel, finalMsgId, channelInfo.title, channelInfo.avatar)

  const newPosts = filteredPosts.filter(p => !lastMsgId || parseInt(p.id.split('/').pop()) > parseInt(lastMsgId))
  
  console.log(`📊 [${channel}] lastMsgId: ${lastMsgId}, newPosts: ${newPosts.length}, isFirstRun: ${isFirstRun}`)
  
  if (isFirstRun) {
    console.log(`ℹ️ First run for ${channel}, skipping push notifications.`)
  } else {
    if (newPosts.length > 0) {
      console.log(`🚀 Triggering push for ${newPosts.length} new posts...`)
      await triggerPush(newPosts)
    } else {
      console.log(`🔕 No new posts to push`)
    }
  }
  
  console.log(`✅ Finished channel: ${channel}`)
}

/**
 * 抓取并解析频道内容
 */
async function fetchAndParse(channel, lastMsgId, workerUrl) {
  const hosts = (process.env.TELEGRAM_HOST || 't.me').split(',').map(h => h.trim()).filter(Boolean)
  
  for (const host of hosts) {
    console.log(`🔄 Trying host: ${host} for channel ${channel}`)
    
    try {
      const url = `https://${host}/s/${channel}`
      const headers = { 
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
      
      const html = await $fetch(url, { headers, retry: 1, retryDelay: 1000 })
      console.log(`✅ Successfully fetched from ${host}`)
      return parsePosts(html, channel, lastMsgId, workerUrl)
    } catch (e) {
      console.warn(`❌ Host ${host} failed: ${e.message}. Trying next host...`)
    }
  }

  throw new Error(`All hosts failed for channel: ${channel}`)
}

/**
 * 解析 HTML 提取帖子数据
 */
function parsePosts(html, channel, lastMsgId, workerUrl) {
  const $ = cheerio.load(html)
  const posts = []
  
  const title = $('.tgme_page_title span').text().trim() || 
                $('.tgme_channel_info_header_title').text().trim() || 
                channel
  let avatar = $('.tgme_page_photo_image img').attr('src')
  
  if (avatar) {
    const imgProxyPrefix = workerUrl ? `${workerUrl}/img-proxy?url=` : 'https://wsrv.nl/?url='
    if (!avatar.startsWith(imgProxyPrefix)) {
      avatar = `${imgProxyPrefix}${encodeURIComponent(avatar)}`
    }
  }
  
  const items = $('.tgme_widget_message_wrap').toArray()
  
  for (const item of items) {
    const $item = $(item).find('.tgme_widget_message')
    const postAttr = $item.attr('data-post')
    if (!postAttr) continue
    
    const id = postAttr
    
    const replyEl = $item.find('.tgme_widget_message_reply')
    if (replyEl.length > 0) {
      replyEl.wrapInner('<small></small>').wrapInner('<blockquote></blockquote>')
    }
    
    const contentEl = $item.find('.tgme_widget_message_text').filter((_, el) => {
      return !$(el).closest('.tgme_widget_message_reply').length
    })
    
    let postTitle = ''
    let contentHtml = ''
    
    let finalHtml = ''
    if (replyEl.length > 0) {
      finalHtml += replyEl.html()
    }
    if (contentEl.length > 0) {
      finalHtml += contentEl.html()
    }

    if (finalHtml) {
      contentHtml = processMediaUrls(finalHtml, workerUrl)
      
      let mainText = contentEl.text().trim()
      let cleanText = mainText.replace(/(^|\s)([#@]\S+)/g, '').trim()
      const match = cleanText.match(/^.*?(?=[。\n]|http\S)/g)
      if (match && match[0] && match[0].trim()) {
        postTitle = match[0].trim()
      } else {
        postTitle = mainText.replace(/\n/g, ' ').substring(0, 60)
      }
      if (!postTitle && !contentEl.length) postTitle = 'New Post'
    }

    const mediaElements = []
    
    $item.find('.tgme_widget_message_photo_wrap').each((_, el) => {
      const style = $(el).attr('style') || ''
      const bgMatch = style.match(/background-image:url\(['"]?([^'")]+)['"]?\)/)
      if (bgMatch) {
        let imgUrl = bgMatch[1]
        const imgProxyPrefix = workerUrl ? `${workerUrl}/img-proxy?url=` : 'https://wsrv.nl/?url='
        imgUrl = `${imgProxyPrefix}${encodeURIComponent(imgUrl)}`
        mediaElements.push(`<img src="${imgUrl}" alt="Photo" loading="lazy" />`)
      }
    })
    
    $item.find('.tgme_widget_message_link_image').each((_, el) => {
      const img = $(el).find('img')
      if (img.length > 0) {
        let imgUrl = img.attr('src')
        if (imgUrl) {
          const imgProxyPrefix = workerUrl ? `${workerUrl}/img-proxy?url=` : 'https://wsrv.nl/?url='
          imgUrl = `${imgProxyPrefix}${encodeURIComponent(imgUrl)}`
          mediaElements.push(`<img src="${imgUrl}" alt="Link Preview" loading="lazy" />`)
        }
      }
    })
    
    $item.find('.tgme_widget_message_video_wrap').each((_, el) => {
      const video = $(el).find('video')
      if (video.length > 0) {
        const videoHtml = processMediaUrls($(el).html(), workerUrl)
        mediaElements.push(videoHtml)
      } else {
        const thumb = $(el).find('.tgme_widget_message_video_thumb img')
        if (thumb.length > 0) {
          const thumbUrl = thumb.attr('src')
          if (thumbUrl) {
            const imgProxyPrefix = workerUrl ? `${workerUrl}/img-proxy?url=` : 'https://wsrv.nl/?url='
            const proxiedUrl = `${imgProxyPrefix}${encodeURIComponent(thumbUrl)}`
            mediaElements.push(`<img src="${proxiedUrl}" alt="Video Thumbnail" loading="lazy" />`)
          }
        }
      }
    })

    const datetimeEl = $item.find('.tgme_widget_message_date time')
    const datetime = datetimeEl.attr('datetime')

    posts.push({
      id,
      channel,
      title: postTitle.substring(0, 100),
      content: contentHtml,
      datetime
    })
  }
  
  return { posts, info: { title, avatar } }
}

/**
 * 同步 Telegram 编辑消息
 */
async function syncTelegramEdit(post) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const channelId = process.env.TELEGRAM_PUSH_CHANNEL_ID
    
    if (!botToken || !channelId) return
    
    const database = getDatabase()
    const log = database.prepare("SELECT tg_message_id FROM push_logs WHERE post_id = ?").get(post.id)
    
    if (log?.tg_message_id) {
      const imageUrl = extractFirstImage(post.content || '')
      const { text } = await createPushContent(post)
      
      if (imageUrl) {
        await $fetch(`https://api.telegram.org/bot${botToken}/editMessageCaption`, {
          method: 'POST',
          body: { chat_id: channelId, message_id: log.tg_message_id, caption: text, parse_mode: 'HTML' }
        })
      } else {
        await $fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
          method: 'POST',
          body: { chat_id: channelId, message_id: log.tg_message_id, text: text, parse_mode: 'HTML' }
        })
      }
      console.log(`✏️ Synced TG edit for ${post.id}`)
    }
  } catch (e) {
    console.warn(`TG Sync Edit failed for ${post.id}: ${e.message}`)
  }
}

/**
 * 构建推送内容
 */
async function createPushContent(post) {
  const plainText = stripHtml(post.content || '')
  const channelName = post.channel || 'Unknown'
  const title = `📢 来自 @${channelName} 的新动态`
  const postUrl = `https://t.me/${post.id}`
  
  let summary = plainText
  if (plainText.length > 150) {
    summary = plainText.substring(0, 150) + '...'
  }

  const text = `${title}\n\n${escapeHtml(summary)}\n\n<a href="${postUrl}">阅读原文</a>`
  return { text }
}

function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim()
}

function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function extractFirstImage(html) {
  if (!html) return null
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match ? match[1] : null
}

/**
 * 清理过期数据
 */
export async function cleanupOldData() {
  const database = getDatabase()
  
  try {
    const deleteResult = database.exec(
      "DELETE FROM posts WHERE published_at < datetime('now', '-1 year')"
    )
    console.log(`🧹 Cleaned up old posts: ${deleteResult.changes} rows deleted`)

    const logDeleteResult = database.exec(
      "DELETE FROM push_logs WHERE post_id NOT IN (SELECT id FROM posts)"
    )
    console.log(`🧹 Cleaned up orphan push_logs: ${logDeleteResult.changes} rows deleted`)
  } catch (e) {
    console.error('Cleanup failed:', e.message)
  }
}
