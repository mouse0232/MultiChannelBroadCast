import { $fetch } from 'ofetch'
import * as cheerio from 'cheerio'
import { KeywordFilter, RuleLoader, safeLoadFilterRules } from '../src/lib/KeywordFilter.js'

// ==========================================
// 1. Globals & Version Cache (Memory Strategy)
// ==========================================
// Worker 内存维护的版本号清单，用于加速列表缓存失效判断
let VERSION_CACHE = {
  ts: 0, // 上次从 D1 加载的时间戳
  versions: {} // { channel: "last_msg_id" }
}

// 从 D1 获取版本号并更新内存缓存 (带 60s 软过期时间)
async function getVersionMap(env) {
  const now = Date.now();
  // 如果缓存超过 60 秒，或者为空，则回源 D1
  if (!VERSION_CACHE.ts || (now - VERSION_CACHE.ts > 60000)) {
    try {
      const { results } = await env.DB.prepare(
        "SELECT channel, last_msg_id FROM channel_meta"
      ).all();

      const map = {};
      let maxId = 0; // 用于 __ALL__

      results.forEach(r => {
        const id = parseInt(r.last_msg_id || '0', 10);
        map[r.channel] = r.last_msg_id || '0';
        if (id > maxId) maxId = id;
      });

      // 生成全站聚合版本号
      map['__ALL__'] = String(maxId);

      VERSION_CACHE = { ts: now, versions: map };
      console.log(`[Cache] Version map refreshed from D1. Total channels: ${results.length}`);
    } catch (e) {
      console.error('[Cache] Failed to refresh version map:', e);
      // 如果失败，保持旧缓存不报错
    }
  }
  return VERSION_CACHE.versions;
}

// 清除内存版本缓存 (用于 POST 请求更新数据后)
function invalidateVersionCache() {
  VERSION_CACHE.ts = 0;
  console.log('[Cache] Version map invalidated by POST request.');
}

// ==========================================
// 2. Cache Key Utilities
// ==========================================
// 规范化 URL：排序参数、剔除干扰项，生成一致的缓存 Key
function normalizeUrl(urlObj, baseUrl) {
  const params = new URLSearchParams(urlObj.search);
  
  // 剔除干扰参数
  ['_t', '_bust', 'utm_source', 'utm_medium', 'ref'].forEach(k => params.delete(k));

  // 参数排序
  const sorted = new URLSearchParams([...params.entries()].sort());
  
  return `${baseUrl}?${sorted.toString()}`;
}

// 生成带版本号的虚拟 Key
function getVersionedKey(urlObj, versions) {
  const channel = urlObj.searchParams.get('channel') || 'all';
  // 提取该频道对应的版本号，如果没有则用 __ALL__
  // 注意：如果是聚合页 (channel=all)，直接使用 __ALL__
  // 如果是单频道，直接用该频道的版本
  const ver = channel === 'all' 
    ? (versions['__ALL__'] || '0') 
    : (versions[channel] || versions['__ALL__'] || '0');

  // 规范化 URL
  const normalized = normalizeUrl(urlObj, urlObj.origin + urlObj.pathname);
  
  // 虚拟 Key 结构：将版本号作为 query 参数拼入 URL，确保 URL 合法性
  const separator = normalized.includes('?') ? '&' : '?';
  return `${normalized}${separator}_cv=${ver}`;
}

// ==========================================
// 3. Cache API Helper
// ==========================================
async function handleCachedRequest(request, env, ctx, getResponseFunc, isVersioned = false) {
  // 1. 构建 Cache Key
  const url = new URL(request.url);
  let cacheKey;
  let versions = {};
  
  if (isVersioned) {
    versions = await getVersionMap(env);
    cacheKey = getVersionedKey(url, versions);
  } else {
    cacheKey = normalizeUrl(url, url.origin + url.pathname);
  }

  // 获取干净的日志路径，不包含 http://local 等内部构造的域名
  const cleanPath = url.pathname + url.search;

  const fakeRequest = new Request(cacheKey, { headers: { 'Accept': 'application/json' } });
  
  // 记录开始时间
  const startTime = Date.now();
  const method = request.method;

  // 2. 检查缓存 (仅在 Worker 环境下)
  if (typeof caches !== 'undefined' && caches.default) {
    const cachedResponse = await caches.default.match(fakeRequest);
    if (cachedResponse) {
      const elapsed = Date.now() - startTime;
      console.log(`[API Cache] HIT - ${method} ${cleanPath} (Time: ${elapsed}ms)`);
      return cachedResponse;
    }
    console.log(`[API Cache] MISS - ${method} ${cleanPath}`);
  }
  
  // 3. 执行原始逻辑
  const start = Date.now();
  const response = await getResponseFunc();
  const elapsed = Date.now() - start;
  
  console.log(`[API Cache] STORE - ${method} ${cleanPath} (Time: ${elapsed}ms)`);
  
  // 4. 存入缓存 (加门禁：仅缓存 GET 请求的成功响应)
  if (
    request.method === 'GET' &&
    response.ok &&
    typeof caches !== 'undefined' &&
    caches.default
  ) {
    try {
      const responseToCache = response.clone();
      // 异步存入，不阻塞返回
      ctx.waitUntil(caches.default.put(fakeRequest, responseToCache));
    } catch (e) {
      console.error('[API Cache] Store failed:', e.message);
    }
  }
  
  return response;
}
const filterRules = safeLoadFilterRules()
const ruleLoader = new RuleLoader(filterRules)

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
async function scheduled(event, env, ctx) {
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
    // 清理过期的帖子
    const deleteResult = await env.DB.prepare(
      "DELETE FROM posts WHERE published_at < datetime('now', '-1 year')"
    ).run()
    console.log(`🧹 Cleaned up old posts from D1: ${deleteResult.meta.changes || 0} rows deleted`)

    // 清理对应的推送日志（当帖子被删除后，日志也就没有意义了）
    // 注意：这不需要时间字段，只要帖子不在 posts 表里了，就清理日志
    const logDeleteResult = await env.DB.prepare(
      "DELETE FROM push_logs WHERE post_id NOT IN (SELECT id FROM posts)"
    ).run()
    console.log(`🧹 Cleaned up orphan push_logs: ${logDeleteResult.meta.changes || 0} rows deleted`)
  } catch (e) {
    console.error('D1 cleanup failed:', e)
  }
}

