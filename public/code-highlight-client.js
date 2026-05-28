// Client-side code highlighting initialization
import { highlightCodeBlocks, detectLanguage } from './code-highlight.js';

export async function initCodeHighlighting() {
  const contentElements = document.querySelectorAll('.content[data-highlight="true"]');

  for (const element of contentElements) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = element.innerHTML;

    const codeBlocks = tempDiv.querySelectorAll('pre code');
    for (const block of codeBlocks) {
      if (block.classList.contains('language-') || block.parentNode.classList.contains('highlighted')) {
        continue;
      }

      let language = 'clike';
      const codeText = block.textContent;

      const existingLangClass = Array.from(block.classList).find(cls => cls.startsWith('language-'));
      if (existingLangClass) {
        language = existingLangClass.replace('language-', '');
      } else {
        language = detectLanguage(codeText);
        block.classList.add(`language-${language}`);
      }

      const highlighted = await highlightCodeBlocks(block.outerHTML);
      block.outerHTML = highlighted;
      block.parentNode.classList.add('highlighted');
    }

    element.innerHTML = tempDiv.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCodeHighlighting);
  } else {
    initCodeHighlighting();
  }
}
