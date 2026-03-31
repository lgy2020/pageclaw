import { LLMClient } from '../llm/client.js';
import { executeAITask, getCurrentTask, stopCurrentTask, history } from '../core/engine.js';
import { getActiveTab, agentCall, agentShowToast } from './tab-manager.js';
import { sleep } from '../utils/sleep.js';

// Clear stale task flag on startup (in case of previous crash)
chrome.storage.session.set({ taskRunning: false });

// ============================================================
// 1. Omnibox
// ============================================================

chrome.omnibox.onInputStarted.addListener(() => console.log('AI Agent activated'));

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  const input = text.trim() || 'Tell me what to do';
  suggest([
    { content: input, description: `\u{1F916} AI does it: ${input}` },
    { content: `search:${input}`, description: `\u{1F50D} Regular search: ${input}` }
  ]);
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  if (!text.trim()) return;
  if (text.startsWith('search:')) {
    const url = `https://www.google.com/search?q=${encodeURIComponent(text.slice(7))}`;
    if (disposition === 'currentTab') await chrome.tabs.update((await getActiveTab()).id, { url });
    else await chrome.tabs.create({ url, active: disposition === 'newForegroundTab' });
    return;
  }

  let tabId;
  if (disposition === 'currentTab') tabId = (await getActiveTab()).id;
  else {
    const tab = await chrome.tabs.create({ url: 'about:blank', active: disposition === 'newForegroundTab' });
    tabId = tab.id;
  }
  await saveToHistory(text.trim());

  // Mark task as running immediately (before LLM call, so overlay shows early)
  chrome.storage.session.set({ taskRunning: true });

  const config = await chrome.storage.local.get(['apiKey', 'model', 'baseUrl']);
  if (!config.apiKey) {
    chrome.storage.session.set({ taskRunning: false });
    await agentShowToast(tabId, '\u274C Please configure your API Key first (click extension icon \u2192 Options)');
    chrome.runtime.openOptionsPage();
    return;
  }
  const llm = new LLMClient(
    config.apiKey,
    config.model || 'google/gemini-2.0-flash',
    config.baseUrl || 'https://openrouter.ai/api/v1'
  );
  await executeAITask(text.trim(), tabId, llm);
});