// ==========================================
// 2. Queue 消费者 (核心处理)
// ==========================================
async function queue(batch, env, ctx) {
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
  
  // 标记是否为首次运行 (如果数据库里没有该频道的记录，或者 last_msg_id 为空，则视为未初始化)
  const isFirstRun = !meta || !lastMsgId

  // 2. 执行抓取 (带防风控)
  const result = await fetchAndParse(channel, env, lastMsgId)
  const posts = result.posts
  const channelInfo = result.info
  
  if (posts.length === 0) {
    console.log(`ℹ️ No new posts for ${channel}`)
    // 注意：即使没有新帖子，我们也不能直接 return，因为还需要更新 channel_meta 中的 title 和 avatar
  }

  console.log(`📦 Parsed ${posts.length} posts for ${channel}`)

  // ==========================================
  // 关键词过滤 (带开关控制)
  // ==========================================
  const filterEnabled = env.FILTER_ENABLED === 'true'
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
  // ==========================================

  // 3. 区分新消息、更新消息、无变化消息 (使用过滤后的帖子)
  const postsToSave = []
  
  for (const post of filteredPosts) {
    const rawId = post.id.split('/').pop()
    if (lastMsgId && parseInt(rawId) <= parseInt(lastMsgId)) {
      // 旧消息：检查是否需要更新（通过时间比对）
      const existing = await env.DB.prepare("SELECT published_at FROM posts WHERE id = ?").bind(post.id).first()
      if (existing && post.datetime > existing.published_at) {
        // 消息被编辑过，需要更新
        postsToSave.push(post)
        console.log(`📝 Updated post: ${post.id} (edited)`)
        
        // 同步更新 Telegram 推送消息
        try {
          const botToken = env.TELEGRAM_BOT_TOKEN
          const channelId = env.TELEGRAM_PUSH_CHANNEL_ID
          
          if (botToken && channelId) {
             const log = await env.DB.prepare("SELECT tg_message_id FROM push_logs WHERE post_id = ?").bind(post.id).first()
             
              if (log?.tg_message_id) {
                 const imageUrl = extractFirstImage(post.content || '')
                 const { text } = await createPushContent(post, env)
                 
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
          }
        } catch (e) {
           console.warn(`TG Sync Edit failed for ${post.id}: ${e.message}`)
        }
      }
    } else {
      // 新消息
      postsToSave.push(post)
    }
  }

  // 4. 写入 D1 (仅保存新消息和更新的消息)
  if (postsToSave.length > 0) {
    const statements = postsToSave.map(post => {
      return env.DB.prepare(`
        INSERT OR REPLACE INTO posts (id, channel, title, content, published_at) 
        VALUES (?, ?, ?, ?, ?)
      `).bind(post.id, post.channel, post.title, post.content, post.datetime)
    })
    
    await env.DB.batch(statements)
  }

  // Update channel_meta (includes channel info now)
  // Telegram ID is usually channel/12345 format, we take 12345
  const rawIds = posts.map(p => p.id.split('/').pop() || p.id)
  const maxRawId = rawIds.length > 0 ? rawIds.reduce((a, b) => parseInt(a) > parseInt(b) ? a : b, '0') : (lastMsgId || '0')
  
  // If no posts, maxRawId might be 0, keep old lastMsgId if exists
  const finalMsgId = rawIds.length > 0 ? maxRawId : lastMsgId;

  await env.DB.prepare(
    "INSERT OR REPLACE INTO channel_meta (channel, last_msg_id, title, avatar) VALUES (?, ?, ?, ?)"
  ).bind(channel, finalMsgId, channelInfo.title, channelInfo.avatar).run()

  // 5. 触发推送（只推送新消息，不推送更新的消息）
  // 重要：如果是首次运行 (初始化数据)，只存入数据库，不进行推送，防止消息轰炸
  const newPosts = filteredPosts.filter(p => !lastMsgId || parseInt(p.id.split('/').pop()) > parseInt(lastMsgId))
  
  console.log(`📊 [${channel}] lastMsgId: ${lastMsgId}, newPosts: ${newPosts.length}, isFirstRun: ${isFirstRun}`)
  
  if (isFirstRun) {
    console.log(`ℹ️ First run for ${channel}, skipping push notifications.`)
  } else {
    if (newPosts.length > 0) {
      console.log(`🚀 Triggering push for ${newPosts.length} new posts...`)
      await triggerPush(newPosts, env)
    } else {
      console.log(`🔕 No new posts to push (all fetched posts are older or equal to lastMsgId)`)
    }
  }
  
  console.log(`✅ Finished channel: ${channel}`)
}

// ==========================================
// 辅助函数 (抓取与解析)
// ==========================================

// 处理媒体链接：
// 1. 图片 (<img>) -> 替换为 R2 缓存代理 (支持国内访问 + 持久化)
// 2. 视频/音频 (<video>, <audio>) -> 替换为本地 /static/ 代理 (支持 Range/拖动进度条)
function processMediaUrls(html, workerUrl) {
    if (!html) return html;

    // 图片代理前缀
    const imgProxyPrefix = workerUrl ? `${workerUrl}/img-proxy?url=` : 'https://wsrv.nl/?url=';

    // 1. 处理图片
    html = html.replace(
        /(<img[^>]*src=")(https?:\/\/cdn\d+\.telegram-cdn\.org\/file\/[^"]+)(")/gi,
        (match, prefix, url, suffix) => {
            return `${prefix}${imgProxyPrefix}${encodeURIComponent(url)}${suffix}`;
        }
    );

    // 2. 处理视频和音频 (Local Worker Proxy)
    html = html.replace(
        /(<(?:video|audio|source)[^>]*src=")(https?:\/\/(cdn\d+\.telegram-cdn\.org)(\/file\/[^"]+))(")/gi,
        (match, prefix, fullUrl, host, path, suffix) => {
            return `${prefix}/static/${host}${path}${suffix}`;
        }
    );

    return html;
}

