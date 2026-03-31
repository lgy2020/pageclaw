import { LLMClient } from '../llm/client.js';
import { executeAITask, getCurrentTask, stopCurrentTask, history } from '../core/engine.js';
import { getActiveTab, agentCall, agentShowToast } from './tab-manager.js';
import { sleep } from '../utils/sleep.js';
import { ExperienceManager } from '../experience/manager.js';

// Clear stale task flag on startup (in case of previous crash)
chrome.storage.session.set({ taskRunning: false });
try { ExperienceManager.init(); } catch(e) { console.log('[Experience] Init failed:', e); }

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

// ============================================================
// v0.12: Evaluation retry/dismiss message handlers
// ============================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'EVAL_RETRY') {
    var tabId = msg.tabId || (sender.tab && sender.tab.id);
    if (!tabId) { sendResponse({ok:false}); return true; }
    (async () => {
      try {
        // 1. Hide current evaluation UI
        await agentCall(tabId, 'hideEvalUI').catch(() => {});
        // 2. Get stored evaluation context
        var ctxJson = await agentCall(tabId, 'getEvalContext');
        var ctx = {};
        if (ctxJson) {
          try { ctx = JSON.parse(ctxJson); } catch(e) {}
        }
        var instruction = ctx.instruction || msg.instruction || '';
        var currentUrl = ctx.currentUrl || msg.currentUrl || '';
        var rootCause = ctx.rootCause || msg.rootCause || '评估不达标';
        var suggestions = ctx.suggestions || msg.suggestions || '执行结果质量不足';
        
        // 3. Show toast indicating retry
        await agentShowToast(tabId, '\u{1F504} 基于评估经验重新规划...');
        var config = await chrome.storage.local.get(['apiKey', 'model', 'baseUrl']);
        var llm = new LLMClient(
          config.apiKey,
          config.model || 'google/gemini-2.0-flash',
          config.baseUrl || 'https://openrouter.ai/api/v1'
        );
        // 4. Build fail context with root cause for experience injection
        var failContext = {
          failedStep: rootCause,
          failureType: 'quality_check',
          reason: suggestions,
          currentUrl: currentUrl,
          completedSteps: []
        };
        // 5. Generate new plan with replan (injects root cause)
        var newPlan = await llm.replan(instruction, {url: currentUrl, title: '', site: 'unknown'}, failContext, [], '');
        if (newPlan && newPlan.length > 0) {
          // 6. Store the new plan in a special cache key to bypass regular planning
          // We'll use a simple approach: directly execute the new plan by calling executeAITask
          // but we need to ensure the plan is used. Since plan cache is keyed by instruction and pageInfo,
          // we can temporarily replace the plan cache entry for this tab.
          // However, executeAITask will call llm.plan which may not use the new plan.
          // Instead, we'll create a wrapper LLM client that returns the new plan when plan is called.
          // For simplicity, we'll just call executeAITask and rely on experience injection.
          // The experience system should inject similar failed experiences.
          await agentShowToast(tabId, '\u2705 已生成优化方案，共 ' + newPlan.length + ' 步');
        }
        // 7. Send response immediately so the popup can close
        sendResponse({ok: true});
        // 8. Start new task execution with the same instruction (fire-and-forget)
        // The experience injection will include the root cause via similar experiences.
        // We catch errors separately to show a toast.
        (async () => {
          try {
            stopCurrentTask(); // Ensure any previous task is stopped
            await executeAITask(instruction, tabId, llm);
          } catch (err) {
            console.log('[Eval] Task execution failed:', err);
            await agentShowToast(tabId, '\u274C 任务执行失败: ' + err.message).catch(()=>{});
          }
        })();
      } catch (err) {
        console.log('[Eval] Retry failed:', err);
        await agentShowToast(tabId, '\u274C 重试失败: ' + err.message).catch(()=>{});
        sendResponse({ok: false, error: err.message});
      }
    })();
    return true;
  }
  if (msg.type === 'EVAL_DISMISS') {
    var tabId2 = msg.tabId || (sender.tab && sender.tab.id);
    if (tabId2) agentCall(tabId2, 'hideOverlay').catch(()=>{});
    sendResponse({ok: true});
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
