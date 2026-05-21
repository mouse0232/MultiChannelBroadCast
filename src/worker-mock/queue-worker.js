import { Worker } from 'bullmq'
import { processSingleChannel } from './grabber.js'

let worker = null
let addBulkFunc = null

export async function startQueueWorker() {
  const redisHost = process.env.REDIS_HOST || 'localhost'
  const redisPort = parseInt(process.env.REDIS_PORT || '6379')
  const useMemoryMode = process.env.QUEUE_MEMORY_MODE === 'true'

  if (useMemoryMode) {
    console.log('📭 Using in-memory queue (simplified mode)')
    await createMemoryWorker()
  } else {
    console.log(`📡 Connecting to Redis at ${redisHost}:${redisPort}`)
    await createRedisWorker(redisHost, redisPort)
  }

  return worker
}

async function createRedisWorker(host, port) {
  const connection = { host, port }
  
  worker = new Worker('telegram-grab', async (job) => {
    try {
      await processSingleChannel(job.data)
      console.log(`✅ Job ${job.id} completed`)
    } catch (e) {
      console.error(`❌ Job ${job.id} failed:`, e.message)
      throw e
    }
  }, {
    connection,
    concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5'),
    limiter: {
      max: parseInt(process.env.QUEUE_LIMIT_MAX || '60'),
      duration: parseInt(process.env.QUEUE_LIMIT_DURATION || '60000')
    }
  })

  addBulkFunc = worker.addBulk.bind(worker)
  console.log('✅ Queue worker started (Redis mode)')
}

async function createMemoryWorker() {
  const taskQueue = []
  let isProcessing = false
  const concurrency = parseInt(process.env.QUEUE_CONCURRENCY || '5')
  let activeJobs = 0

  worker = {
    async addBulk(jobs) {
      for (const job of jobs) {
        taskQueue.push(job.data)
      }
      processQueue()
    },
    async close() {
      isProcessing = false
      console.log('Memory worker closed')
    }
  }

  async function processQueue() {
    if (isProcessing || taskQueue.length === 0 || activeJobs >= concurrency) return

    isProcessing = true

    while (taskQueue.length > 0 && activeJobs < concurrency) {
      const jobData = taskQueue.shift()
      activeJobs++

      processSingleChannel(jobData)
        .then(() => console.log(`✓ Job completed for ${jobData.channel}`))
        .catch((err) => console.error(`✗ Job failed for ${jobData.channel}:`, err.message))
        .finally(() => {
          activeJobs--
          if (taskQueue.length > 0) processQueue()
          else isProcessing = false
        })
    }
  }

  addBulkFunc = worker.addBulk
  console.log('✅ Queue worker started (Memory mode)')
}

export async function closeQueueWorker() {
  if (worker && worker.close) {
    await worker.close()
    console.log('📴 Queue worker stopped')
  }
}

export async function addBulk(jobs) {
  if (!addBulkFunc) {
    throw new Error('Worker not started. Call startQueueWorker() first.')
  }
  return addBulkFunc(jobs)
}
