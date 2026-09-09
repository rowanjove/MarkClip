import type { RecipeDefinition, RecipeMatch } from './schema';

function hostMatches(hostname: string, pattern?: string): boolean {
  if (!pattern) return true;
  const normalized = pattern.toLowerCase().replace(/^\*\./, '');
  return hostname.toLowerCase() === normalized || hostname.toLowerCase().endsWith(`.${normalized}`);
}

function pathMatches(pathname: string, condition: RecipeMatch): boolean {
  if (condition.path && condition.path !== pathname) return false;
  if (condition.pathRegex) {
    try { if (!new RegExp(condition.pathRegex).test(pathname)) return false; } catch { return false; }
  }
  return true;
}

export function recipeMatches(recipe: RecipeDefinition, document: Document, url = document.location?.href || ''): boolean {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  return recipe.matches.some((condition) => {
    try {
      if (!condition || typeof condition !== 'object') return false;
      if (!hostMatches(parsed.hostname, condition.host ?? condition.hostPattern)) return false;
      if (!pathMatches(parsed.pathname, condition)) return false;
      if (condition.query && typeof condition.query === 'object') for (const [key, value] of Object.entries(condition.query)) if (parsed.searchParams.get(key) !== value) return false;
      if (condition.selectorPresent && !document.querySelector(condition.selectorPresent)) return false;
      if (condition.metaPresent) {
        const escaped = condition.metaPresent.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        if (!document.querySelector(`meta[name="${escaped}"],meta[property="${escaped}"]`)) return false;
      }
      return true;
    } catch { return false; }
  });
}

export function selectRecipe(recipes: RecipeDefinition[], document: Document, url?: string): RecipeDefinition | null {
  return [...recipes].sort((left, right) => right.priority - left.priority).find((recipe) => recipeMatches(recipe, document, url)) ?? null;
}
