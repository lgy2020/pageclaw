import { sleep } from '../utils/sleep.js';
import { injectPageAgent, agentCall, agentShowToast } from '../worker/tab-manager.js';
import { executeStep } from './executor.js';

let currentTask = null;

export function getCurrentTask() {
  return currentTask;
}

export function stopCurrentTask() {
  if (currentTask) {
    currentTask.abort.abort();
    agentShowToast(currentTask.tabId, '\u23F9\uFE0F \u5DF2\u53D6\u6D88').catch(() => {});
    currentTask = null;
  }
}

export async function executeAITask(instruction, tabId, llm) {
  const abort = new AbortController();
  currentTask = { abort, tabId };

  try {
    // Get page context
    let pageInfo = null;
    try {
      await injectPageAgent(tabId);
      pageInfo = await agentCall(tabId, 'getPageInfo');
    } catch (e) {}

    // Show animation overlay
    try { await agentCall(tabId, 'showOverlay'); } catch (e) {}

    await agentShowToast(tabId, '\u{1F9E0} \u6B63\u5728\u7406\u89E3...');
    const plan = await llm.plan(instruction, pageInfo);

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

    for (let i = 0; i < validPlan.length; i++) {
      if (abort.signal.aborted) {
        await agentShowToast(tabId, '\u23F9\uFE0F \u5DF2\u53D6\u6D88');
        return;
      }
      const step = validPlan[i];
      await injectPageAgent(tabId);
      await agentShowToast(tabId, `\u{1F504} [${i + 1}/${validPlan.length}] ${step.description}`);
      const result = await executeStep(step, tabId, llm);
      await agentCall(tabId, 'highlightElements');

      if (result?.newTabId) {
        tabId = result.newTabId;
        await injectPageAgent(tabId);
        await agentCall(tabId, 'highlightElements');
      }
      await sleep(300);
    }

    await agentShowToast(tabId, '\u{1F389} \u5B8C\u6210\uFF01');
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
  }
}
