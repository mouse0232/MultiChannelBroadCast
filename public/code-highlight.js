// DEPLOY_CHECK: 2026-05-28T05:45:00Z
// Code highlighting with PrismJS from CDN
// 使用 jsDelivr CDN 加载 PrismJS，避免裸包名解析问题

const PRISM_CDN = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0';

async function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(script);
  });
}

async function loadStyle(href) {
  return new Promise((resolve) => {
    if (document.querySelector(`link[href="${href}"]`)) {
      resolve();
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = resolve;
    document.head.appendChild(link);
  });
}

let prismInitialized = false;
async function initPrism() {
  if (prismInitialized) return window.Prism;

  try {
    await loadScript(`${PRISM_CDN}/prism.min.js`);
    await loadStyle(`${PRISM_CDN}/themes/prism.min.css`);

    const languages = [
      'javascript', 'typescript', 'jsx', 'tsx',
      'python', 'go', 'rust', 'java',
      'c', 'cpp', 'csharp', 'php',
      'ruby', 'sql', 'json', 'yaml',
      'markdown', 'bash', 'docker', 'git'
    ];

    for (const lang of languages) {
      try {
        await loadScript(`${PRISM_CDN}/components/prism-${lang}.min.js`);
      } catch (e) {
        console.warn(`Prism language ${lang} not available`);
      }
    }

    prismInitialized = true;
    return window.Prism;
  } catch (err) {
    console.error('Failed to initialize PrismJS:', err);
    return null;
  }
}

export async function highlightCodeBlocks(html) {
  const Prism = await initPrism();
  if (!Prism) return html;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  tempDiv.querySelectorAll('pre code').forEach((block) => {
    const languageClass = Array.from(block.classList).find(cls => cls.startsWith('language-'));
    let language = languageClass ? languageClass.replace('language-', '') : 'clike';

    if (!Prism.languages[language]) {
      language = 'clike';
    }

    block.innerHTML = Prism.highlight(block.textContent, Prism.languages[language], language);
  });

  return tempDiv.innerHTML;
}

export function detectLanguage(code) {
  const trimmedCode = code.trim();

  if (trimmedCode.startsWith('<?php')) return 'php';
  if (trimmedCode.startsWith('#!') && trimmedCode.includes('python')) return 'python';
  if (trimmedCode.startsWith('package ') || trimmedCode.includes('func main()')) return 'go';
  if (trimmedCode.startsWith('import ') || trimmedCode.includes('def ')) return 'python';
  if (trimmedCode.startsWith('public class ') || trimmedCode.includes('System.out.println')) return 'java';
  if (trimmedCode.startsWith('fn ') || trimmedCode.includes('let mut ')) return 'rust';
  if (trimmedCode.startsWith('#include') || trimmedCode.includes('int main()')) return 'c';
  if (trimmedCode.startsWith('using ') || trimmedCode.includes('namespace ')) return 'csharp';
  if (trimmedCode.startsWith('SELECT ') || trimmedCode.startsWith('select ')) return 'sql';
  if (trimmedCode.startsWith('{') && trimmedCode.endsWith('}')) return 'json';
  if (trimmedCode.includes('::')) return 'cpp';

  return 'javascript';
}
