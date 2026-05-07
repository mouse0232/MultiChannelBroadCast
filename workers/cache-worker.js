import { $fetch } from 'ofetch'
import * as cheerio from 'cheerio'

// ==========================================
// 反风控配置 (UA 池 & Host 池)
// ==========================================
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
]

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

function randomDelay(min = 1000, max = 3000) {
  return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min))
}

// ==========================================
// 1. Cron 触发器 (生产者)
// ==========================================
export async function scheduled(event, env, ctx) {
  console.log('⏰ Cron triggered: Dispatching tasks')

  const channelsStr = env.CHANNELS || ''
  const channels = channelsStr.split(',').map(c => c.trim()).filter(Boolean)

  if (channels.length === 0) return console.warn('No channels configured')

  // 1. 发送抓取任务到队列
  const tasks = channels.map(ch => ({ channel: ch }))
  
  // Queue 发送逻辑
  try {
    // 批量发送
    await env.TASK_QUEUE.sendBatch(tasks.map(task => ({ body: task })))
    console.log(`✅ Dispatched ${tasks.length} tasks to Queue`)
  } catch (e) {
    console.error('Failed to send tasks to Queue:', e)
  }

  // 2. 定期清理 D1 旧数据 (例如：每次 Cron 执行时，清理一年前的数据)
  try {
    const deleteResult = await env.DB.prepare(
      "DELETE FROM posts WHERE published_at < datetime('now', '-1 year')"
    ).run()
    console.log(`🧹 Cleaned up old posts from D1: ${deleteResult.meta.changes || 0} rows deleted`)
  } catch (e) {
    console.error('D1 cleanup failed:', e)
  }
}

// ==========================================
// 2. Queue 消费者 (核心处理)
// ==========================================
export async function queue(batch, env, ctx) {
  console.log(`📦 Queue batch processing: ${batch.messages.length} messages`)

  for (const message of batch.messages) {
    try {
      await processSingleChannel(message.body, env)
      message.ack() // 确认完成
    } catch (e) {
      console.error(`❌ Task failed for channel ${message.body.channel}:`, e)
      // 不 ack，等待重试或进入死信队列
    }
  }
}

async function processSingleChannel(task, env) {
  const { channel } = task
  console.log(`🚀 Processing channel: ${channel}`)

  // 1. 获取上次抓取进度
  const meta = await env.DB.prepare("SELECT last_msg_id FROM channel_meta WHERE channel = ?").bind(channel).first()
  const lastMsgId = meta?.last_msg_id
  
  // 2. 执行抓取 (带防风控)
  const posts = await fetchAndParse(channel, env, lastMsgId)
  
  if (posts.length === 0) {
    console.log(`ℹ️ No new posts for ${channel}`)
    return
  }

  console.log(`📦 Parsed ${posts.length} new posts for ${channel}`)

  // 3. 写入 D1 (事务处理)
  // 使用 batch 批量写入
  const statements = posts.map(post => {
    return env.DB.prepare(`
      INSERT OR IGNORE INTO posts (id, channel, title, content, published_at) 
      VALUES (?, ?, ?, ?, ?)
    `).bind(post.id, post.channel, post.title, post.content, post.datetime)
  })

  // 更新 channel_meta
  // Telegram ID 通常是 channel/12345 格式，我们取 12345
  const rawIds = posts.map(p => p.id.split('/').pop() || p.id)
  const maxRawId = rawIds.reduce((a, b) => parseInt(a) > parseInt(b) ? a : b, '0')
  
  statements.push(
    env.DB.prepare(
      "INSERT OR REPLACE INTO channel_meta (channel, last_msg_id) VALUES (?, ?)"
    ).bind(channel, maxRawId)
  )

  await env.DB.batch(statements)

  // 4. 触发推送
  await triggerPush(posts, env)
  
  console.log(`✅ Finished channel: ${channel}`)
}

