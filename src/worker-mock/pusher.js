import { $fetch } from 'ofetch'

let db = null

function getDatabase() {
  if (!db) {
    const { getDB } = require('./database.js')
    db = getDB()
  }
  return db
}

function randomDelay(min = 1000, max = 2000) {
  return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min))
}

/**
 * 触发 Telegram 推送
 * @param {Array} posts - 要推送的帖子数组
 */
export async function triggerPush(posts) {
  const database = getDatabase()
  const pushEnabled = process.env.TELEGRAM_PUSH_ENABLED
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const channelId = process.env.TELEGRAM_PUSH_CHANNEL_ID

  if (pushEnabled !== 'true') {
    console.warn(`🚫 Push SKIPPED: TELEGRAM_PUSH_ENABLED is '${pushEnabled}'`)
    return
  }
  if (!botToken || !channelId) {
    console.error(`🚫 Push SKIPPED: Missing TELEGRAM_BOT_TOKEN or TELEGRAM_PUSH_CHANNEL_ID`)
    return
  }
  if (!posts || posts.length === 0) return

  console.log(`✅ Push Config OK. Token: ${botToken.substring(0,5)}..., Channel: ${channelId}`)

  let skippedCount = 0
  let pushedCount = 0

  for (const post of posts) {
    const log = database.prepare("SELECT tg_message_id FROM push_logs WHERE post_id = ?").get(post.id)
    if (log?.tg_message_id) {
      skippedCount++
      console.log(`⏭️ Skipped duplicate: ${post.id}`)
      continue
    }

    try {
      const imageUrl = extractFirstImage(post.content || '')
      const { text } = await createPushContent(post)
      
      let response
      
      try {
        if (imageUrl) {
          response = await $fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
            method: 'POST',
            body: { chat_id: channelId, photo: imageUrl, caption: text, parse_mode: 'HTML' },
            timeout: 10000
          })
        } else {
          response = await $fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            body: { chat_id: channelId, text: text, parse_mode: 'HTML', disable_web_page_preview: false },
            timeout: 10000
          })
        }
      } catch (htmlErr) {
        if (htmlErr.message.includes('400') || htmlErr.message.includes('Bad Request')) {
          console.warn(`⚠️ HTML push failed for ${post.id}, retrying as plain text...`)
          
          const plainText = text.replace(/<[^>]+>/g, '')
          
          if (imageUrl) {
            response = await $fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
              method: 'POST',
              body: { chat_id: channelId, photo: imageUrl, caption: plainText },
              timeout: 10000
            })
          } else {
            response = await $fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              body: { chat_id: channelId, text: plainText, disable_web_page_preview: false },
              timeout: 10000
            })
          }
        } else {
          throw htmlErr
        }
      }
      
      const tgMsgId = response.result?.message_id
      if (tgMsgId) {
        database.prepare("INSERT OR REPLACE INTO push_logs (post_id, tg_message_id) VALUES (?, ?)")
          .run(post.id, tgMsgId)
        pushedCount++
        console.log(`📨 Pushed: ${post.id} (TG ID: ${tgMsgId})`)
      } else {
        console.error(`⚠️ Push FAILED: ${post.id} - API returned OK but missing message_id!`)
      }
    } catch (e) {
      console.error(`🔴 Push FAILED: ${post.id} - ${e.message}`)
    }
    
    await randomDelay(1000, 2000)
  }
  
  console.log(`🏁 Push Summary: Total ${posts.length}, Pushed ${pushedCount}, Skipped (Duplicate) ${skippedCount}`)
}

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
