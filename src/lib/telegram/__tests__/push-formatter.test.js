import { describe, it, expect } from 'vitest'
import { formatPushMessage } from '../push-formatter.js'

describe('Push Formatter Module', () => {
  const sampleMessage = {
    id: '123',
    channel: 'test-channel',
    channelTitle: 'Test Channel',
    title: 'Test Title',
    content: '<p>This is test content</p>',
    datetime: '2026-05-06T10:00:00Z'
  }

  it('should format message with HTML parse mode', () => {
    const result = formatPushMessage(sampleMessage)
    expect(result.parse_mode).toBe('HTML')
  })

  it('should include title in formatted message', () => {
    const result = formatPushMessage(sampleMessage)
    expect(result.text).toContain('<b>Test Title</b>')
  })

  it('should include channel link', () => {
    const result = formatPushMessage(sampleMessage)
    expect(result.text).toContain('来源:')
    expect(result.text).toContain('https://t.me/test-channel')
    expect(result.text).toContain('Test Channel')
  })

  it('should include publish time', () => {
    const result = formatPushMessage(sampleMessage)
    expect(result.text).toContain('发布时间:')
  })

  it('should include view original link', () => {
    const result = formatPushMessage(sampleMessage)
    expect(result.text).toContain('查看原文')
  })

  it('should truncate long messages', () => {
    const longContent = '<p>' + 'A'.repeat(5000) + '</p>'
    const longMessage = {
      ...sampleMessage,
      content: longContent
    }
    const result = formatPushMessage(longMessage)
    expect(result.text.length).toBeLessThanOrEqual(4096)
  })

  it('should escape HTML special characters', () => {
    const messageWithSpecialChars = {
      ...sampleMessage,
      title: 'Test <script>alert("xss")</script>',
      content: '<p>Content with & special chars</p>'
    }
    const result = formatPushMessage(messageWithSpecialChars)
    expect(result.text).not.toContain('<script>')
    expect(result.text).toContain('&lt;script&gt;')
    expect(result.text).toContain('&amp;')
  })

  it('should handle message without title', () => {
    const messageWithoutTitle = {
      ...sampleMessage,
      title: ''
    }
    const result = formatPushMessage(messageWithoutTitle)
    expect(result.text).toBeDefined()
  })

  it('should generate summary from content', () => {
    const result = formatPushMessage(sampleMessage)
    expect(result.text).toContain('This is test content')
  })

  it('should use siteUrl in post link when provided', () => {
    const result = formatPushMessage(sampleMessage, {
      siteUrl: 'https://example.com'
    })
    expect(result.text).toContain('https://example.com/posts/test-channel/123')
  })
})
