importScripts('extension-utils.js');
importScripts('message-schema.js');

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!MarkClipMessages.isValidMessage(msg)) return false;
  if (msg.action === 'page2md:disableFloating') {
    (async () => {
      try {
        await Page2MDExtension.disableFloatingEverywhere();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message || '无法关闭悬浮按钮。' });
      }
    })();
    return true;
  }
  if (msg.action !== 'page2md:ensureLibraries') return false;

  (async () => {
    try {
      if (sender.tab?.id === undefined || sender.tab?.id === null) {
        throw new Error('No tab is available for library injection.');
      }
      await Page2MDExtension.ensureLibraries(sender.tab.id);
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, error: toFriendlyAccessError(err.message) });
    }
  })();

  return true;
});

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

  return message || '无法访问当前页面。';
}
