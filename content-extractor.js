(function () {
  if (window.MarkClipExtractor) return;

  const MIN_MAIN_TEXT_LENGTH = 200;
  const CHUNK_SIZE = 20;
  const NOISE_SELECTORS = [
    'script', 'style', 'noscript', 'iframe', 'canvas',
    'nav', 'header', 'footer', 'aside',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '.nav', '.navigation', '.navbar', '.sidebar', '.side-bar',
    '.footer', '.header', '.menu', '.ad', '.ads', '.advertisement',
    '.cookie', '.popup', '.modal', '.overlay', '.newsletter', '.subscribe',
    '#nav', '#navigation', '#header', '#footer', '#sidebar',
    'svg[aria-hidden]',
  ];
  const NOISE_SELECTOR = NOISE_SELECTORS.join(',');
  const MAIN_SELECTORS = [
    'main', '[role="main"]',
    'article', '.article', '.post', '.content',
    '.main-content', '#main-content', '#content',
    '.entry-content', '.post-content', '.article-content',
    '.markdown-body', '.prose',
  ];

  let turndownWithImages;
  let turndownWithoutImages;

  async function yieldToMain() {
    if (globalThis.scheduler?.yield) {
      await globalThis.scheduler.yield();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function textLength(el) {
    return (el?.textContent || '').trim().length;
  }

  function cleanInPlace(root) {
    root.querySelectorAll(NOISE_SELECTOR).forEach((el) => el.remove());
    root.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
          el.removeAttribute(attr.name);
        }
      });
    });
    return root;
  }

  function cleanClone(root) {
    return cleanInPlace(root.cloneNode(true));
  }

  function elementFromHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html || '';
    const wrapper = document.createElement('article');
    wrapper.append(template.content.cloneNode(true));
    return cleanInPlace(wrapper);
  }

  function librariesReady() {
    return typeof TurndownService === 'function' && typeof Readability === 'function';
  }

  async function ensureLibraries() {
    if (librariesReady()) return;

    const response = await chrome.runtime.sendMessage({ action: 'page2md:ensureLibraries' });
    if (!response?.success) {
      throw new Error(toFriendlyAccessError(response?.error));
    }
  }

  function toFriendlyAccessError(message = '') {
    if (
      message.includes('Cannot access contents of the page') ||
      message.includes('Cannot access a chrome') ||
      message.includes('The extensions gallery cannot be scripted') ||
      message.includes('This page cannot be scripted') ||
      message.includes('Missing host permission')
    ) {
      return '当前页面不允许 MarkClip 读取内容。请换普通网页；如果是本地文件，请在扩展详情中开启“允许访问文件网址”。';
    }

    return message || '转换库加载失败。';
  }

  function findLiveMainCandidate() {
    for (const selector of MAIN_SELECTORS) {
      const el = document.querySelector(selector);
      if (textLength(el) > MIN_MAIN_TEXT_LENGTH) return el;
    }
    return null;
  }

  function extractWithReadability() {
    if (typeof Readability !== 'function') return null;

    try {
      const article = new Readability(document.cloneNode(true)).parse();
      if (!article || !article.content || (article.textContent || '').trim().length < MIN_MAIN_TEXT_LENGTH) {
        return null;
      }

      return {
        element: elementFromHtml(article.content),
        title: article.title || document.title,
        source: 'Readability',
      };
    } catch (_err) {
      return null;
    }
  }

  function extractMainContent() {
    const readable = extractWithReadability();
    if (readable) return readable;

    const liveCandidate = findLiveMainCandidate();
    if (liveCandidate) {
      return { element: cleanClone(liveCandidate), title: document.title, source: '主内容' };
    }

    return { element: cleanClone(document.body), title: document.title, source: '全页回退' };
  }

  function extractFullContent() {
    return { element: cleanClone(document.body), title: document.title, source: '全页' };
  }

  function extractSelectionContent() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      throw new Error('没有检测到选区，请先在页面中选中文本。');
    }

    const wrapper = document.createElement('article');
    for (let i = 0; i < selection.rangeCount; i += 1) {
      wrapper.append(selection.getRangeAt(i).cloneContents());
    }

    const cleaned = cleanInPlace(wrapper);
    if (textLength(cleaned) === 0) {
      throw new Error('选区没有可转换的文本内容。');
    }

    return { element: cleaned, title: document.title, source: '选区' };
  }

  function createTurndownService(removeImages) {
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      hr: '---',
      strongDelimiter: '**',
      emDelimiter: '_',
      linkStyle: 'inlined',
    });

    if (removeImages) {
      turndownService.addRule('removeImages', {
        filter: 'img',
        replacement: () => '',
      });
    }

    turndownService.addRule('fencedCodeBlock', {
      filter: (node) => node.nodeName === 'PRE' && node.querySelector('code'),
      replacement: (_content, node) => {
        const code = node.querySelector('code');
        const lang = (code.className.match(/language-(\S+)/) || [])[1] || '';
        return `\n\`\`\`${lang}\n${code.textContent.trim()}\n\`\`\`\n\n`;
      },
    });

    turndownService.addRule('figureCaption', {
      filter: 'figcaption',
      replacement: (content) => content.trim() ? `\n_${content.trim()}_\n` : '',
    });

    turndownService.addRule('removeEmptyLinks', {
      filter: (node) =>
        node.nodeName === 'A' &&
        (!node.textContent.trim() || node.textContent.trim() === node.href),
      replacement: (content) => content,
    });

    return turndownService;
  }

  function getTurndownService(removeImages) {
    if (removeImages) {
      turndownWithoutImages ||= createTurndownService(true);
      return turndownWithoutImages;
    }

    turndownWithImages ||= createTurndownService(false);
    return turndownWithImages;
  }

  async function convertToMarkdown(element, options = {}) {
    const service = getTurndownService(Boolean(options.removeImages));
    const children = Array.from(element.childNodes || []);

    if (children.length <= CHUNK_SIZE) {
      return service.turndown(element);
    }

    const parts = [];
    for (let i = 0; i < children.length; i += CHUNK_SIZE) {
      const chunk = element.cloneNode(false);
      for (let j = i; j < Math.min(i + CHUNK_SIZE, children.length); j += 1) {
        chunk.appendChild(children[j].cloneNode(true));
      }
      parts.push(service.turndown(chunk));
      if (i + CHUNK_SIZE < children.length) await yieldToMain();
    }

    return parts.join('\n');
  }

  function selectContent(mode) {
    if (mode === 'selection') return extractSelectionContent();
    if (mode === 'full') return extractFullContent();
    return extractMainContent();
  }

  async function markdownFromElement(element, options = {}) {
    await ensureLibraries();
    const body = await convertToMarkdown(element, options);
    const markdown = Page2MDCore.buildMarkdownDocument({
      title: options.title || document.title || 'Untitled',
      source: location.href,
      date: new Date().toISOString().slice(0, 10),
      body,
    });

    return {
      markdown,
      title: document.title || 'page',
      charCount: markdown.length,
      source: options.source || '框选',
    };
  }

  async function buildMarkdown(options = {}) {
    await ensureLibraries();
    const { element, title, source } = selectContent(options.mode || 'main');
    return markdownFromElement(element, { ...options, title, source });
  }

  async function copyMarkdown(markdown) {
    try {
      await navigator.clipboard.writeText(markdown);
      return;
    } catch (_err) {
      const textarea = document.createElement('textarea');
      textarea.value = markdown;
      textarea.setAttribute('readonly', '');
      textarea.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) throw new Error('复制失败，请从弹窗中复制。');
    }
  }

  function downloadMarkdown(markdown, title) {
    const safeName = Page2MDCore.sanitizeFileName(title);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeName}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.MarkClipExtractor = {
    buildMarkdown,
    cleanClone,
    copyMarkdown,
    downloadMarkdown,
    librariesReady,
    markdownFromElement,
    textLength,
  };
})();
