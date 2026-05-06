import { describe, it, expect, beforeEach } from 'vitest'
import { hasPushed, markAsPushed, getPushedCount, clearPushedMessages } from '../push-dedup.js'

describe('Push Dedup Module', () => {
  beforeEach(() => {
    clearPushedMessages()
  })

  it('should return false for new message ID', () => {
    expect(hasPushed('channel:123')).toBe(false)
  })

  it('should return true after marking as pushed', () => {
    const messageId = 'channel:123'
    markAsPushed(messageId)
    expect(hasPushed(messageId)).toBe(true)
  })

  it('should track multiple message IDs', () => {
    markAsPushed('channel:1')
    markAsPushed('channel:2')
    markAsPushed('channel:3')

    expect(hasPushed('channel:1')).toBe(true)
    expect(hasPushed('channel:2')).toBe(true)
    expect(hasPushed('channel:3')).toBe(true)
    expect(hasPushed('channel:4')).toBe(false)
  })

  it('should return correct count', () => {
    markAsPushed('channel:1')
    markAsPushed('channel:2')
    expect(getPushedCount()).toBe(2)
  })

  it('should clear all messages', () => {
    markAsPushed('channel:1')
    markAsPushed('channel:2')
    clearPushedMessages()
    expect(getPushedCount()).toBe(0)
    expect(hasPushed('channel:1')).toBe(false)
  })
})
