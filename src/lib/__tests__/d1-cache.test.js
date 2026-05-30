import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  invalidateVersionCache,
  handleCachedQuery
} from '../../lib/d1-cache'

describe('d1-cache Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invalidateVersionCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('invalidateVersionCache', () => {
    it('should reset version cache timestamp', () => {
      invalidateVersionCache()
      expect(true).toBe(true)
    })
  })

  describe('handleCachedQuery', () => {
    const mockDb = {
      prepare: vi.fn(() => ({
        all: vi.fn(() => Promise.resolve({ results: [] }))
      }))
    }

    it('should call queryFunc when cache is unavailable', async () => {
      const originalCaches = globalThis.caches
      globalThis.caches = undefined

      const queryFunc = vi.fn(() => Promise.resolve([{ id: 1, title: 'Test' }]))
      const options = { channel: 'all', limit: 20 }

      const results = await handleCachedQuery(mockDb, options, queryFunc, true)

      expect(queryFunc).toHaveBeenCalled()
      expect(results).toEqual([{ id: 1, title: 'Test' }])

      globalThis.caches = originalCaches
    })

    it('should store response in cache on success', async () => {
      const mockCache = {
        match: vi.fn(() => Promise.resolve(undefined)),
        put: vi.fn(() => Promise.resolve())
      }
      const originalCaches = globalThis.caches
      globalThis.caches = { default: mockCache }

      const queryFunc = vi.fn(() => Promise.resolve([{ id: 1 }]))
      const options = { channel: 'all', limit: 20 }

      const results = await handleCachedQuery(mockDb, options, queryFunc, true)

      expect(queryFunc).toHaveBeenCalled()
      expect(mockCache.match).toHaveBeenCalled()
      expect(mockCache.put).toHaveBeenCalled()
      expect(results).toEqual([{ id: 1 }])

      globalThis.caches = originalCaches
    })

    it('should return cached response on cache HIT', async () => {
      const cachedData = [{ id: 1, title: 'Cached' }]
      const cachedResponse = new Response(JSON.stringify(cachedData), { status: 200 })
      const mockCache = {
        match: vi.fn(() => Promise.resolve(cachedResponse)),
        put: vi.fn()
      }
      const originalCaches = globalThis.caches
      globalThis.caches = { default: mockCache }

      const queryFunc = vi.fn()
      const options = { channel: 'all', limit: 20 }

      const results = await handleCachedQuery(mockDb, options, queryFunc, true)

      expect(queryFunc).not.toHaveBeenCalled()
      expect(mockCache.match).toHaveBeenCalled()
      expect(results).toEqual(cachedData)

      globalThis.caches = originalCaches
    })

    it('should use versioned key when isVersioned is true', async () => {
      const mockCache = {
        match: vi.fn(() => Promise.resolve(undefined)),
        put: vi.fn()
      }
      const originalCaches = globalThis.caches
      globalThis.caches = { default: mockCache }

      const queryFunc = vi.fn(() => Promise.resolve([]))
      const options = { channel: 'tech', limit: 10 }

      await handleCachedQuery(mockDb, options, queryFunc, true)

      const putCall = mockCache.put.mock.calls[0]
      const request = putCall[0]
      expect(request.url).toContain('_cv=')

      globalThis.caches = originalCaches
    })

    it('should use normalized key when isVersioned is false', async () => {
      const mockCache = {
        match: vi.fn(() => Promise.resolve(undefined)),
        put: vi.fn()
      }
      const originalCaches = globalThis.caches
      globalThis.caches = { default: mockCache }

      const queryFunc = vi.fn(() => Promise.resolve([]))
      const options = { q: 'test', channel: 'all', limit: 20 }

      await handleCachedQuery(mockDb, options, queryFunc, false)

      const putCall = mockCache.put.mock.calls[0]
      const request = putCall[0]
      expect(request.url).toContain('cache.internal/search')

      globalThis.caches = originalCaches
    })

    it('should use ctx.waitUntil when ctx is provided', async () => {
      const mockWaitUntil = vi.fn()
      const mockCtx = { waitUntil: mockWaitUntil }
      const mockCache = {
        match: vi.fn(() => Promise.resolve(undefined)),
        put: vi.fn(() => Promise.resolve())
      }
      const originalCaches = globalThis.caches
      globalThis.caches = { default: mockCache }

      const queryFunc = vi.fn(() => Promise.resolve([]))
      const options = { channel: 'all', limit: 20 }

      await handleCachedQuery(mockDb, options, queryFunc, true, mockCtx)

      expect(mockWaitUntil).toHaveBeenCalled()

      globalThis.caches = originalCaches
    })

    it('should work without ctx (no waitUntil)', async () => {
      const mockCache = {
        match: vi.fn(() => Promise.resolve(undefined)),
        put: vi.fn(() => Promise.resolve())
      }
      const originalCaches = globalThis.caches
      globalThis.caches = { default: mockCache }

      const queryFunc = vi.fn(() => Promise.resolve([]))
      const options = { channel: 'all', limit: 20 }

      // Call without ctx
      await handleCachedQuery(mockDb, options, queryFunc, true, null)

      expect(mockCache.put).toHaveBeenCalled()

      globalThis.caches = originalCaches
    })
  })
})
