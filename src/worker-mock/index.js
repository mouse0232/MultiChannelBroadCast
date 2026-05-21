import { initializeDatabase, closeDatabase } from './database.js'
import { startAPIServer, stopAPIServer } from './api-server.js'
import { startQueueWorker, closeQueueWorker } from './queue-worker.js'
import { startScheduler, stopScheduler } from './scheduler.js'

async function main() {
  console.log('🚀 Starting Multi-Channel Broadcast (Docker Mode)')
  console.log('='.repeat(50))
  
  try {
    await initializeDatabase()
    console.log('✅ [1/4] Database initialized')
    
    await startAPIServer()
    console.log('✅ [2/4] API server running')
    
    await startQueueWorker()
    console.log('✅ [3/4] Queue worker started')
    
    await startScheduler()
    console.log('✅ [4/4] Scheduler started (Cron: * * * * *)')
    
    console.log('='.repeat(50))
    console.log('🎉 All services started successfully')
    console.log('='.repeat(50))
    
    process.on('SIGINT', handleShutdown)
    process.on('SIGTERM', handleShutdown)
    
  } catch (error) {
    console.error('❌ Failed to start services:', error)
    await handleShutdown()
    process.exit(1)
  }
}

async function handleShutdown() {
  console.log('\n🛑 Shutting down services...')
  
  await stopScheduler()
  await closeQueueWorker()
  await stopAPIServer()
  await closeDatabase()
  
  console.log('✅ All services stopped')
  process.exit(0)
}

main().catch(console.error)
