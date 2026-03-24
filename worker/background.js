import { LLMClient } from '../llm/client.js';
import { executeAITask, getCurrentTask, stopCurrentTask } from '../core/engine.js';
import { getActiveTab, agentCall, agentShowToast } from './tab-manager.js';
import { sleep } from '../utils/sleep.js';

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

  const config = await chrome.storage.local.get(['apiKey', 'model', 'baseUrl']);
  if (!config.apiKey) {
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
    sendResponse({ running: !!getCurrentTask() });
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

async function saveToHistory(instruction) {
  const d = await chrome.storage.local.get(['commandHistory']);
  const h = (d.commandHistory || []).filter(x => x !== instruction);
  h.unshift(instruction);
  await chrome.storage.local.set({ commandHistory: h.slice(0, 20) });
}
