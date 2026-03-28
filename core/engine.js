import { sleep } from '../utils/sleep.js';
import { injectPageAgent, agentCall, agentShowToast } from '../worker/tab-manager.js';
import { executeStep } from './executor.js';
import { ConversationHistory } from './history.js';

let currentTask = null;

// Plan cache: site + instruction → plan array (LRU, max 50)
const planCache = new Map();
const PLAN_CACHE_MAX = 50;

// Conversation history (per-tab)
const history = new ConversationHistory();
export { history };

function getPlanCacheKey(pageInfo, instruction) {
  return `${pageInfo?.site || '_'}|||${instruction.toLowerCase().trim()}`;
}

/**
 * Immediately show a border glow overlay without waiting for page-bundle injection.
 * The full animation system (agent.js) will take over once page-bundle loads.
 */
async function showOverlayFast(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (document.getElementById('__pc_quick')) return;
        const el = document.createElement('div');
        el.id = '__pc_quick';
        el.style.cssText =
          'position:fixed;inset:0;z-index:2147483647;pointer-events:none;'
          + 'border:3px solid #7c4dff;box-shadow:inset 0 0 30px rgba(124,77,255,0.3);'
          + 'border-radius:4px;transition:border-color .5s,box-shadow .5s;';
        (document.body || document.documentElement).appendChild(el);
      },
    });
  } catch {}
}

export function getCurrentTask() {
  return currentTask;
}

export function stopCurrentTask() {
  if (currentTask) {
    currentTask.abort.abort();
    agentShowToast(currentTask.tabId, '\u23F9\uFE0F \u5DF2\u53D6\u6D88').catch(() => {});
    currentTask = null;
    chrome.storage.session.set({ taskRunning: false });
  }
}

export async function executeAITask(instruction, tabId, llm) {
  const abort = new AbortController();
  currentTask = { abort, tabId };
  chrome.storage.session.set({ taskRunning: true });

  try {
    // Show immediate visual feedback before heavy injection
    await showOverlayFast(tabId);

    // Get page context
    let pageInfo = null;
    try {
      await injectPageAgent(tabId);
      pageInfo = await agentCall(tabId, 'getPageInfo');
    } catch (e) {}

    // Try plan cache first
    const cacheKey = getPlanCacheKey(pageInfo, instruction);
    let plan = planCache.get(cacheKey);

    if (plan) {
      // LRU: re-insert to move to end
      planCache.delete(cacheKey);
      planCache.set(cacheKey, plan);
    } else {
      await agentShowToast(tabId, '\u{1F9E0} \u6B63\u5728\u7406\u89E3...');
      plan = await llm.plan(instruction, pageInfo, history.formatForLLM(tabId));

      if (plan?.length) {
        // Evict oldest if at capacity
        if (planCache.size >= PLAN_CACHE_MAX) {
          planCache.delete(planCache.keys().next().value);
        }
        planCache.set(cacheKey, plan);
      }
    }

    if (!plan?.length) {
      await agentShowToast(tabId, '\u274C \u65E0\u6CD5\u7406\u89E3\uFF0C\u8BF7\u6362\u79CD\u8BF4\u6CD5\u8BD5\u8BD5');
      try { await agentCall(tabId, 'hideOverlay'); } catch (e) {}
      return;
    }

    const validTypes = [
      'navigate', 'type', 'click', 'pressKey', 'wait', 'analyze',
      'play_video', 'scroll', 'scrollTo', 'scrollMultiple',
      'fillForm', 'getText', 'getPrices'
    ];
    const validPlan = plan.filter(s => s?.type && validTypes.includes(s.type));

    if (!validPlan.length) {
      validPlan.push(
        { type: 'navigate', url: 'https://www.google.com', description: 'Open Google' },
        { type: 'type', target: 'search box', value: instruction, description: 'Type query' },
        { type: 'pressKey', key: 'Enter', description: 'Search' }
      );
    }

    await agentShowToast(tabId, `\u{1F4CB} \u5171 ${validPlan.length} \u6B65`);

    const stepDescs = validPlan.map(s => s.description);
    try { await agentCall(tabId, 'initSteps', stepDescs); } catch (e) { console.warn('initSteps failed:', e); }

    for (let i = 0; i < validPlan.length; i++) {
      if (abort.signal.aborted) {
        await agentShowToast(tabId, '\u23F9\uFE0F \u5DF2\u53D6\u6D88');
        return;
      }
      const step = validPlan[i];
      await injectPageAgent(tabId);
      // Re-init step list every iteration (handles page refreshes on same tab)
      try { await agentCall(tabId, 'initSteps', stepDescs); } catch (e) {}
      await agentShowToast(tabId, `\u{1F504} [${i + 1}/${validPlan.length}] ${step.description}`);
      const result = await executeStep(step, tabId, llm);
      await agentCall(tabId, 'highlightElements');

      if (result?.newTabId) {
        tabId = result.newTabId;
        await injectPageAgent(tabId);
        // Re-init step list on the new page
        try {
          await agentCall(tabId, 'initSteps', stepDescs);
          await agentCall(tabId, 'updateStatus', step.description, i + 1, validPlan.length);
        } catch (e) {}
        await agentCall(tabId, 'highlightElements');
      }
      await sleep(300);
    }

    await agentShowToast(tabId, '\u{1F389} \u5B8C\u6210\uFF01');

    // Store turn in conversation history
    try {
      const pageSnap = pageInfo ? { url: pageInfo.url || '', title: pageInfo.title || '' } : { url: '', title: '' };
      history.addTurn(tabId, instruction, validPlan, [], pageSnap);
    } catch {}
  } catch (err) {
    if (err.name === 'AbortError' || abort.signal.aborted) {
      await agentShowToast(tabId, '\u23F9\uFE0F \u5DF2\u53D6\u6D88');
    } else {
      console.error('AI Agent error:', err);
      await agentShowToast(tabId, `\u274C ${err.message}`);
    }
  } finally {
    try {
      await agentCall(currentTask?.tabId || tabId, 'hideOverlay');
    } catch (e) {}
    currentTask = null;
    chrome.storage.session.set({ taskRunning: false });
  }
}
