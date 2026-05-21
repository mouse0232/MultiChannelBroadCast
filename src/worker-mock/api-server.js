import express from 'express'
import { $fetch } from 'ofetch'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { randomDelay } from './grabber.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

let db = null
let app = null
let server = null

async function getDatabase() {
  if (!db) {
    const { initializeDatabase } = await import('./database.js')
    db = initializeDatabase()
  }
  return db
}

export async function startAPIServer() {
  app = express()
  const database = await getDatabase()
  
  const port = parseInt(process.env.PORT || '4321')
  const host = process.env.HOST || '0.0.0.0'

  app.use(express.json())
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
    if (req.method === 'OPTIONS') return res.status(200).end()
    next()
  })

  // Health check
  app.get('/api/health', (req, res) => {
    try {
      database.prepare("SELECT 1").get()
      res.json({ status: 'healthy', checks: { database: 'ok' } })
    } catch (e) {
      res.status(503).json({ status: 'unhealthy', checks: { database: 'error' } })
    }
  })

  // Get channels
  app.get('/api/channels', (req, res) => {
    try {
      const results = database.prepare("SELECT channel, last_msg_id, title, avatar FROM channel_meta").all()
      const configuredChannels = (process.env.CHANNELS || '').split(',').map(c => c.trim()).filter(Boolean)
      const existingChannels = new Set(results.map(r => r.channel))
      const allChannels = [...results]
      configuredChannels.forEach(ch => {
        if (!existingChannels.has(ch)) {
          allChannels.push({ channel: ch, last_msg_id: null, title: ch, avatar: null })
        }
      })
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
      res.json({ channels: allChannels })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // Get posts
  app.get('/api/posts', (req, res) => {
    try {
      const channel = req.query.channel || 'all'
      const limit = Math.min(parseInt(req.query.limit || '20'), 100)
      const before = req.query.before
      const after = req.query.after
      
      let query = `SELECT * FROM posts WHERE 1=1`
      const bindings = []

      if (channel !== 'all') {
        query += ` AND channel = ?`
        bindings.push(channel)
      }

      if (after) {
        query += ` AND published_at > ?`
        bindings.push(after)
        query += ` ORDER BY published_at ASC LIMIT ?`
      } else if (before) {
        query += ` AND published_at < ?`
        bindings.push(before)
        query += ` ORDER BY published_at DESC LIMIT ?`
      } else {
        query += ` ORDER BY published_at DESC LIMIT ?`
      }
      
      bindings.push(limit)
      const results = database.prepare(query).all(...bindings)
      
      if (after) results.reverse()
      
      res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600')
      res.json({ posts: results })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // Search posts
  app.get('/api/posts/search', (req, res) => {
    try {
      const q = req.query.q
      const channel = req.query.channel || 'all'
      const limit = Math.min(parseInt(req.query.limit || '20'), 100)
      
      if (!q) return res.json({ posts: [] })

      let query = `SELECT * FROM posts WHERE (title LIKE ? OR content LIKE ?)`
      const bindings = [`%${q}%`, `%${q}%`]

      if (channel !== 'all') {
        query += ` AND channel = ?`
        bindings.push(channel)
      }

      query += ` ORDER BY id DESC LIMIT ?`
      bindings.push(limit)

      const results = database.prepare(query).all(...bindings)
      
      res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600')
      res.json({ posts: results })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // Get single post
  app.get('/api/post/:id', (req, res) => {
    try {
      const rawId = decodeURIComponent(req.params.id)
      if (!rawId.includes('/')) {
        return res.status(400).json({ error: 'Invalid post ID format. Expected: channel/id' })
      }

      const result = database.prepare("SELECT * FROM posts WHERE id = ? LIMIT 1").get(rawId)
      
      if (!result) {
        return res.status(404).json({ error: 'Post not found' })
      }
      
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
      res.json({ post: result })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  console.log(`🌐 API server running on http://${host}:${port}`)
  
  await new Promise((resolve) => {
    server = app.listen(port, host, () => {
      resolve()
    })
  })

  return server
}

export async function stopAPIServer() {
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve)
    })
    console.log('📴 API server stopped')
  }
}
