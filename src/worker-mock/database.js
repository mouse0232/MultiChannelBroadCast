import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let db = null

/**
 * 初始化数据库
 * @returns {Database.Database} SQLite 数据库实例
 */
export function initializeDatabase() {
  if (db) {
    return db
  }

  const dataDir = process.env.DATA_DIR || join(__dirname, '../../data')
  
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  const dbPath = join(dataDir, 'app.db')
  console.log(`📦 Initializing database at: ${dbPath}`)
  
  db = new Database(dbPath)
  
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = 10000')
  db.pragma('foreign_keys = ON')

  createTables()
  createIndexes()

  console.log('✅ Database initialized successfully')
  return db
}

/**
 * 获取数据库实例
 * @returns {Database.Database}
 */
export function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.')
  }
  return db
}

/**
 * 关闭数据库连接
 */
export function closeDatabase() {
  if (db) {
    db.close()
    db = null
    console.log('📴 Database connection closed')
  }
}

/**
 * 创建数据表
 */
function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      published_at TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_meta (
      channel TEXT PRIMARY KEY,
      last_msg_id TEXT,
      title TEXT,
      avatar TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS push_logs (
      post_id TEXT PRIMARY KEY,
      tg_message_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  console.log('📋 Tables created: posts, channel_meta, push_logs')
}

/**
 * 创建索引优化查询性能
 */
function createIndexes() {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_channel ON posts(channel)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_channel_published ON posts(channel, published_at)`)
  
  console.log('📈 Indexes created')
}
