import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the env module
vi.mock('../../env.js', () => ({
  getEnv: (importMetaEnv, Astro, key) => {
    if (importMetaEnv && importMetaEnv[key]) return importMetaEnv[key]
    return undefined
  }
}))

describe('Push Config Module', () => {
  let getPushConfig

  beforeEach(async () => {
    // Clear module cache to get fresh imports
    vi.resetModules()
    const mod = await import('../push-config.js')
    getPushConfig = mod.getPushConfig
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return disabled config when TELEGRAM_PUSH_ENABLED is not set', () => {
    const config = getPushConfig({}, null)
    expect(config.enabled).toBe(false)
    expect(config.isValid).toBe(false)
  })

  it('should return disabled config when TELEGRAM_PUSH_ENABLED is false', () => {
    const env = { TELEGRAM_PUSH_ENABLED: 'false' }
    const config = getPushConfig(env, null)
    expect(config.enabled).toBe(false)
    expect(config.isValid).toBe(false)
  })

  it('should return enabled config when all variables are set', () => {
    const env = {
      TELEGRAM_PUSH_ENABLED: 'true',
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_PUSH_CHANNEL_ID: '@test-channel'
    }
    const config = getPushConfig(env, null)
    expect(config.enabled).toBe(true)
    expect(config.botToken).toBe('test-token')
    expect(config.channelId).toBe('@test-channel')
    expect(config.isValid).toBe(true)
  })

  it('should return invalid when bot token is missing', () => {
    const env = {
      TELEGRAM_PUSH_ENABLED: 'true',
      TELEGRAM_PUSH_CHANNEL_ID: '@test-channel'
    }
    const config = getPushConfig(env, null)
    expect(config.enabled).toBe(true)
    expect(config.isValid).toBe(false)
  })

  it('should return invalid when channel ID is missing', () => {
    const env = {
      TELEGRAM_PUSH_ENABLED: 'true',
      TELEGRAM_BOT_TOKEN: 'test-token'
    }
    const config = getPushConfig(env, null)
    expect(config.enabled).toBe(true)
    expect(config.isValid).toBe(false)
  })
})
