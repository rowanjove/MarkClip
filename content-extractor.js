(function () {
  if (window.MarkClipExtractor) return;

  const MIN_MAIN_TEXT_LENGTH = 200;
  const CHUNK_SIZE = 20;
  const MAX_TEXT_LENGTH = 2_000_000;
  const MAX_NODE_COUNT = 250_000;
  const CONVERSION_TIMEOUT_MS = 15_000;
  const MAIN_NOISE_SELECTORS = [
    'script', 'style', 'noscript', 'iframe', 'canvas',
    'nav', 'header', 'footer', 'aside',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '.nav', '.navigation', '.navbar', '.sidebar', '.side-bar',
    '.footer', '.header', '.menu', '.ad', '.ads', '.advertisement',
    '.cookie', '.popup', '.modal', '.overlay', '.newsletter', '.subscribe',
    '#nav', '#navigation', '#header', '#footer', '#sidebar',
    'svg[aria-hidden]',
  ];
  const MINIMAL_NOISE_SELECTORS = [
    'script', 'style', 'noscript', 'iframe', 'canvas', 'svg[aria-hidden]',
    '#page2md-floating-root', '#markclip-pick-overlay', '#markclip-pick-tip',
  ];
  const MAIN_SELECTORS = [
    'main', '[role="main"]',
    'article', '.article', '.post', '.content',
    '.main-content', '#main-content', '#content',
    '.entry-content', '.post-content', '.article-content',
    '.markdown-body', '.prose',
  ];

  let turndownWithImages;
  let turndownWithoutImages;

  function now() {
    return globalThis.performance?.now?.() ?? Date.now();
  }

  async function yieldToMain(signal) {
    if (signal?.aborted) throw new Error('转换已取消。');
    if (globalThis.scheduler?.yield) {
      await globalThis.scheduler.yield();
      if (signal?.aborted) throw new Error('转换已取消。');
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
    if (signal?.aborted) throw new Error('转换已取消。');
  }

  function textLength(el) {
    return (el?.textContent || '').trim().length;
  }

  function cleanInPlace(root, options = {}) {
    const profile = options.profile || 'main';
    const selectors = profile === 'main' ? MAIN_NOISE_SELECTORS : MINIMAL_NOISE_SELECTORS;
    root.querySelectorAll('script[type^="math/tex"], script[type^="math/asciimath"]').forEach((script) => {
      const replacement = document.createElement('markclip-math-block');
      replacement.textContent = script.textContent || '';
      script.replaceWith(replacement);
    });
    root.querySelectorAll(selectors.join(',')).forEach((el) => el.remove());
    if (root.id === 'page2md-floating-root' || root.id === 'markclip-pick-overlay' || root.id === 'markclip-pick-tip') {
      root.remove();
      return root;
    }

    root.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim().toLowerCase();
        if (name.startsWith('on') || name === 'srcdoc') {
          el.removeAttribute(attr.name);
        }
      });
    });
    MarkClipUrl.normalizeDomUrls(root, options.baseUrl || document.baseURI);
    return root;
  }

  function cleanClone(root, options = {}) {
    return cleanInPlace(root.cloneNode(true), options);
  }

  function elementFromHtml(html, options = {}) {
    const template = document.createElement('template');
    template.innerHTML = html || '';
    const wrapper = document.createElement('article');
    wrapper.append(template.content.cloneNode(true));
    return cleanInPlace(wrapper, { profile: 'readability', ...options });
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
      return '当前页面不允许页摘读取内容。请换普通网页；如果是本地文件，请在扩展详情中开启“允许访问文件网址”。';
    }

    return message || '转换库加载失败。';
  }

  function findLiveMainCandidate() {
    return MAIN_SELECTORS
      .map((selector) => document.querySelector(selector))
      .filter((el) => textLength(el) > MIN_MAIN_TEXT_LENGTH)
      .sort((left, right) => textLength(right) - textLength(left))[0] || null;
  }

  function assertDocumentSize() {
    const nodeCount = document.getElementsByTagName('*').length;
    if (nodeCount > MAX_NODE_COUNT) {
      throw new Error('页面结构过大，已停止转换。请使用选择区域模式选择需要的内容。');
    }
  }

  function extractWithReadability() {
    if (typeof Readability !== 'function') return null;

    try {
      const article = new Readability(document.cloneNode(true)).parse();
      if (!article || !article.content || (article.textContent || '').trim().length < MIN_MAIN_TEXT_LENGTH) {
        return null;
      }

      return {
        element: elementFromHtml(article.content, { profile: 'readability' }),
        title: article.title || document.title,
        source: 'Readability',
        warnings: [],
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
      return {
        element: cleanClone(liveCandidate, { profile: 'main' }),
        title: document.title,
        source: '主内容',
        warnings: ['Readability 未能确定正文，已使用语义候选节点。'],
      };
    }

    return {
      element: cleanClone(document.body, { profile: 'main' }),
      title: document.title,
      source: '全页回退',
      warnings: ['未找到明确正文，已回退到页面内容。'],
    };
  }

  function extractFullContent() {
    return { element: cleanClone(document.body, { profile: 'full' }), title: document.title, source: '全页', warnings: [] };
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

    const cleaned = cleanInPlace(wrapper, { profile: 'selection' });
    if (textLength(cleaned) === 0) {
      throw new Error('选区没有可转换的文本内容。');
    }

    return { element: cleaned, title: document.title, source: '选区', warnings: [] };
  }

  async function getStoredSiteRule(url = location.href) {
    if (!chrome.storage?.local) return null;
    try {
      const stored = await chrome.storage.local.get({ siteRules: [] });
      return MarkClipSiteRules.findSiteRule(url, stored.siteRules);
    } catch (_err) {
      return null;
    }
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
        return MarkClipCode.createFencedCodeBlock(
          MarkClipCode.getCodeText(code),
          MarkClipCode.getCodeLanguage(code),
        );
      },
    });

    turndownService.addRule('plainPreCodeBlock', {
      filter: (node) => node.nodeName === 'PRE' && !node.querySelector('code'),
      replacement: (_content, node) => MarkClipCode.createFencedCodeBlock(
        MarkClipCode.getCodeText(node),
        MarkClipCode.getCodeLanguage(node),
      ),
    });

    turndownService.addRule('strikethrough', {
      filter: ['del', 's', 'strike'],
      replacement: (content) => `~~${content}~~`,
    });

    turndownService.addRule('mathml', {
      filter: (node) => ['math', 'markclip-math-block'].includes(String(node.nodeName).toLowerCase()),
      replacement: (_content, node) => MarkClipMath.renderMath(node),
    });

    turndownService.addRule('taskListItem', {
      filter: (node) => node.nodeName === 'LI' && node.querySelector('input[type="checkbox"]'),
      replacement: (content, node) => {
        const checkbox = node.querySelector('input[type="checkbox"]');
        const marker = checkbox.checked ? '[x]' : '[ ]';
        const prefix = node.parentNode?.nodeName === 'OL' ? '1. ' : '- ';
        return `\n${prefix}${marker} ${content.replace(/^\s+/, '')}\n`;
      },
    });

    turndownService.addRule('gfmTable', {
      filter: 'table',
      replacement: (_content, node) => {
        const rows = Array.from(node.querySelectorAll('tr'))
          .map((row) => Array.from(row.children).filter((cell) => ['TH', 'TD'].includes(cell.nodeName)));
        if (!rows.length || !rows.some((row) => row.length)) return '';
        const normalized = rows.filter((row) => row.length).map((row) => row.map((cell) => {
          const cellMarkdown = turndownService.turndown(cell.innerHTML)
            .trim()
            .replace(/\|/g, '\\|')
            .replace(/\n+/g, '<br>');
          return cellMarkdown;
        }));
        const width = Math.max(...normalized.map((row) => row.length));
        const pad = (row) => [...row, ...Array(width - row.length).fill('')];
        const alignments = pad(rows[0]).map((cell) => {
          const explicit = cell?.getAttribute?.('align')?.toLowerCase();
          const style = cell?.getAttribute?.('style')?.match(/text-align\s*:\s*(left|center|right)/i)?.[1]?.toLowerCase();
          return explicit || style || '';
        });
        const separator = alignments.map((alignment) => {
          if (alignment === 'left') return ':---';
          if (alignment === 'right') return '---:';
          if (alignment === 'center') return ':---:';
          return '---';
        });
        const lines = [`| ${pad(normalized[0]).join(' | ')} |`, `| ${pad(separator).join(' | ')} |`];
        normalized.slice(1).forEach((row) => lines.push(`| ${pad(row).join(' | ')} |`));
        return `\n\n${lines.join('\n')}\n\n`;
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
    if (options.signal?.aborted) throw new Error('转换已取消。');
    if (options.deadline !== undefined && Date.now() > options.deadline) {
      throw new Error('转换耗时过长，已停止。请使用选择区域模式选择需要的内容。');
    }
    if (textLength(element) > MAX_TEXT_LENGTH) {
      throw new Error('页面内容过大，已停止转换。请使用选择区域模式选择需要的内容。');
    }
    const service = getTurndownService(Boolean(options.removeImages));
    const children = Array.from(element.childNodes || []);

    const canChunk = children.length > CHUNK_SIZE && !['UL', 'OL', 'TABLE', 'PRE'].includes(element.nodeName);
    if (!canChunk) {
      const markdown = service.turndown(element);
      if (options.signal?.aborted) throw new Error('转换已取消。');
      if (options.deadline !== undefined && Date.now() > options.deadline) {
        throw new Error('转换耗时过长，已停止。请使用选择区域模式选择需要的内容。');
      }
      return markdown;
    }

    const parts = [];
    for (let i = 0; i < children.length; i += CHUNK_SIZE) {
      if (options.signal?.aborted) throw new Error('转换已取消。');
      if (options.deadline !== undefined && Date.now() > options.deadline) {
        throw new Error('转换耗时过长，已停止。请使用选择区域模式选择需要的内容。');
      }
      const chunk = element.cloneNode(false);
      for (let j = i; j < Math.min(i + CHUNK_SIZE, children.length); j += 1) {
        chunk.appendChild(children[j].cloneNode(true));
      }
      parts.push(service.turndown(chunk));
      if (i + CHUNK_SIZE < children.length) await yieldToMain(options.signal);
    }

    if (options.signal?.aborted) throw new Error('转换已取消。');
    if (options.deadline !== undefined && Date.now() > options.deadline) {
      throw new Error('转换耗时过长，已停止。请使用选择区域模式选择需要的内容。');
    }

    return parts.filter(Boolean).join('\n\n');
  }

  function selectContent(mode, siteRule = null) {
    if (mode === 'selection') return extractSelectionContent();
    if (mode === 'full') return extractFullContent();
    if (siteRule?.selector) {
      try {
        const candidate = document.querySelector(siteRule.selector);
        if (candidate && textLength(candidate) > MIN_MAIN_TEXT_LENGTH) {
          const title = siteRule.titleSelector
            ? document.querySelector(siteRule.titleSelector)?.textContent?.trim() || document.title
            : document.title;
          return {
            element: cleanClone(candidate, { profile: 'main' }),
            title,
            source: '站点规则',
            warnings: [],
          };
        }
      } catch (_err) {
        // An invalid site rule should fall back to the general extractor.
      }
    }
    return extractMainContent();
  }

  async function markdownFromElement(element, options = {}) {
    await ensureLibraries();
    const timings = {};
    const warnings = [...(options.warnings || [])];
    let imageStats = { attempted: 0, inlined: 0, failed: 0 };
    const deadline = options.deadline !== undefined ? options.deadline : Date.now() + CONVERSION_TIMEOUT_MS;
    if (options.localizeImages) {
      const fetchImpl = typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
      if (!fetchImpl || !window.MarkClipImages?.inlineImages) {
        warnings.push('当前页面环境不支持图片内嵌，已保留原链接。');
      } else {
        const localized = await window.MarkClipImages.inlineImages(element, {
          fetchImpl,
          deadline,
          signal: options.signal,
        });
        imageStats = localized.stats;
        warnings.push(...localized.warnings);
      }
    }
    const startedAt = now();
    timings.convertStart = startedAt;
    const body = await convertToMarkdown(element, {
      ...options,
      deadline,
    });
    timings.convertMs = Math.round(now() - startedAt);
    const composeStartedAt = now();
    const pageContext = options.pageContext || {};
    const title = options.title || pageContext.title || document.title || 'Untitled';
    const date = new Date().toISOString().slice(0, 10);
    const author = pageContext.author ?? (document.querySelector('meta[name="author"], meta[property="article:author"]')?.getAttribute('content') || '');
    const sourceUrl = pageContext.url || location.href;
    const site = pageContext.site || new URL(sourceUrl).hostname || '';
    const markdown = options.template
      ? MarkClipTemplate.renderTemplate(options.template, MarkClipTemplate.buildVariables({
        title,
        url: sourceUrl,
        source: options.source,
        date,
        author,
        site,
        content: body,
      }))
      : Page2MDCore.buildMarkdownDocument({ title, source: sourceUrl, date, body });
    timings.composeMs = Math.round(now() - composeStartedAt);

    return MarkClipContract.createClipResult({
      markdown,
      title,
      charCount: markdown.length,
      source: options.source || '正文',
      warnings,
      diagnostics: {
        ...(options.diagnostics || {}),
        images: imageStats,
      },
      timings,
    });
  }

  async function buildMarkdown(options = {}) {
    const totalStartedAt = now();
    const sourceUrl = String(location.href);
    await ensureLibraries();
    await yieldToMain(options.signal);
    const extractStartedAt = now();
    const siteRule = await getStoredSiteRule(sourceUrl);
    if (sourceUrl !== location.href) {
      throw new Error('页面已跳转，请在新页面重新提取。');
    }
    if (!['selection', 'pick'].includes(options.mode)) assertDocumentSize();
    // Capture metadata and clone content in the same task, after all preparation awaits.
    const pageContext = {
      url: sourceUrl,
      title: document.title,
      author: document.querySelector('meta[name="author"], meta[property="article:author"]')?.getAttribute('content') || '',
      site: location.hostname || '',
    };
    const extracted = selectContent(options.mode || 'main', siteRule);
    const { element, title, source } = extracted;
    const warnings = [...(extracted.warnings || [])];
    const localizeImages = Boolean(options.localizeImages || siteRule?.localizeImages);
    const diagnostics = {
      nodeCount: element?.querySelectorAll?.('*').length || 0,
      textLength: textLength(element),
      mode: options.mode || 'main',
      siteRule: source === '站点规则',
    };
    const result = await markdownFromElement(element, {
      ...options,
      removeImages: Boolean(options.removeImages || siteRule?.removeImages),
      template: options.template || siteRule?.template,
      title,
      source,
      warnings,
      localizeImages,
      diagnostics,
      pageContext,
    });
    return MarkClipContract.createClipResult({
      ...result,
      diagnostics: { ...diagnostics, ...(result.diagnostics || {}) },
      timings: {
        ...result.timings,
        extractMs: Math.round(now() - extractStartedAt),
        totalMs: Math.round(now() - totalStartedAt),
      },
    });
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
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
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
