// Vercel Serverless函数 - 缓存更新API端点
// 用于手动触发或定时更新Telegram频道数据缓存

import { updateCache } from '../scripts/background-cache.js';

export default async function handler(request, response) {
  // 只允许POST请求或来自Vercel Cron的请求
  if (request.method !== 'POST' && !request.headers['x-vercel-cron']) {
    return response.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    console.log('开始更新Telegram频道缓存...');
    await updateCache();
    console.log('缓存更新完成');
    
    return response.status(200).json({ message: 'Cache updated successfully' });
  } catch (error) {
    console.error('更新缓存时出错:', error);
    return response.status(500).json({ error: 'Failed to update cache' });
  }
}