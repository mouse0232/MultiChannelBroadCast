// src/lib/code-highlight.js
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-git';

// Load default theme
import 'prismjs/themes/prism.css';

/**
 * Highlights code blocks in a given HTML string.
 * @param {string} html - The HTML content containing <pre><code> blocks.
 * @returns {string} - The HTML with highlighted code.
 */
export function highlightCodeBlocks(html) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  tempDiv.querySelectorAll('pre code').forEach((block) => {
    const languageClass = Array.from(block.classList).find(cls => cls.startsWith('language-'));
    let language = languageClass ? languageClass.replace('language-', '') : 'clike';
    
    // Fallback to plaintext if language is not supported
    if (!Prism.languages[language]) {
      language = 'clike';
    }

    block.innerHTML = Prism.highlight(block.textContent, Prism.languages[language], language);
  });

  return tempDiv.innerHTML;
}

/**
 * Detects language from code content heuristically.
 * This is a simplified version; for production, consider using a more robust library.
 * @param {string} code - The code string.
 * @returns {string} - Detected language alias.
 */
export function detectLanguage(code) {
  const trimmedCode = code.trim();
  
  // Check for common language indicators
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
  
  // Default to javascript for web-related content
  return 'javascript';
}