import cron from 'node-cron'
import { startQueueWorker, addBulk as queueAddBulk } from './queue-worker.js'
import { cleanupOldData } from './grabber.js'

let scheduler = null

/**
 * 停止定时调度器
 */
export function stopScheduler() {
  if (scheduler) {
    scheduler.stop()
    console.log('📴 Scheduler stopped')
  }
}

/**
 * 启动定时调度器
 */
export async function startScheduler() {
  const cronExpression = process.env.CRON_SCHEDULE || '* * * * *'
  
  console.log(`⏰ Starting scheduler with cron: ${cronExpression}`)

  await startQueueWorker()

  scheduler = cron.schedule(cronExpression, async () => {
    console.log('⏰ Cron triggered: Dispatching tasks')
    
    try {
      const channelsStr = process.env.CHANNELS || ''
      const channels = channelsStr.split(',').map(c => c.trim()).filter(Boolean)

      if (channels.length === 0) {
        console.warn('⚠️ No channels configured')
        return
      }

      const tasks = channels.map(ch => ({ channel: ch }))
      const jobs = tasks.map(task => ({ data: task }))
      
      await queueAddBulk(jobs)
      console.log(`✅ Dispatched ${tasks.length} tasks to Queue`)

      await cleanupOldData()
    } catch (e) {
      console.error('Cron execution failed:', e.message)
    }
  }, {
    scheduled: true,
    timezone: process.env.TIMEZONE || 'Asia/Shanghai'
  })

  console.log('✅ Scheduler started')
  return scheduler
}