// ============================================================
// 2. Messages
// ============================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TEST_CONNECTION') {
    testLLMConnection(msg.config).then(sendResponse);
    return true;
  }
  if (msg.type === 'STOP_TASK') {
    stopCurrentTask();
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'GET_STATUS') {
    sendResponse({ isRunning: !!getCurrentTask() });
    return true;
  }
  if (msg.type === 'GET_HISTORY') {
    chrome.storage.local.get(['commandHistory']).then(d =>
      sendResponse({ history: d.commandHistory || [] })
    );
    return true;
  }
  if (msg.type === 'CLEAR_HISTORY') {
    chrome.storage.local.set({ commandHistory: [] }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === 'POST_START_TASK') {
    if (!msg.command || !msg.command.trim()) {
      sendResponse({ ok: false, error: 'Empty command' });
      return true;
    }
    (async () => {
      try {
        const tab = await getActiveTab();
        const tabId = tab.id;
        await chrome.storage.local.get(['commandHistory']).then(d => {
          const hist = d.commandHistory || [];
          hist.unshift({ command: msg.command.trim(), timestamp: Date.now(), id: Date.now().toString(36) });
          return chrome.storage.local.set({ commandHistory: hist.slice(0, 50) });
        });
        chrome.storage.session.set({ taskRunning: true });
        const config = await chrome.storage.local.get(['apiKey', 'model', 'baseUrl']);
        if (!config.apiKey) {
          chrome.storage.session.set({ taskRunning: false });
          sendResponse({ ok: false, error: 'No API key' });
          chrome.runtime.openOptionsPage();
          return;
        }
        const llm = new LLMClient(
          config.apiKey,
          config.model || 'google/gemini-2.0-flash',
          config.baseUrl || 'https://openrouter.ai/api/v1'
        );
        sendResponse({ ok: true });
        await executeAITask(msg.command.trim(), tabId, llm);
      } catch (err) {
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true;
  }
  if (msg.type === 'GENERATE_TEMPLATE_TITLE') {
    if (!msg.command) {
      sendResponse({ icon: '📋', title: '自定义', desc: msg.command || '' });
      return true;
    }
    (async () => {
      try {
        const config = await chrome.storage.local.get(['apiKey', 'model', 'baseUrl']);
        if (!config.apiKey) {
          sendResponse({ icon: '📋', title: '自定义', desc: truncate(msg.command, 12) });
          return;
        }
        const llm = new LLMClient(
          config.apiKey,
          config.model || 'google/gemini-2.0-flash',
          config.baseUrl || 'https://openrouter.ai/api/v1'
        );
        const systemPrompt = '你是模板卡片生成器。根据用户的浏览器自动化指令，返回纯JSON：{"icon":"一个emoji","title":"4字标题","desc":"8字内描述"}。不要多余文字。';
        const text = await llm.call(systemPrompt, msg.command);
        const match = text.match(/\{[^}]+\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          sendResponse({
            icon: parsed.icon || '📋',
            title: (parsed.title || '自定义').substring(0, 6),
            desc: (parsed.desc || '').substring(0, 10)
          });
        } else {
          sendResponse({ icon: '📋', title: '自定义', desc: truncate(msg.command, 12) });
        }
      } catch (err) {
        sendResponse({ icon: '📋', title: '自定义', desc: truncate(msg.command, 12) });
      }
    })();
    return true;
  }
});

// ============================================================
// 3. Web Navigation — re-inject overlay on every page load during task
// ============================================================

const INJECT_OVERLAY_FUNC = () => {
  if (document.getElementById('__pc_quick')) return;
  const el = document.createElement('div');
  el.id = '__pc_quick';
  el.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;pointer-events:none;' +
    'border:3px solid #7c4dff;box-shadow:inset 0 0 30px rgba(124,77,255,0.3);' +
    'border-radius:4px;transition:border-color .5s,box-shadow .5s;';
  (document.body || document.documentElement).appendChild(el);
};

chrome.webNavigation.onCommitted.addListener(async (details) => {
  // Only main frame navigations
  if (details.frameId !== 0) return;
  const { taskRunning } = await chrome.storage.session.get('taskRunning');
  if (!taskRunning) return;
  // Inject CSS border as early as possible (works even before DOM is ready)
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: details.tabId },
      css: `
        #__pc_quick {
          position:fixed;inset:0;z-index:2147483647;pointer-events:none;
          border:3px solid #7c4dff;box-shadow:inset 0 0 30px rgba(124,77,255,0.3);
          border-radius:4px;transition:border-color .5s,box-shadow .5s;
        }
      `
    });
  } catch {}
});

chrome.webNavigation.onDOMContentLoaded.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const { taskRunning } = await chrome.storage.session.get('taskRunning');
  if (!taskRunning) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      func: INJECT_OVERLAY_FUNC
    });
  } catch {}
});

// Also detect SPA navigations (Bilibili, YouTube, etc.)
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const { taskRunning } = await chrome.storage.session.get('taskRunning');
  if (!taskRunning) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      func: INJECT_OVERLAY_FUNC
    });
  } catch {}
});

// ============================================================
// 3. History — message handlers
// ============================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only handle messages from content scripts (sender.tab exists)
  if (!sender.tab) return;

  if (msg.type === 'GET_HISTORY') {
    const tabId = sender.tab?.id;
    if (tabId) sendResponse({ history: history.getAll(tabId) });
    else sendResponse({ history: [] });
    return true;
  }
  if (msg.type === 'CLEAR_HISTORY') {
    const tabId = sender.tab?.id;
    if (tabId) history.clearHistory(tabId);
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'EXPORT_HISTORY') {
    const tabId = sender.tab?.id;
    sendResponse({ json: tabId ? history.exportJSON(tabId) : '[]' });
    return true;
  }
});

// Clean up history when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  history.removeTab(tabId);
});

async function testLLMConnection(config) {
  try {
    const r = await fetch(`${config.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` }
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function truncate(str, len) {
  return str.length > len ? str.substring(0, len) + '...' : str;
}

async function saveToHistory(instruction) {
  const d = await chrome.storage.local.get(['commandHistory']);
  const h = (d.commandHistory || []).filter(x => {
    if (typeof x === 'string') return x !== instruction;
    return x.command !== instruction;
  });
  h.unshift({ command: instruction, timestamp: Date.now(), id: Date.now().toString(36) });
  await chrome.storage.local.set({ commandHistory: h.slice(0, 20) });
}
