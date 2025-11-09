#!/usr/bin/env node
// 生成缓存模块脚本
// 将预构建的缓存数据转换为 JavaScript 模块,可在运行时导入使用

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateCacheModule() {
  const cacheFile = path.join(__dirname, '../.cache/telegram-cache.json');
  const outputFile = path.join(__dirname, '../src/lib/telegram/preload-cache.js');

  try {
    // 读取缓存数据
    if (!fs.existsSync(cacheFile)) {
      console.log('缓存文件不存在,生成空缓存模块');
      const emptyModule = `// 自动生成的预加载缓存模块
// 此文件由 scripts/generate-cache-module.js 生成

export const preloadCache = [];
`;
      fs.writeFileSync(outputFile, emptyModule);
      return;
    }

    const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    
    console.log(`生成包含 ${cacheData.length} 个缓存项的模块...`);

    // 生成 JavaScript 模块
    const moduleContent = `// 自动生成的预加载缓存模块
// 此文件由 scripts/generate-cache-module.js 生成
// 构建时间: ${new Date().toISOString()}
// 缓存项数量: ${cacheData.length}

export const preloadCache = ${JSON.stringify(cacheData, null, 2)};
`;

    fs.writeFileSync(outputFile, moduleContent);
    console.log(`缓存模块已生成: ${outputFile}`);
    console.log(`模块大小: ${(moduleContent.length / 1024).toFixed(2)} KB`);
  } catch (error) {
    console.error('生成缓存模块时出错:', error);
    // 生成空模块以避免构建失败
    const emptyModule = `// 自动生成的预加载缓存模块
// 生成时遇到错误,使用空缓存

export const preloadCache = [];
`;
    fs.writeFileSync(outputFile, emptyModule);
  }
}

generateCacheModule();
