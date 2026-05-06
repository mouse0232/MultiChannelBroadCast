import { $fetch } from 'ofetch'

// Telegram Bot API 基础 URL
const TELEGRAM_API_BASE = 'https://api.telegram.org'

// 请求超时时间(毫秒)
const REQUEST_TIMEOUT = 10000

/**
 * 发送消息到 Telegram 频道
 * @param {string} botToken - Bot Token
 * @param {string} channelId - 目标频道 ID
 * @param {object} message - 消息对象
 * @param {string} message.text - 消息文本(支持 HTML)
 * @param {string} message.parse_mode - 解析模式(HTML/Markdown)
 * @param {object} [message.link_preview_options] - 链接预览选项
 * @returns {Promise<{success: boolean, error?: string}>} 发送结果
 */
export async function sendTelegramMessage(botToken, channelId, message) {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`

  try {
    const response = await $fetch(url, {
      method: 'POST',
      timeout: REQUEST_TIMEOUT,
      body: {
        chat_id: channelId,
        text: message.text,
        parse_mode: message.parse_mode,
        link_preview_options: message.link_preview_options,
      },
    })

    if (response.ok) {
      return { success: true }
    } else {
      return {
        success: false,
        error: `API returned status: ${response.status}`,
      }
    }
  } catch (error) {
    // 处理不同类型的错误
    if (error.response) {
      // HTTP 错误响应
      const status = error.response.status
      if (status === 401 || status === 403) {
        return {
          success: false,
          error: `Invalid bot token or forbidden (HTTP ${status})`,
        }
      }
      if (status === 429) {
        return {
          success: false,
          error: 'Rate limited by Telegram API',
        }
      }
      return {
        success: false,
        error: `HTTP error: ${status}`,
      }
    }

    // 网络错误或超时
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return {
        success: false,
        error: 'Request timeout',
      }
    }

    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}
