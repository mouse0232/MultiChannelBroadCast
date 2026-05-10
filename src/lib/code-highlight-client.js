// src/lib/code-highlight-client.js
import { highlightCodeBlocks, detectLanguage } from './code-highlight.js';

/**
 * Initializes code highlighting on the page.
 * Should be called after the page content has loaded.
 */
export function initCodeHighlighting() {
  // Find all elements that need highlighting
  const contentElements = document.querySelectorAll('.content[data-highlight="true"]');
  
  contentElements.forEach((element) => {
    // Convert HTML string to DOM for processing
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = element.innerHTML;
    
    // Process each code block
    tempDiv.querySelectorAll('pre code').forEach((block) => {
      // Skip if already highlighted
      if (block.classList.contains('language-') || block.parentNode.classList.contains('highlighted')) {
        return;
      }
      
      // Detect language if not specified
      let language = 'clike';
      const codeText = block.textContent;
      
      // Try to get language from class or detect it
      const existingLangClass = Array.from(block.classList).find(cls => cls.startsWith('language-'));
      if (existingLangClass) {
        language = existingLangClass.replace('language-', '');
      } else {
        language = detectLanguage(codeText);
        // Add the detected language class
        block.classList.add(`language-${language}`);
      }
      
      // Highlight the code
      if (Prism.languages[language]) {
        const highlighted = Prism.highlight(codeText, Prism.languages[language], language);
        block.innerHTML = highlighted;
        block.parentNode.classList.add('highlighted');
      }
    });
    
    // Update the original element
    element.innerHTML = tempDiv.innerHTML;
  });
}

// Auto-initialize if running in browser
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCodeHighlighting);
  } else {
    initCodeHighlighting();
  }
}