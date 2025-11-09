#!/usr/bin/env node
// Cloudflare Pages 环境变量测试脚本
// 使用方法: node test-env.js

console.log('=== 环境变量检查 ===\n')

const requiredEnvs = [
  'CHANNELS',
]

const optionalEnvs = [
  'SITE',
  'SITE_URL', 
  'SITE_TITLE',
  'SITE_AVATAR',
  'LOCALE',
  'TIMEZONE',
]

console.log('✅ 必需的环境变量:')
requiredEnvs.forEach(key => {
  const value = process.env[key]
  if (value) {
    console.log(`  ${key}: ${value}`)
  } else {
    console.log(`  ❌ ${key}: 未设置`)
  }
})

console.log('\n📋 可选的环境变量:')
optionalEnvs.forEach(key => {
  const value = process.env[key]
  if (value) {
    console.log(`  ${key}: ${value}`)
  } else {
    console.log(`  ${key}: 未设置`)
  }
})

console.log('\n=== URL 格式检查 ===\n')

const site = process.env.SITE || process.env.SITE_URL
if (site) {
  console.log(`站点 URL: ${site}`)
  
  if (site.endsWith('/')) {
    console.log('⚠️  警告: SITE 以斜杠结尾,可能导致 URL 问题')
    console.log(`   建议: ${site.slice(0, -1)}`)
  } else {
    console.log('✅ URL 格式正确')
  }
  
  if (!site.startsWith('http')) {
    console.log('⚠️  警告: SITE 不是完整 URL')
  }
} else {
  console.log('ℹ️  未设置 SITE/SITE_URL (将使用自动检测)')
}

console.log('\n=== CHANNELS 解析 ===\n')

const channels = process.env.CHANNELS
if (channels) {
  const channelList = channels.split(',').map(c => c.trim()).filter(Boolean)
  console.log(`频道数量: ${channelList.length}`)
  channelList.forEach((ch, i) => {
    console.log(`  ${i + 1}. ${ch}`)
  })
} else {
  console.log('❌ 未设置 CHANNELS')
}
