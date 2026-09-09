import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';

export default defineUnlistedScript(() => {
  if (document.getElementById('yezai-floating-entry')) return;
  const button = document.createElement('button');
  button.id = 'yezai-floating-entry'; button.type = 'button'; button.textContent = '页摘'; button.title = '保存当前网页为 Markdown'; button.setAttribute('aria-label', '保存当前网页为 Markdown');
  button.style.cssText = 'position:fixed;z-index:2147483646;right:18px;bottom:18px;border:1px solid #b9d2bd;border-radius:999px;padding:9px 13px;background:#183526;color:#fff;box-shadow:0 3px 14px #0004;font:600 13px system-ui;cursor:pointer';
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = '处理中…';
    try {
      const handler = (globalThis as { __yezaiPerformCapture?: (message: Record<string, any>) => Promise<void> }).__yezaiPerformCapture;
      if (handler) {
        await handler({ mode: 'main', after: 'download' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '保存失败');
      button.title = message; button.setAttribute('aria-label', message); button.textContent = '失败';
    } finally {
      setTimeout(() => {
        if (button.isConnected) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          button.title = '保存当前网页为 Markdown'; button.setAttribute('aria-label', '保存当前网页为 Markdown');
          button.textContent = '页摘';
        }
      }, 1500);
    }
  });
  document.documentElement.append(button);
});
