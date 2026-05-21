#!/usr/bin/env node

/**
 * Docker Mock 模块测试脚本
 * 用于测试各个模块的基本功能
 */

import { initializeDatabase, getDB, closeDatabase } from './src/worker-mock/database.js'
import { startAPIServer, stopAPIServer } from './src/worker-mock/api-server.js'
import { startQueueWorker, closeQueueWorker } from './src/worker-mock/queue-worker.js'
import { startScheduler, stopScheduler } from './src/worker-mock/scheduler.js'
import { $fetch } from 'ofetch'

console.log('🧪 开始测试 Docker Mock 模块...\n')

// 设置环境变量
process.env.DOCKER = 'true'
process.env.DATA_DIR = './test-data'
process.env.CHANNELS = 'test_channel'
process.env.API_SECRET_KEY = 'test_secret'
process.env.QUEUE_MEMORY_MODE = 'true'

async function testDatabase() {
  console.log('📦 测试 1: 数据库初始化')
  
  try {
    const db = initializeDatabase()
    console.log('✅ 数据库初始化成功')
    
    // 测试插入数据
    db.prepare(`
      INSERT OR REPLACE INTO posts (id, channel, title, content, published_at) 
      VALUES (?, ?, ?, ?, ?)
    `).run('test/1', 'test_channel', '测试标题', '测试内容', new Date().toISOString())
    console.log('✅ 数据插入成功')
    
    // 测试查询数据
    const result = db.prepare('SELECT * FROM posts WHERE id = ?').get('test/1')
    if (result && result.title === '测试标题') {
      console.log('✅ 数据查询成功:', result)
    } else {
      console.log('❌ 数据查询失败')
      return false
    }
    
    // 测试频道元数据
    db.prepare(`
      INSERT OR REPLACE INTO channel_meta (channel, last_msg_id, title, avatar) 
      VALUES (?, ?, ?, ?)
    `).run('test_channel', '1', '测试频道', 'https://example.com/avatar.png')
    console.log('✅ 频道元数据插入成功')
    
    const channels = db.prepare('SELECT * FROM channel_meta').all()
    console.log('✅ 频道查询成功:', channels)
    
    return true
  } catch (error) {
    console.log('❌ 数据库测试失败:', error.message)
    return false
  }
}

async function testAPI() {
  console.log('\n🌐 测试 2: API 服务器')
  
  try {
    await startAPIServer()
    console.log('✅ API 服务器启动成功')
    
    // 测试健康检查接口
    const healthUrl = 'http://localhost:4321/api/health'
    const health = await $fetch(healthUrl)
    console.log('✅ 健康检查接口:', health)
    
    // 测试频道列表接口
    const channelsUrl = 'http://localhost:4321/api/channels'
    const channels = await $fetch(channelsUrl)
    console.log('✅ 频道列表接口:', channels)
    
    // 测试帖子列表接口
    const postsUrl = 'http://localhost:4321/api/posts?limit=10'
    const posts = await $fetch(postsUrl)
    console.log('✅ 帖子列表接口:', posts)
    
    await stopAPIServer()
    console.log('✅ API 服务器关闭成功')
    
    return true
  } catch (error) {
    console.log('❌ API 测试失败:', error.message)
    return false
  }
}

async function testQueue() {
  console.log('\n📨 测试 3: 任务队列')
  
  try {
    await startQueueWorker()
    console.log('✅ 队列工作器启动成功')
    
    // 等待一下让队列初始化
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    await closeQueueWorker()
    console.log('✅ 队列工作器关闭成功')
    
    return true
  } catch (error) {
    console.log('❌ 队列测试失败:', error.message)
    return false
  }
}

async function testScheduler() {
  console.log('\n⏰ 测试 4: 定时调度器')
  
  try {
    // 使用一次性调度进行测试（1 分钟后执行）
    process.env.CRON_SCHEDULE = '*/1 * * * *'
    await startScheduler()
    console.log('✅ 调度器启动成功')
    
    // 立即停止
    stopScheduler()
    console.log('✅ 调度器停止成功')
    
    return true
  } catch (error) {
    console.log('❌ 调度器测试失败:', error.message)
    return false
  }
}

async function runTests() {
  const results = {
    database: false,
    api: false,
    queue: false,
    scheduler: false
  }
  
  // 按顺序执行测试
  results.database = await testDatabase()
  
  if (results.database) {
    results.api = await testAPI()
  }
  
  if (results.api) {
    results.queue = await testQueue()
    results.scheduler = await testScheduler()
  }
  
  // 清理数据库
  closeDatabase()
  
  // 清理测试数据
  import('fs').then(fs => {
    if (fs.existsSync('./test-data')) {
      fs.rmSync('./test-data', { recursive: true })
      console.log('\n🗑️  测试数据已清理')
    }
  })
  
  // 输出测试结果
  console.log('\n' + '='.repeat(50))
  console.log('📊 测试结果汇总')
  console.log('='.repeat(50))
  console.log(`数据库:    ${results.database ? '✅ 通过' : '❌ 失败'}`)
  console.log(`API 服务：   ${results.api ? '✅ 通过' : '❌ 失败'}`)
  console.log(`任务队列：  ${results.queue ? '✅ 通过' : '❌ 失败'}`)
  console.log(`定时调度：  ${results.scheduler ? '✅ 通过' : '❌ 失败'}`)
  
  const allPassed = Object.values(results).every(r => r === true)
  console.log('='.repeat(50))
  console.log(allPassed ? '🎉 所有测试通过!' : '⚠️  部分测试失败')
  console.log('='.repeat(50))
  
  process.exit(allPassed ? 0 : 1)
}

// 运行测试
runTests().catch(console.error)
