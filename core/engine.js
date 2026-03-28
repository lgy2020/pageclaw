import { sleep } from '../utils/sleep.js';
import { injectPageAgent, agentCall, agentShowToast } from '../worker/tab-manager.js';
import { executeStep, executeStepWithRetry } from './executor.js';
import { ConversationHistory } from './history.js';
import { classifyError, getSuggestion, RecoveryError } from './recovery.js';

var currentTask = null;

// Plan cache: site + instruction → plan array (LRU, max 50)
var planCache = new Map();
var PLAN_CACHE_MAX = 50;

// Conversation history (per-tab)
var history = new ConversationHistory();
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
    var pageInfo = null;
    try {
      await injectPageAgent(tabId);
      pageInfo = await agentCall(tabId, 'getPageInfo');
    } catch (e) {}

    // Try plan cache first
    var cacheKey = getPlanCacheKey(pageInfo, instruction);
    var plan = planCache.get(cacheKey);

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

    var validTypes = [
      'navigate', 'type', 'click', 'pressKey', 'wait', 'analyze',
      'play_video', 'scroll', 'scrollTo', 'scrollMultiple',
      'fillForm', 'getText', 'getPrices'
    ];
    var validPlan = plan.filter(s => s?.type && validTypes.includes(s.type));

    if (!validPlan.length) {
      validPlan.push(
        { type: 'navigate', url: 'https://www.google.com', description: 'Open Google' },
        { type: 'type', target: 'search box', value: instruction, description: 'Type query' },
        { type: 'pressKey', key: 'Enter', description: 'Search' }
      );
    }

    await agentShowToast(tabId, `\u{1F4CB} \u5171 ${validPlan.length} \u6B65`);

    var stepDescs = validPlan.map(function(s) { return s.description; });
    try { await agentCall(tabId, 'initSteps', stepDescs); } catch (e) { console.warn('initSteps failed:', e); }

    var replanCount = 0;
    var failedSteps = [];
    var stepRetryCount = {};

    for (var i = 0; i < validPlan.length; i++) {
      if (abort.signal.aborted) {
        await agentShowToast(tabId, '\u23F9\uFE0F \u5DF2\u53D6\u6D88');
        return;
      }
      var step = validPlan[i];
      step.index = i;
      await injectPageAgent(tabId);
      // Re-init step list every iteration (handles page refreshes on same tab)
      try { await agentCall(tabId, 'initSteps', stepDescs); } catch (e) {}
      await agentShowToast(tabId, `\u{1F504} [${i + 1}/${validPlan.length}] ${step.description}`);

      try {
        var result = await executeStepWithRetry(step, tabId, llm, 3);
      } catch (err) {
        var failureType = classifyError(err);
        // Show failure summary card
        try {
          await agentCall(tabId, 'markStepFailed', i);
          await agentCall(tabId, 'showFailureSummary', {
            stepName: step.description,
            failureType: failureType,
            reason: err.message,
            suggestion: getSuggestion(failureType)
          });
        } catch (e) {}
        failedSteps.push({ step: step.description, failureType: failureType, reason: err.message });

        // Dynamic replanning (P1): max 2 replans
        if (replanCount < 2) {
          replanCount++;
          try { await agentCall(tabId, 'showReplanning'); } catch (e) {}
          await agentShowToast(tabId, '\u267B\uFE0F \u91CD\u65B0\u89C4\u5212\u4E2D...');

          var remainingSteps = validPlan.slice(i + 1);
          var failContext = {
            failedStep: step.description,
            failureType: failureType,
            reason: err.message,
            completedSteps: validPlan.slice(0, i).map(function(s) { return s.description; }),
            currentUrl: ''
          };
          try {
            var snap = await agentCall(tabId, 'getPageInfo');
            failContext.currentUrl = snap?.url || '';
          } catch (e) {}

          try {
            var safePageInfo = pageInfo || { url: '', title: '', site: 'unknown' };
            var newPlan = await llm.replan(instruction, safePageInfo, failContext, remainingSteps, history.formatForLLM(tabId));
            if (newPlan?.length) {
              // Rebuild plan from current position
              validPlan = validPlan.slice(0, i).concat(newPlan);
              stepDescs = validPlan.map(function(s) { return s.description; });
              try { await agentCall(tabId, 'initSteps', stepDescs); } catch (e) {}
              // Track step retry count to avoid infinite replan loop
              stepRetryCount[i] = (stepRetryCount[i] || 0) + 1;
              if (stepRetryCount[i] > 2) {
                // Too many replans for this step, skip it
                console.warn('[PageClaw] Step ' + i + ' exceeded replan limit, skipping');
                await sleep(300);
                continue;
              }
              // Decrement i so the loop continues from the current position
              // Clean up failure summary before continuing
              try { await agentCall(tabId, '_removeFailureSummary'); } catch (e) {}
              i--;
              await sleep(500);
              continue;
            }
          } catch (replanErr) {
            console.error('[PageClaw] Replanning failed:', replanErr);
          }
        }

        // No more replans or replanning failed — re-throw
        throw err;
      }

      await agentCall(tabId, 'highlightElements');

      if (result?.newTabId) {
        tabId = result.newTabId;
        if (currentTask) currentTask.tabId = tabId;
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

    // Show failure summary if there were recovered failures
    if (failedSteps.length > 0) {
      await agentShowToast(tabId, '\u{1F389} \u5B8C\u6210\uFF08\u5DF2\u81EA\u52A8\u6062\u590D ' + failedSteps.length + ' \u4E2A\u95EE\u9898\uFF09');
    } else {
      await agentShowToast(tabId, '\u{1F389} \u5B8C\u6210\uFF01');
    }

    // Store turn in conversation history
    try {
      var pageSnap = pageInfo ? { url: pageInfo.url || '', title: pageInfo.title || '' } : { url: '', title: '' };
      history.addTurn(tabId, instruction, validPlan, failedSteps, pageSnap);
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