async function fetchAndParse(channel, env, lastMsgId) {
  const hosts = (env.TELEGRAM_HOST || 't.me').split(',').map(h => h.trim()).filter(Boolean)
  const workerUrl = env.WORKER_URL || '' 
  
  // 接力模式：按顺序尝试 Host，直到成功
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
      // 继续循环尝试下一个
    }
  }

  throw new Error(`All hosts failed for channel: ${channel}`)
}

function parsePosts(html, channel, lastMsgId, workerUrl) {
  const $ = cheerio.load(html)
  const posts = []
  
  // Extract Channel Info from the page header
  const title = $('.tgme_page_title span').text().trim() || 
                $('.tgme_channel_info_header_title').text().trim() || 
                channel; // Fallback to username
  let avatar = $('.tgme_page_photo_image img').attr('src');
  
  // 代理头像（跳过 Data URL）
  if (avatar && !avatar.startsWith('data:')) {
    const imgProxyPrefix = workerUrl ? `${workerUrl}/img-proxy?url=` : 'https://wsrv.nl/?url=';
    if (!avatar.startsWith(imgProxyPrefix)) {
      avatar = `${imgProxyPrefix}${encodeURIComponent(avatar)}`;
    }
  }
  
  // 找到所有消息
  const items = $('.tgme_widget_message_wrap').toArray()
  
  // Telegram 列表页通常是按时间倒序 (最新的在前面)
  // 修改：不再跳过旧消息，全部返回以便检测编辑更新
  // 检查最近 50 条消息，识别是否有编辑更新
  
  for (const item of items) {
    const $item = $(item).find('.tgme_widget_message')
    const postAttr = $item.attr('data-post') // e.g. "channel/12345"
    if (!postAttr) continue
    
    const rawId = postAttr.split('/').pop()
    const id = postAttr // 使用 "channel/12345" 作为全局唯一 ID
    
    // 修改：还原原项目逻辑，拼接原始 HTML，利用 CSS 原生样式
    const replyEl = $item.find('.tgme_widget_message_reply');
    if (replyEl.length > 0) {
      replyEl.wrapInner('<small></small>').wrapInner('<blockquote></blockquote>');
    }
    
    // 获取正文：找到所有文本块，排除掉属于引用块的文本
    const contentEl = $item.find('.tgme_widget_message_text').filter((_, el) => {
       return !$(el).closest('.tgme_widget_message_reply').length;
    });
    
    let title = '';
    let contentHtml = '';
    
    // 拼接 HTML：先引用，后正文
    let finalHtml = '';
    if (replyEl.length > 0) {
       finalHtml += replyEl.html();
    }
    if (contentEl.length > 0) {
       finalHtml += contentEl.html();
    }

    if (finalHtml) {
      contentHtml = processMediaUrls(finalHtml, workerUrl);
      
      // 标题仅从正文提取
      let mainText = contentEl.text().trim(); // 获取正文文本
    // 标题智能提取优化：过滤干扰词
    let cleanText = mainText.replace(/(^|\s)([#@]\S+)/g, '').trim(); // 移除 #标签 和 @提及
    const match = cleanText.match(/^.*?(?=[。\n]|http\S)/g);
      if (match && match[0] && match[0].trim()) {
        title = match[0].trim();
      } else {
        title = mainText.replace(/\n/g, ' ').substring(0, 60);
      }
      // 兜底
      if (!title && !contentEl.length) title = 'New Post';
    }

    // 2. 提取附加的媒体元素（照片、视频、文件等 - 它们是 .tgme_widget_message_text 的兄弟节点）
    const mediaElements = []
    
    // 照片
    $item.find('.tgme_widget_message_photo_wrap').each((_, el) => {
      const style = $(el).attr('style') || ''
      // 匹配单引号或双引号: background-image:url('...') 或 background-image:url("...")
      const bgMatch = style.match(/background-image:url\(['"]?([^'")]+)['"]?\)/)
      if (bgMatch) {
        let imgUrl = bgMatch[1]
        // 代理图片
        const imgProxyPrefix = workerUrl ? `${workerUrl}/img-proxy?url=` : 'https://wsrv.nl/?url=';
        imgUrl = `${imgProxyPrefix}${encodeURIComponent(imgUrl)}`
        mediaElements.push(`<img src="${imgUrl}" alt="Photo" loading="lazy" />`)
      }
    })
    
    // 链接预览图片
    $item.find('.tgme_widget_message_link_image').each((_, el) => {
      const img = $(el).find('img')
      if (img.length > 0) {
        let imgUrl = img.attr('src')
        if (imgUrl) {
          const imgProxyPrefix = workerUrl ? `${workerUrl}/img-proxy?url=` : 'https://wsrv.nl/?url=';
          imgUrl = `${imgProxyPrefix}${encodeURIComponent(imgUrl)}`
          mediaElements.push(`<img src="${imgUrl}" alt="Link Preview" loading="lazy" />`)
        }
      }
    })
    
    // 视频
    $item.find('.tgme_widget_message_video_wrap').each((_, el) => {
      const video = $(el).find('video')
      if (video.length > 0) {
        const videoHtml = processMediaUrls($(el).html(), workerUrl)
        mediaElements.push(videoHtml)
      } else {
        // 没有 video 标签，用占位符
        const thumb = $(el).find('.tgme_widget_message_video_thumb img')
        if (thumb.length > 0) {
          const thumbUrl = thumb.attr('src')
          if (thumbUrl) {
            const imgProxyPrefix = workerUrl ? `${workerUrl}/img-proxy?url=` : 'https://wsrv.nl/?url=';
            const proxiedUrl = `${imgProxyPrefix}${encodeURIComponent(thumbUrl)}`
            mediaElements.push(`<img src="${proxiedUrl}" alt="Video Thumbnail" loading="lazy" />`)
          }
        }
      }
    })

    // 3. 合并文本和媒体
    if (mediaElements.length > 0) {
      const mediaHtml = mediaElements.join('')
      if (contentHtml) {
        contentHtml = mediaHtml + contentHtml
      } else {
        contentHtml = mediaHtml
        title = title || 'New Media Post'
      }
    } else if (!contentHtml) {
      // 纯媒体消息（无文本无识别到的媒体）
      contentHtml = processMediaUrls($item.html())
      title = title || 'New Media Post'
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
  
  return { posts, info: { title, avatar } }
}

// 构建推送文本内容 (供发送和编辑复用)
async function createPushContent(post, env) {
  const plainText = stripHtml(post.content || '')
  const channelName = post.channel || 'Unknown'
  
  // 固定标题
  const title = `📢 来自 @${channelName} 的新动态`
  const postUrl = `https://t.me/${post.id}`
  
  // 智能摘要
  let summary = plainText
  if (plainText.length > 150) {
    try {
      const aiSummary = await summarizeWithAI(plainText, env)
      if (aiSummary) {
         summary = aiSummary
      } else {
         summary = plainText.substring(0, 150) + '...'
      }
    } catch (e) {
      summary = plainText.substring(0, 150) + '...'
    }
  }

  const text = `${title}\n\n${escapeHtml(summary)}\n\n<a href="${postUrl}">阅读原文</a>`
  
  return { text }
}

// ==========================================
// 推送服务 (D1 修复版 & 图文优化)
// ==========================================
async function triggerPush(posts, env) {
  const pushEnabled = env.TELEGRAM_PUSH_ENABLED
  const botToken = env.TELEGRAM_BOT_TOKEN
  const channelId = env.TELEGRAM_PUSH_CHANNEL_ID

  // 1. 检查配置
  if (pushEnabled !== 'true') {
    console.warn(`🚫 Push SKIPPED: TELEGRAM_PUSH_ENABLED is '${pushEnabled}' (expected 'true')`)
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
    // 2. 检查 D1 推送日志 (防止重复推送)
    const log = await env.DB.prepare("SELECT tg_message_id FROM push_logs WHERE post_id = ?").bind(post.id).first()
    if (log?.tg_message_id) {
      skippedCount++
      continue
    }

    try {
      // 3. 发送消息 (尝试 HTML，失败则降级为纯文本)
      const imageUrl = extractFirstImage(post.content || '')
      const { text } = await createPushContent(post, env)
      
      let response
      
      try {
         // 第一次尝试：使用 HTML 模式
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
         // 如果是 400 错误 (通常是 HTML 格式问题)，尝试纯文本模式重试
         if (htmlErr.message.includes('400') || htmlErr.message.includes('Bad Request')) {
            console.warn(`⚠️ HTML push failed for ${post.id}, retrying as plain text...`)
            
            // 移除所有 HTML 标签
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
            throw htmlErr // 非 400 错误直接抛出
         }
      }
      
      // 4. 记录日志
      const tgMsgId = response.result?.message_id
      if (tgMsgId) {
        await env.DB.prepare("INSERT OR REPLACE INTO push_logs (post_id, tg_message_id) VALUES (?, ?)")
          .bind(post.id, tgMsgId).run()
        pushedCount++
        console.log(`📩 Pushed: ${post.id} (TG ID: ${tgMsgId})`)
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

// ==========================================
// 辅助工具 (用于推送)
// ==========================================

// 去除 HTML 标签获取纯文本
function stripHtml(html) {
  if (!html) return ''
  // 简单正则去标签，并处理常见实体
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n\s*\n/g, '\n') // 去除多余空行
    .trim()
}

// 使用 AI 生成摘要 (Workers AI)
async function summarizeWithAI(text, env) {
  if (!env.AI) return null
  try {
    const prompt = `请总结以下内容为一段不超过 150 字的摘要，提取关键信息，保持客观。格式要求：如果摘要中包含链接，必须确保链接前后与中文之间保留一个空格（例如：“...测试flight.apple.com/join/xxx 处获取...”），绝对禁止将链接与中文连在一起。：\n${text}`
    const response = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200
    })
    return response.response || null
  } catch (e) {
    console.error('Workers AI error:', e.message)
    return null
  }
}

// 提取第一张图片 URL
function extractFirstImage(html) {
  if (!html) return null
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return match ? match[1] : null
}

// HTML 转义 (Telegram parse_mode='HTML' 必需)
function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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
      // API: 重新抓取并更新旧帖子 (供修复抓取逻辑后使用)
      // GET /api/regrab?channel=all&limit=100
      if (url.pathname === '/api/regrab') {
        // Secret 验证：管理接口必须加锁
        const providedSecret = request.headers.get('X-API-Secret') || ''
        if (env.API_SECRET_KEY && providedSecret !== env.API_SECRET_KEY) {
          return new Response(JSON.stringify({ error: 'Unauthorized: Invalid Secret Key' }), { 
            status: 403, 
            headers: corsHeaders 
          })
        }

        const channelsStr = env.CHANNELS || ''
        const channels = channelsStr.split(',').map(c => c.trim()).filter(Boolean)
        const regrabLimit = parseInt(url.searchParams.get('limit') || '50')
        let successCount = 0
        let errors = []

        for (const ch of channels) {
          try {
            // 获取当前 lastMsgId
            const meta = await env.DB.prepare("SELECT last_msg_id FROM channel_meta WHERE channel = ?").bind(ch).first()
            const lastMsgId = meta?.last_msg_id
            
            // 抓取该频道最近 regrabLimit 条消息（从最新往前）
            // 通过临时设置 lastMsgId 为 0 来实现全量抓取
            const result = await fetchAndParse(ch, env, '0')
            const posts = result.posts.slice(0, regrabLimit)
            const channelInfo = result.info
            
            if (posts.length === 0) {
              console.log(`ℹ️ No posts to regrab for ${ch}`)
              continue
            }

            // 更新帖子（INSERT OR REPLACE）
            const statements = posts.map(post => {
              return env.DB.prepare(`
                INSERT OR REPLACE INTO posts (id, channel, title, content, published_at) 
                VALUES (?, ?, ?, ?, ?)
              `).bind(post.id, post.channel, post.title, post.content, post.datetime)
            })

            // 不更新 lastMsgId，保持原有进度
            statements.push(
              env.DB.prepare(
                "INSERT OR REPLACE INTO channel_meta (channel, last_msg_id, title, avatar) VALUES (?, ?, ?, ?)"
              ).bind(ch, lastMsgId || '0', channelInfo.title, channelInfo.avatar)
            )

            await env.DB.batch(statements)
            successCount++
            await randomDelay(500, 1500)
          } catch (e) {
            errors.push(`Channel ${ch} Error: ${e.message}`)
          }
        }

        // 数据已更新，立即清除版本号缓存，让下次请求能拿到最新状态
        invalidateVersionCache();

        return new Response(JSON.stringify({
          status: 'ok',
          message: `Regrab complete for ${successCount} channels`,
          successCount,
          errors: errors.length > 0 ? errors : undefined
        }), { headers: corsHeaders, status: 200 })
      }

      // API: 初始化并测试推送 (供首次部署后手动触发)
      // GET /api/init
      if (url.pathname === '/api/init') {
        // Secret 验证：管理接口必须加锁
        const providedSecret = request.headers.get('X-API-Secret') || ''
        if (env.API_SECRET_KEY && providedSecret !== env.API_SECRET_KEY) {
          return new Response(JSON.stringify({ error: 'Unauthorized: Invalid Secret Key' }), { 
            status: 403, 
            headers: corsHeaders 
          })
        }

        const channelsStr = env.CHANNELS || ''
        const channels = channelsStr.split(',').map(c => c.trim()).filter(Boolean)
        let successCount = 0
        let errors = []

        // 1. 发送测试消息
        try {
          if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_PUSH_CHANNEL_ID) {
            await $fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              body: {
                chat_id: env.TELEGRAM_PUSH_CHANNEL_ID,
                text: `✅ <b>系统通知</b>\n\nMulti-Channel Broadcast 初始化成功！\n当前已配置 ${channels.length} 个频道，后续将按设定频率推送。`,
                parse_mode: 'HTML'
              }
            })
          }
        } catch (e) {
          errors.push(`Telegram Message Error: ${e.message}`)
        }

        // 2. 遍历抓取所有频道
        for (const ch of channels) {
          try {
            // 强制重新抓取并更新元数据
            await processSingleChannel({ channel: ch }, env)
            successCount++
            // 稍微停顿，防止被 Telegram 风控
            await randomDelay(500, 1500)
          } catch (e) {
            errors.push(`Channel ${ch} Error: ${e.message}`)
          }
        }

        // 数据已初始化，立即清除版本号缓存
        invalidateVersionCache();

        return new Response(JSON.stringify({
          status: 'ok',
          message: 'Init complete. Refresh your website.',
          totalChannels: channels.length,
          successCount,
          errors: errors.length > 0 ? errors : undefined
        }), { headers: corsHeaders, status: 200 })
      }

      // ==========================================
      // 图片代理逻辑 (R2 持久化缓存 Demo)
      // URL 格式: /img-proxy?url=https://cdnX.telesco.pe/file/...
      // ==========================================
      if (url.pathname === '/img-proxy') {
        try {
          const targetUrl = url.searchParams.get('url');
          if (!targetUrl) return new Response('Missing url parameter', { status: 400, headers: corsHeaders });

          // 严格安全校验：防止被当作开放代理 (Open Proxy)
          try {
            const parsedUrl = new URL(targetUrl);
            // 仅允许代理 Telegram 官方 CDN 域名 (防止恶意滥用)
            const isTelegram = parsedUrl.hostname === 'telesco.pe' || parsedUrl.hostname.endsWith('.telesco.pe');
            if (!isTelegram) {
              return new Response('Forbidden: Only Telegram CDN images are allowed', { status: 403, headers: corsHeaders });
            }
          } catch (e) {
            return new Response('Invalid URL format', { status: 400, headers: corsHeaders });
          }

          // 生成 R2 Key (SHA-256 哈希保证唯一且安全)
          const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(targetUrl));
          const key = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

          // 1. 尝试从 R2 读取
          const cached = await env.IMG_CACHE.get(key);
          if (cached) {
            const headers = new Headers({
              'Content-Type': cached.httpMetadata?.contentType || 'image/jpeg',
              'Cache-Control': 'public, max-age=31536000',
              'Access-Control-Allow-Origin': '*'
            });
            return new Response(cached.body, { headers });
          }

          // 2. 从 Telegram 源站拉取
          const tgRes = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://t.me/',
              'Accept': 'image/*,*/*;q=0.8'
            }
          });

          if (!tgRes.ok) {
            // 降级链：如果源站 404 或 403，返回 302 跳转，让浏览器尝试直连原图
            if (tgRes.status === 404 || tgRes.status === 403) {
               return new Response(null, { status: 302, headers: { 'Location': targetUrl } });
            }
            return new Response('Source image error: ' + tgRes.status, { status: tgRes.status, headers: corsHeaders });
          }

          const body = await tgRes.arrayBuffer();
          const contentType = tgRes.headers.get('Content-Type') || 'image/jpeg';

          // 3. 写入 R2 持久化
          await env.IMG_CACHE.put(key, body, {
            httpMetadata: { contentType },
            customMetadata: { sourceUrl: targetUrl }
          });

          // 4. 返回给用户
          const resHeaders = new Headers({
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000',
            'Access-Control-Allow-Origin': '*'
          });
          return new Response(body, { headers: resHeaders });
        } catch (e) {
          // 降级链：如果请求本身报错，也尝试 302 跳转
          return new Response(null, { status: 302, headers: { 'Location': targetUrl } });
        }
      }

      // ==========================================
      // 视频/音频代理逻辑 (支持 Range/Seek)
      // URL 格式: /static/cdnX.telegram-cdn.org/file/...
      // ==========================================
      if (url.pathname.startsWith('/static/')) {
        // 提取目标路径 (去掉 /static/)
        // 例如: cdn4.telegram-cdn.org/file/xyz.mp4
        const targetPath = decodeURIComponent(url.pathname.substring('/static/'.length));
        
        const firstSlash = targetPath.indexOf('/');
        if (firstSlash === -1) {
          return new Response('Invalid Path', { status: 400 });
        }

        const targetHost = targetPath.substring(0, firstSlash);
        const targetFile = targetPath.substring(firstSlash);
        const targetUrl = `https://${targetHost}${targetFile}`;

        // 准备请求头 (透传 Range)
        const fetchHeaders = new Headers();
        if (request.headers.has('range')) {
          fetchHeaders.set('range', request.headers.get('range'));
        }
        // 转发 User-Agent 等头，模拟正常请求
        if (request.headers.has('user-agent')) {
          fetchHeaders.set('user-agent', request.headers.get('user-agent'));
        }

        const response = await fetch(targetUrl, { headers: fetchHeaders });

        // 转发响应头
        const responseHeaders = new Headers();
        if (response.status === 206) {
        responseHeaders.set('content-range', response.headers.get('content-range'));
        responseHeaders.set('accept-ranges', 'bytes');
        // 添加 CORS 支持 (允许跨域加载媒体)
        responseHeaders。set('Access-Control-Allow-Origin', '*');
      }
        if (response.headers.has('content-type')) {
          responseHeaders.set('content-type', response.headers.get('content-type'));
        }
        if (response.headers.has('content-length')) {
          responseHeaders.set('content-length', response.headers.get('content-length'));
        }
        // 添加 CORS 支持
        responseHeaders.set('Access-Control-Allow-Origin', '*');

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      }

      // API: 获取单个帖子
      // 策略：基于 URL 的 TTL 缓存 (Short TTL Strategy)
      if (url.pathname.startsWith('/api/post/')) {
        // Secret 验证 (移到缓存之前，防止绕过)
        const providedSecret = request.headers.get('X-API-Secret') || ''
        if (env.API_SECRET_KEY && providedSecret !== env.API_SECRET_KEY) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
            status: 403, 
            headers: corsHeaders 
          })
        }

        return handleCachedRequest(request, env, ctx, async () => {
          const rawId = decodeURIComponent(url.pathname.split('/api/post/').pop())
          
          // 校验 ID 格式：必须包含斜杠 (channel/id)
          // 移除了旧版 LIKE 模糊查询，避免全表扫描导致 D1 额度耗尽
          if (!rawId.includes('/')) {
            return new Response(JSON.stringify({ error: 'Invalid post ID format. Expected: channel/id' }), { status: 400, headers: corsHeaders })
          }

          // 完整 ID 精确查询
          const results = await env.DB.prepare(
            "SELECT * FROM posts WHERE id = ? LIMIT 1"
          ).bind(rawId).all()
          
          if (results.length === 0 || results.results.length === 0) {
            return new Response(JSON.stringify({ error: 'Post not found' }), { status: 404, headers: corsHeaders })
          }
          
          return new Response(JSON.stringify({ post: results.results[0] }), { 
            headers: { 
              ...corsHeaders, 
              'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600' 
            } 
          })
        }, false); // false = URL based TTL key
      }

      // API: 搜索帖子
      // 策略：基于 URL 的 TTL 缓存 (Short TTL Strategy)
      if (url.pathname === '/api/posts/search') {
        // Secret 验证 (移到缓存之前，防止绕过)
        const providedSecret = request.headers.get('X-API-Secret') || ''
        if (env.API_SECRET_KEY && providedSecret !== env.API_SECRET_KEY) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
            status: 403, 
            headers: corsHeaders 
          })
        }

        return handleCachedRequest(request, env, ctx, async () => {
          // 添加增强调试日志
          const loggingEnabled = env.API_LOGGING_ENABLED === 'true';
          if (loggingEnabled) {
            const realUserIP = request.headers.get('x-real-user-ip') || request.headers.get('cf-connecting-ip');
            
            console.log('API Debug:', {
              timestamp: new Date().toISOString(),
              path: url.pathname,
              method: request.method,
              realUserIP: realUserIP,
              params: {
                q: url.searchParams.get('q'),
                channel: url.searchParams.get('channel'),
                limit: url.searchParams.get('limit')
              },
              headers: {
                userAgent: request.headers.get('user-agent'),
                referer: request.headers.get('referer'),
                origin: request.headers.get('origin'),
                cfConnectingIP: request.headers.get('cf-connecting-ip'),
                cfRay: request.headers.get('cf-ray'),
                accept: request.headers.get('accept')
              }
            });
          }
          
          const q = url.searchParams.get('q')
          const channel = url.searchParams.get('channel') || 'all'
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100)
          
          if (!q) {
            return new Response(JSON.stringify({ posts: [] }), { headers: corsHeaders })
          }

          let query = `SELECT * FROM posts WHERE (title LIKE ? OR content LIKE ?)`
          const bindings = [`%${q}%`, `%${q}%`]

          if (channel !== 'all') {
            query += ` AND channel = ?`
            bindings。push(channel)
          }

          query += ` ORDER BY id DESC LIMIT ?`
          bindings.push(limit)

          const { results } = await env.DB.prepare(query).bind(...bindings).all()
          
          return new Response(JSON.stringify({ posts: results }), { 
            headers: { 
              ...corsHeaders, 
              'Cache-Control': 'public, max-age=600, stale-while-revalidate=1200' 
            } 
          })
        }, false); // false = URL based TTL key
      }

      // API: 获取帖子列表
      // 策略：使用版本号 Key (Version Key) 以支持实时失效
      if (url。pathname.startsWith('/api/posts') && !url.pathname.includes('/search')) {
        // Secret 验证 (移到缓存之前，防止绕过)
        const providedSecret = request.headers.get('X-API-Secret') || ''
        if (env.API_SECRET_KEY && providedSecret !== env.API_SECRET_KEY) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
            status: 403, 
            headers: corsHeaders 
          })
        }

        return handleCachedRequest(request, env, ctx, async () => {
          // 添加增强调试日志 (仅 MISS 时可见，HIT 时不会执行)
          const loggingEnabled = env.API_LOGGING_ENABLED === 'true';
          if (loggingEnabled) {
            const realUserIP = request.headers.get('x-real-user-ip') || request.headers.get('cf-connecting-ip');
            
            console。log('API Debug:', {
              timestamp: new Date().toISOString(),
              path: url.pathname,
              method: request.method,
              realUserIP: realUserIP,
              params: {
                channel: url.searchParams.get('channel'),
                limit: url.searchParams.get('limit'),
                before: url.searchParams.get('before'),
                after: url.searchParams.get('after')
              },
              headers: {
                userAgent: request.headers.get('user-agent'),
                referer: request.headers.get('referer'),
                origin: request.headers.get('origin'),
                cfConnectingIP: request.headers.get('cf-connecting-ip'),
                cfRay: request.headers.get('cf-ray'),
                accept: request.headers.get('accept')
              }
            });
          }
          
          const channel = url.searchParams.get('channel') || 'all'
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100)
          const before = url.searchParams.get('before')
          const after = url.searchParams.get('after')
          
          let query = `SELECT * FROM posts WHERE 1=1`
          const bindings = []

          if (channel !== 'all') {
            query += ` AND channel = ?`
            bindings.push(channel)
          }

          // Pagination logic using published_at (datetime) instead of id
          if (after) {
            // 获取更新的内容 (Newer)
            query += ` AND published_at > ?`
            bindings.push(after)
            query += ` ORDER BY published_at ASC LIMIT ?`
          } else if (before) {
            // 获取更早的内容 (Older)
            query += ` AND published_at < ?`
            bindings.push(before)
            query += ` ORDER BY published_at DESC LIMIT ?`
          } else {
            // 最新的内容
            query += ` ORDER BY published_at DESC LIMIT ?`
          }
          
          bindings.push(limit)

          const { results } = await env.DB.prepare(query).bind(...bindings).all()
          
          // 如果是 after 查询，结果需要反转以保持时间倒序显示
          if (after) {
            results.reverse()
          }
          
          return new Response(JSON.stringify({ posts: results }), { 
            headers: { 
              ...corsHeaders, 
              'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' 
            } 
          })
        }, true); // true = Versioned Key
      }

      // API: 获取频道信息 (从 channel_meta 提取)
      // 策略：使用版本号 Key (Version Key) 以支持实时失效
      if (url.pathname.startsWith('/api/channels')) {
        // Secret 验证 (移到缓存之前，防止绕过)
        const providedSecret = request.headers.get('X-API-Secret') || ''
        if (env.API_SECRET_KEY && providedSecret !== env.API_SECRET_KEY) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
            status: 403, 
            headers: corsHeaders 
          })
        }

        return handleCachedRequest(request, env, ctx, async () => {

          const { results } = await env.DB.prepare("SELECT channel, last_msg_id, title, avatar FROM channel_meta").all()
          
          // 补充 env.CHANNELS 中配置但未抓取过的频道
          const configuredChannels = (env.CHANNELS || '').split(',').map(c => c.trim()).filter(Boolean)
          const existingChannels = new Set(results.map(r => r.channel))
          
          const allChannels = [...results]
          configuredChannels.forEach(ch => {
            if (!existingChannels.has(ch)) {
              allChannels.push({ channel: ch, last_msg_id: null, title: ch, avatar: null })
            }
          })

          return new Response(JSON.stringify({ channels: allChannels }), { 
            headers: { 
              ...corsHeaders, 
              'Cache-Control': 'public, max-age=7200, stale-while-revalidate=7200' 
            } 
          })
        }, true); // true = Versioned Key
      }

      return new Response('Worker is running.', { status: 200 })
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
    }
  },
  scheduled,
  queue
}
