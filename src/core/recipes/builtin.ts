import type { RecipeDefinition } from './schema';

/** Conservative built-ins: match only well-known structural selectors and
 * always allow the extraction chain to fall back when a redesign removes it. */
export const BUILTIN_RECIPES: RecipeDefinition[] = [
  { id: 'github-repository', name: 'GitHub Repository', version: 1, priority: 100, matches: [{ host: 'github.com', pathRegex: '^/[^/]+/[^/]+$' }], capture: { selector: 'article.markdown-body', fallback: 'smart' }, exclude: ['nav', '.Box-header', '[aria-label="Edit and delete"]'], metadata: { siteName: { value: 'GitHub' }, tags: { values: ['github', 'repository'] } }, transform: { preserveTables: true, preserveCode: true, preserveCallouts: true, imageMode: 'remote' } },
  { id: 'wikipedia-article', name: 'Wikipedia Article', version: 1, priority: 80, matches: [{ hostPattern: '*.wikipedia.org', selectorPresent: '#mw-content-text' }], capture: { selector: '#mw-content-text', fallback: 'smart' }, exclude: ['.mw-editsection', '.navbox', '.metadata', '.reflist'], metadata: { siteName: { value: 'Wikipedia' } }, transform: { preserveTables: true, preserveCode: true, preserveCallouts: true, imageMode: 'remote' } },
  { id: 'medium-article', name: 'Medium Article', version: 1, priority: 60, matches: [{ hostPattern: '*.medium.com', selectorPresent: 'article' }], capture: { selector: 'article', fallback: 'smart' }, exclude: ['[data-testid="headerSocialShare"]'], metadata: {}, transform: { preserveTables: true, preserveCode: true, preserveCallouts: true, imageMode: 'remote' } },
];