// ==========================================
// 辅助函数 (抓取与解析)
// ==========================================
async function fetchAndParse(channel, env, lastMsgId) {
  // Host 轮询逻辑
  const hosts = (env.TELEGRAM_HOST || 't.me').split(',').map(h => h.trim())
  const host = hosts[Math.floor(Math.random() * hosts.length)]
  
  const url = `https://${host}/s/${channel}`
  const headers = { 
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
  }
  
  try {
    // 如果是增量抓取，Telegram 支持 after 参数，但网页版不一定支持，这里我们先全量拉取并在代码过滤
    // 为了简单起见，我们获取完整页面然后解析
    const html = await $fetch(url, { headers, retry: 2, retryDelay: 2000 })
    return parsePosts(html, channel, lastMsgId)
  } catch (e) {
    throw new Error(`Fetch failed: ${e.message}`)
  }
}

function parsePosts(html, channel, lastMsgId) {
  const $ = cheerio.load(html)
  const posts = []
  
  // 找到所有消息
  const items = $('.tgme_widget_message_wrap').toArray()
  
  // Telegram 列表页通常是按时间倒序 (最新的在前面)
  // 但为了更新 lastMsgId，我们可能需要反转，或者直接处理并找到最大的 ID
  
  for (const item of items) {
    const $item = $(item).find('.tgme_widget_message')
    const postAttr = $item.attr('data-post') // e.g. "channel/12345"
    if (!postAttr) continue
    
    const rawId = postAttr.split('/').pop()
    const id = postAttr // 使用 "channel/12345" 作为全局唯一 ID
    
    // 增量逻辑：如果 ID 小于等于 lastMsgId，说明是旧数据，跳过
    // 注意：这里比较的是字符串还是数字？Telegram ID 是数字递增的
    if (lastMsgId && parseInt(rawId) <= parseInt(lastMsgId)) {
      continue
    }

    const contentEl = $item.find('.tgme_widget_message_text')
    // 如果内容空，可能是纯图片/视频消息，也可以抓取，但这里简化处理
    // 如果想抓取所有，去掉 if (!contentEl.length) continue
    // 但为了减少噪音，我们通常只抓取有文本的，或者至少有一个标题的
    let title = ''
    let contentHtml = ''
    
    if (contentEl.length > 0) {
       contentHtml = contentEl.html()
       title = contentEl.text().match(/^.*?(?=[。\n]|http\S)/g)?.[0] || ''
    } else {
       // 处理纯媒体消息，获取描述
       contentHtml = $item.html() // 或者提取 caption
       title = 'New Media Post'
    }

    const datetimeEl = $item.find('.tgme_widget_message_date time')
    const datetime = datetimeEl.attr('datetime')

    posts.push({
      id,
      channel,
      title: title.substring(0, 100), // 限制标题长度
      content: contentHtml,
      datetime
    })
  }
  
  // 因为页面是倒序的（新在前），我们过滤掉旧数据后，剩下的都是新的。
  // 但是为了正确更新 lastMsgId，我们需要知道最大的 ID。
  // 由于页面是倒序，第一个符合条件的就是最大的。
  
  return posts
}

// ==========================================
// 推送服务 (D1 修复版)
// ==========================================
async function triggerPush(posts, env) {
  if (env.TELEGRAM_PUSH_ENABLED !== 'true') return
  if (!posts || posts.length === 0) return

  const botToken = env.TELEGRAM_BOT_TOKEN
  const channelId = env.TELEGRAM_PUSH_CHANNEL_ID
  if (!botToken || !channelId) return

  for (const post of posts) {
    // 1. 检查 D1 推送日志
    const log = await env.DB.prepare("SELECT 1 FROM push_logs WHERE post_id = ?").bind(post.id).first()
    if (log) continue

    // 2. 发送消息
    try {
      const text = `🔔 <b>${post.title || 'New Post'}</b>\n\n<a href="https://t.me/${post.id}">View on Telegram</a>`
      
      await $fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        body: { chat_id: channelId, text, parse_mode: 'HTML', disable_web_page_preview: false },
        timeout: 5000
      })
      
      // 3. 记录日志
      await env.DB.prepare("INSERT OR IGNORE INTO push_logs (post_id) VALUES (?)").bind(post.id).run()
      console.log(`📩 Pushed: ${post.id}`)
    } catch (e) {
      console.warn(`Push failed for ${post.id}: ${e.message}`)
    }
    await randomDelay(1000, 2000) // 避免触发 Telegram 推送风控
  }
}

