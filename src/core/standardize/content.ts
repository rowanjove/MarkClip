/** DOM-only canonicalization shared by all Markdown profiles. */
export function standardizeContent(root: HTMLElement, pageTitle?: string): HTMLElement {
  // Keep heading structure portable: empty anchor-only headings are noise and
  // large level jumps render poorly in readers. We only close jumps (never
  // rewrite a deliberate hierarchy backwards) and demote a duplicate title H1
  // when the page contains another real H1.
  const headings = [...root.querySelectorAll('h1,h2,h3,h4,h5,h6')] as HTMLElement[];
  for (const heading of headings) if (!(heading.textContent || '').trim()) heading.remove();
  let previousLevel = 0;
  // Extracted canonical roots are intentionally detached from the live page;
  // use subtree membership rather than `isConnected` so normalization also
  // applies to cloned/fixture documents.
  for (const heading of headings.filter((item) => root.contains(item))) {
    const currentLevel = Number(heading.nodeName.slice(1));
    if (previousLevel && currentLevel > previousLevel + 1) {
      const replacement = root.ownerDocument!.createElement(`h${Math.min(6, previousLevel + 1)}`);
      replacement.innerHTML = heading.innerHTML;
      [...heading.attributes].forEach((attribute) => replacement.setAttribute(attribute.name, attribute.value));
      heading.replaceWith(replacement);
      previousLevel += 1;
    } else previousLevel = currentLevel;
  }
  const liveHeadings = [...root.querySelectorAll('h1')] as HTMLElement[];
  if (liveHeadings.length > 1 && pageTitle) {
    const normalise = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    if (normalise(liveHeadings[0].textContent || '') === normalise(pageTitle)) {
      const replacement = root.ownerDocument!.createElement('h2');
      replacement.innerHTML = liveHeadings[0].innerHTML;
      [...liveHeadings[0].attributes].forEach((attribute) => replacement.setAttribute(attribute.name, attribute.value));
      liveHeadings[0].replaceWith(replacement);
    }
  }

  // Code blocks: remove visual line-number spans and carry the language in a
  // stable data attribute understood by Turndown and downstream consumers.
  root.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code') || (() => { const node = pre.ownerDocument!.createElement('code'); node.textContent = pre.textContent || ''; pre.replaceChildren(node); return node; })();
    code.querySelectorAll('[class*="line-number"], [class*="linenumber"], .gutter').forEach((node) => node.remove());
    const visualLines = [...code.querySelectorAll('.line,[data-line]')];
    if (visualLines.length > 1 && !code.querySelector('br')) code.textContent = visualLines.map((line) => line.textContent || '').join('\n');
    const classes = `${code.className} ${pre.className}`;
    const language = classes.match(/(?:language|lang|highlight-source)-([a-z0-9_+-]+)/i)?.[1] || code.getAttribute('data-lang') || pre.getAttribute('data-lang');
    if (language) code.setAttribute('data-yezai-language', language.toLowerCase());
  });

  // Normalize MathML/MathJax/KaTeX and legacy math/tex scripts to a small
  // declarative representation. No expression is evaluated.
  root.querySelectorAll('math, .math-inline, .math-display, .katex, .MathJax, script[type="math/tex"], script[type="math/tex; mode=display"]').forEach((node) => {
    if (node.getAttribute('data-yezai-math')) return;
    const raw = node.getAttribute('alttext') || node.getAttribute('aria-label') || node.querySelector('annotation[encoding="application/x-tex"], annotation')?.textContent || node.textContent || '';
    if (!raw.trim()) return;
    const display = node.nodeName.toLowerCase().includes('display') || /mode\s*=\s*display/i.test(node.getAttribute('type') || '') || node.getAttribute('display') === 'block' || node.matches('.math-display,[data-display="true"]');
    const replacement = root.ownerDocument!.createElement(display ? 'div' : 'span');
    replacement.setAttribute('data-yezai-math', replacement.nodeName === 'DIV' ? 'display' : 'inline');
    replacement.textContent = raw.trim();
    node.replaceWith(replacement);
  });

  // Common alert/callout conventions become one portable marker. The renderer
  // selects the profile-specific syntax later.
  root.querySelectorAll('aside, .alert, .callout, blockquote[data-callout], blockquote[class*="markdown-alert"], [role="alert"]').forEach((node) => {
    const element = node as HTMLElement;
    if (element.dataset.yezaiCallout) return;
    const classes = `${element.className} ${element.getAttribute('data-callout') || ''}`.toLowerCase();
    const kind = /warning|danger|error/.test(classes) ? 'warning' : /tip|success/.test(classes) ? 'tip' : /important/.test(classes) ? 'important' : 'note';
    element.dataset.yezaiCallout = kind;
  });

  // Footnote references are rewritten to stable IDs and definitions are
  // collected at the end, preserving text even when the source uses backlink
  // markup or nested list elements.
  const definitions = new Map<string, string>();
  root.querySelectorAll('a[href^="#fn"], a[href^="#footnote"], sup[id^="fnref"]').forEach((node) => {
    const anchor = node.matches('a') ? node as HTMLAnchorElement : node.querySelector('a') as HTMLAnchorElement | null;
    const href = anchor?.getAttribute('href') || '';
    const id = href.replace(/^#/, '') || node.id.replace(/^fnref-?/, '');
    if (!id) return;
    const wanted = new Set([id, id.replace(/^fnref-?/, 'fn'), `fn${id.replace(/^fn-?/, '')}`]);
    const target = [...root.querySelectorAll('[id]')].find((candidate) => wanted.has(candidate.id));
    const text = target?.textContent?.replace(/↩|return to text/gi, '').replace(/\s+/g, ' ').trim();
    if (text) definitions.set(id.replace(/^fn-?/, ''), text);
    const ref = root.ownerDocument!.createElement('span');
    ref.setAttribute('data-yezai-footnote-ref', id.replace(/^fn-?/, ''));
    ref.textContent = '';
    node.replaceWith(ref);
    target?.remove();
  });
  if (definitions.size) {
    const container = root.ownerDocument!.createElement('div');
    container.setAttribute('data-yezai-footnotes', 'true');
    for (const [id, text] of definitions) { const item = root.ownerDocument!.createElement('p'); item.setAttribute('data-footnote-id', id); item.textContent = text; container.append(item); }
    root.append(container);
  }
  return root;
}
