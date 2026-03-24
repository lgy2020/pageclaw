import { sleep } from '../utils/sleep.js';

export async function waitForDOMReady(tabId, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = await agentCall(tabId, 'getReadyState');
    if (state === 'interactive' || state === 'complete') return true;
    await sleep(200);
  }
  return false;
}

export async function waitForElement(tabId, selector, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const exists = await agentCall(tabId, '_hasElement', selector);
    if (exists) return true;
    await sleep(300);
  }
  return false;
}

export async function waitForLoad(tabId, timeout = 15000) {
  return new Promise(resolve => {
    let done = false;
    const ok = () => { if (!done) { done = true; resolve(); } };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        ok();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); ok(); }, timeout);
  });
}

export async function waitForSelector(tabId, selector, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await agentCall(tabId, '_hasElement', selector)) return true;
    await sleep(500);
  }
  return false;
}

export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const PAGE_MODULES = [
  'page/constants.js',
  'page/dom-engine.js',
  'page/element-ops.js',
  'page/page-info.js',
  'page/animation.js',
  'page/agent.js',
];

export async function injectPageAgent(tabId) {
  try {
    // Check if already injected on this tab
    const [check] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!window.__aiAgent,
    });
    if (check?.result) return;

    // Inject all page modules in order (var allows safe re-injection)
    for (const file of PAGE_MODULES) {
      await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
    }
  } catch (e) {
    console.error('injectPageAgent failed:', e);
  }
}

export async function agentCall(tabId, method, ...args) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (m, a) => {
        const agent = window.__aiAgent;
        if (!agent || typeof agent[m] !== 'function') return null;
        return agent[m](...a);
      },
      args: [method, args]
    });
    return results[0]?.result;
  } catch (e) {
    if (e.message && /XML|parser error|internal-suggestion/.test(e.message)) return null;
    console.error(`agentCall(${method}) failed:`, e);
    return null;
  }
}

export async function agentShowToast(tabId, text) {
  try {
    let state = 'executing';
    if (text.includes('\u{1F9E0}')) state = 'thinking';
    if (text.includes('\u2728') || text.includes('\u{1F389}')) state = 'success';
    if (text.includes('\u274C') || text.includes('\u23F9')) state = 'error';

    let desc = text, cur = 0, tot = 0;
    const m = text.match(/\u{1F504}\s*\[(\d+)\/(\d+)\]\s*(.+)/u);
    if (m) { cur = +m[1]; tot = +m[2]; desc = m[3]; }
    else if (text.includes('\u{1F389}')) { desc = 'Done!'; }
    else if (text.includes('\u274C')) { desc = text.replace(/\u274C\s*/, '').trim(); }
    else if (text.includes('\u23F9')) { desc = 'Cancelled'; }
    else if (text.includes('\u{1F4CB}')) {
      const pm = text.match(/(\d+)/);
      if (pm) { tot = +pm[1]; desc = text; }
    }

    await agentCall(tabId, 'updateStatus', desc, cur, tot);
    await agentCall(tabId, 'setGlowState', state);

    if (state === 'success' || state === 'error') {
      setTimeout(async () => {
        try { await agentCall(tabId, 'hideOverlay'); } catch (e) {}
      }, state === 'success' ? 2000 : 4000);
    }
  } catch (e) {}
}

export async function detectNewTab(originalTabId, actionFn) {
  const before = new Set((await chrome.tabs.query({})).map(t => t.id));
  await actionFn();
  for (let i = 0; i < 10; i++) {
    await sleep(300);
    const newTabs = (await chrome.tabs.query({})).filter(t => !before.has(t.id));
    if (newTabs.length > 0) {
      console.log(`New tab: id=${newTabs[0].id} url=${newTabs[0].url}`);
      return newTabs[0].id;
    }
  }
  return null;
}