// ==========================================
// 3. HTTP Fetch Handler (为 Astro Pages 提供 API)
// ==========================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    
    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    }

    // Handle OPTIONS for CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    try {
      // API: 获取单个帖子 (通过 ID 数字部分)
      // GET /api/post/12345 -> 查找 channel/12345
      if (url.pathname.match(/^\/api\/post\/\d+$/)) {
        const postId = url.pathname.split('/').pop()
        // D1 ID format is "channel/12345"
        // We use LIKE to find the post ending with /postId
        const { results } = await env.DB.prepare(
          "SELECT * FROM posts WHERE id LIKE ? ORDER BY id DESC LIMIT 1"
        ).bind(`%/${postId}`).all()
        
        if (results.length === 0) {
          return new Response(JSON.stringify({ error: 'Post not found' }), { status: 404, headers: corsHeaders })
        }
        
        return new Response(JSON.stringify({ post: results[0] }), { headers: corsHeaders })
      }

      // API: 搜索帖子
      // GET /api/posts/search?q=keyword&channel=all
      if (url.pathname === '/api/posts/search') {
        const q = url.searchParams.get('q')
        const channel = url.searchParams.get('channel') || 'all'
        const limit = parseInt(url.searchParams.get('limit') || '20')
        
        if (!q) {
          return new Response(JSON.stringify({ posts: [] }), { headers: corsHeaders })
        }

        let query = `SELECT * FROM posts WHERE (title LIKE ? OR content LIKE ?)`
        const bindings = [`%${q}%`, `%${q}%`]

        if (channel !== 'all') {
          query += ` AND channel = ?`
          bindings.push(channel)
        }

        query += ` ORDER BY id DESC LIMIT ?`
        bindings.push(limit)

        const { results } = await env.DB.prepare(query).bind(...bindings).all()
        
        return new Response(JSON.stringify({ posts: results }), { headers: corsHeaders })
      }

      // API: 获取帖子列表
      // GET /api/posts?channel=all&limit=20&before=channel/123&after=channel/100
      if (url.pathname.startsWith('/api/posts')) {
        const channel = url.searchParams.get('channel') || 'all'
        const limit = parseInt(url.searchParams.get('limit') || '20')
        const before = url.searchParams.get('before')
        const after = url.searchParams.get('after')
        
        let query = `SELECT * FROM posts WHERE 1=1`
        const bindings = []

        if (channel !== 'all') {
          query += ` AND channel = ?`
          bindings.push(channel)
        }

        // Pagination logic
        if (after) {
          // 获取更新的内容 (Newer)
          query += ` AND id > ?`
          bindings.push(after)
          query += ` ORDER BY id ASC LIMIT ?`
        } else if (before) {
          // 获取更早的内容 (Older)
          query += ` AND id < ?`
          bindings.push(before)
          query += ` ORDER BY id DESC LIMIT ?`
        } else {
          // 最新的内容
          query += ` ORDER BY id DESC LIMIT ?`
        }
        
        bindings.push(limit)

        const { results } = await env.DB.prepare(query).bind(...bindings).all()
        
        // 如果是 after 查询，结果需要反转以保持时间倒序显示
        if (after) {
          results.reverse()
        }
        
        return new Response(JSON.stringify({ posts: results }), { headers: corsHeaders })
      }

      // API: 获取频道信息 (从 channel_meta 提取)
      // GET /api/channels
      if (url.pathname.startsWith('/api/channels')) {
        const { results } = await env.DB.prepare("SELECT channel, last_msg_id FROM channel_meta").all()
        
        // 补充 env.CHANNELS 中配置但未抓取过的频道
        const configuredChannels = (env.CHANNELS || '').split(',').map(c => c.trim()).filter(Boolean)
        const existingChannels = new Set(results.map(r => r.channel))
        
        const allChannels = [...results]
        configuredChannels.forEach(ch => {
          if (!existingChannels.has(ch)) {
            allChannels.push({ channel: ch, last_msg_id: null })
          }
        })

        return new Response(JSON.stringify({ channels: allChannels }), { headers: corsHeaders })
      }

      return new Response('Worker is running.', { status: 200 })
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
    }
  }
}
