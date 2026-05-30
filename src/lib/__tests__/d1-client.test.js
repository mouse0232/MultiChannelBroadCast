import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getChannels, getPosts, getPostById, searchPosts, callWorkerApi } from '../../lib/d1-client'
import * as d1Cache from '../../lib/d1-cache'

vi.mock('../../lib/d1-cache', () => ({
  handleCachedQuery: vi.fn((db, options, queryFunc, isVersioned, ctx) => {
    return queryFunc()
  }),
  invalidateVersionCache: vi.fn()
}))

describe('d1-client Module (Direct D1 Mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getChannels', () => {
    it('should throw if DB is missing', async () => {
      const mockAstro = { locals: { runtime: { env: {} } } }
      await expect(getChannels(mockAstro)).rejects.toThrow('D1 Database 未配置')
    })

    it('should return channels array from D1', async () => {
      const mockAstro = {
        locals: {
          runtime: {
            env: {
              DB: {
                prepare: vi.fn(() => ({
                  all: vi.fn(() => Promise.resolve({
                    results: [
                      { channel: 'tech', last_msg_id: '100', title: 'Tech News', avatar: 'url1' },
                      { channel: 'crypto', last_msg_id: '200', title: 'Crypto Daily', avatar: 'url2' }
                    ]
                  }))
                }))
              }
            }
          }
        }
      }

      const channels = await getChannels(mockAstro)
      expect(Array.isArray(channels)).toBe(true)
      expect(channels).toHaveLength(2)
      expect(channels[0].channel).toBe('tech')
      expect(channels[0].title).toBe('Tech News')
      expect(channels[1].channel).toBe('crypto')
    })
  })

  describe('getPosts', () => {
    it('should throw if DB is missing', async () => {
      const mockAstro = { locals: { runtime: { env: {} } } }
      await expect(getPosts(mockAstro)).rejects.toThrow('D1 Database 未配置')
    })

    it('should return posts array with default params', async () => {
      const mockAstro = {
        locals: {
          runtime: {
            env: {
              DB: {
                prepare: vi.fn(() => ({
                  bind: vi.fn(() => ({
                    all: vi.fn(() => Promise.resolve({ results: [] }))
                  }))
                }))
              }
            },
            ctx: { waitUntil: vi.fn() }
          }
        }
      }

      const posts = await getPosts(mockAstro)
      expect(Array.isArray(posts)).toBe(true)
    })

    it('should enforce max limit of 100', async () => {
      const mockAstro = {
        locals: {
          runtime: {
            env: {
              DB: {
                prepare: vi.fn(() => ({
                  bind: vi.fn(() => ({
                    all: vi.fn(() => Promise.resolve({ results: [] }))
                  }))
                }))
              }
            },
            ctx: { waitUntil: vi.fn() }
          }
        }
      }

      await getPosts(mockAstro, { limit: 500 })
      const callArgs = d1Cache.handleCachedQuery.mock.calls[0]
      const options = callArgs[1]
      expect(options.limit).toBe(100)
    })

    it('should pass ctx to handleCachedQuery', async () => {
      const mockCtx = { waitUntil: vi.fn() }
      const mockAstro = {
        locals: {
          runtime: {
            env: {
              DB: {
                prepare: vi.fn(() => ({
                  bind: vi.fn(() => ({
                    all: vi.fn(() => Promise.resolve({ results: [] }))
                  }))
                }))
              }
            },
            ctx: mockCtx
          }
        }
      }

      await getPosts(mockAstro)
      const callArgs = d1Cache.handleCachedQuery.mock.calls[0]
      expect(callArgs[4]).toBe(mockCtx)
    })
  })

  describe('getPostById', () => {
    it('should throw if DB is missing', async () => {
      const mockAstro = { locals: { runtime: { env: {} } } }
      await expect(getPostById(mockAstro, 'tech/123')).rejects.toThrow('D1 Database 未配置')
    })

    it('should throw on invalid ID format', async () => {
      const mockAstro = {
        locals: { runtime: { env: { DB: { prepare: vi.fn() } } } }
      }
      await expect(getPostById(mockAstro, '12345')).rejects.toThrow('Invalid post ID format')
    })

    it('should return post on valid ID', async () => {
      const mockAstro = {
        locals: {
          runtime: {
            env: {
              DB: {
                prepare: vi.fn(() => ({
                  bind: vi.fn(() => ({
                    first: vi.fn(() => Promise.resolve({
                      id: 'tech/123',
                      title: 'Test Post',
                      content: 'Content here',
                      published_at: '2024-01-01'
                    }))
                  }))
                }))
              }
            }
          }
        }
      }

      const post = await getPostById(mockAstro, 'tech/123')
      expect(post.id).toBe('tech/123')
      expect(post.title).toBe('Test Post')
    })
  })

  describe('searchPosts', () => {
    it('should return empty on short query', async () => {
      const mockAstro = { locals: { runtime: { env: { DB: { prepare: vi.fn() } } } } }
      const results = await searchPosts(mockAstro, 'a')
      expect(results).toEqual([])
    })

    it('should return empty on null query', async () => {
      const mockAstro = { locals: { runtime: { env: { DB: { prepare: vi.fn() } } } } }
      const results = await searchPosts(mockAstro, null)
      expect(results).toEqual([])
    })

    it('should search with title and content fields', async () => {
      const mockAstro = {
        locals: {
          runtime: {
            env: {
              DB: {
                prepare: vi.fn(() => ({
                  bind: vi.fn(() => ({
                    all: vi.fn(() => Promise.resolve({
                      results: [{ id: 'tech/1', title: 'Test', content: 'Found' }]
                    }))
                  }))
                }))
              }
            },
            ctx: { waitUntil: vi.fn() }
          }
        }
      }

      const results = await searchPosts(mockAstro, 'keyword', { channel: 'tech' })
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Test')
    })

    it('should pass ctx to handleCachedQuery', async () => {
      const mockCtx = { waitUntil: vi.fn() }
      const mockAstro = {
        locals: {
          runtime: {
            env: {
              DB: {
                prepare: vi.fn(() => ({
                  bind: vi.fn(() => ({
                    all: vi.fn(() => Promise.resolve({ results: [] }))
                  }))
                }))
              }
            },
            ctx: mockCtx
          }
        }
      }

      await searchPosts(mockAstro, 'keyword')
      const callArgs = d1Cache.handleCachedQuery.mock.calls[0]
      expect(callArgs[4]).toBe(mockCtx)
    })
  })

  describe('callWorkerApi (Fallback)', () => {
    it('should throw if MCB_CRAWLER binding is missing', async () => {
      await expect(callWorkerApi('/api/posts', {})).rejects.toThrow('MCB_CRAWLER Service Binding 未配置')
    })

    it('should call Worker fetch with correct headers', async () => {
      const mockResponse = new Response('ok', { status: 200 })
      const mockFetch = vi.fn(() => Promise.resolve(mockResponse))
      const env = { MCB_CRAWLER: { fetch: mockFetch } }

      await callWorkerApi('/api/channels', env, { headers: { 'X-API-Secret': 'test' } })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const requestArg = mockFetch.mock.calls[0][0]
      expect(requestArg).toBeInstanceOf(Request)
      expect(requestArg.headers.get('X-API-Secret')).toBe('test')
      expect(requestArg.headers.get('X-Request-Source')).toBe('service-binding')
    })
  })
})
