import { sleep } from '../utils/sleep.js';
import { injectPageAgent, agentCall, waitForDOMReady, waitForElement, detectNewTab } from '../worker/tab-manager.js';
import { typeViaDebugger } from '../worker/debugger-input.js';

export async function executeStep(step, tabId, llm) {
  switch (step.type) {
    case 'navigate':
      await chrome.tabs.update(tabId, { url: step.url });
      await waitForDOMReady(tabId, 8000);
      await injectPageAgent(tabId);
      await agentCall(tabId, 'dismissPopups');
      if (/bilibili/.test(step.url)) await waitForElement(tabId, '.nav-search-input', 8000);
      else if (/youtube/.test(step.url)) await waitForElement(tabId, 'input#search', 8000);
      break;

    case 'type':
      return await executeType(step, tabId, llm);

    case 'click':
      return await executeClick(step, tabId, llm);

    case 'pressKey':
      await agentCall(tabId, 'pressKey', -1, step.key || 'Enter');
      break;

    case 'scroll':
      await agentCall(tabId, 'scroll', step.direction || 'down', step.amount);
      break;

    case 'scrollTo':
      await agentCall(tabId, 'scrollTo', step.position || 'bottom');
      break;

    case 'scrollMultiple':
      await agentCall(tabId, 'scrollMultiple', step.times || 3, step.direction || 'down');
      break;

    case 'fillForm': {
      const fields = step.fields || [];
      if (!fields.length) throw new Error('No form fields specified');
      await agentCall(tabId, 'fillForm', fields);
      break;
    }

    case 'getText': {
      const text = await agentCall(tabId, 'getText', step.maxChars || 3000);
      console.log(`Page text (${text?.length || 0} chars): ${text?.substring(0, 200)}`);
      break;
    }

    case 'getPrices': {
      const prices = await agentCall(tabId, 'getPrices');
      console.log(`Found ${prices?.length || 0} prices:`, prices);
      break;
    }

    case 'analyze':
      return await executeAnalyze(step, tabId, llm);

    case 'play_video':
      return await executePlayVideo(step, tabId);

    case 'wait':
      await sleep((step.seconds || 2) * 1000);
      break;

    default:
      throw new Error(`Unknown step type: ${step.type}`);
  }
  return {};
}

async function executeType(step, tabId, llm) {
  await agentCall(tabId, 'dismissPopups');
  await sleep(200);

  if (step.target && /search|\u641c\u7d22|search box/i.test(step.target)) {
    await agentCall(tabId, 'typeInSearchBox', '');
    await sleep(300);
    await typeViaDebugger(tabId, step.value);
    await sleep(500);
    const newTabId = await detectNewTab(tabId, async () => {
      await agentCall(tabId, 'clickSearchButton');
    });
    if (newTabId !== null) {
      await injectPageAgent(newTabId);
      await waitForDOMReady(newTabId, 8000);
      return { newTabId };
    }
    await waitForDOMReady(tabId, 8000);
    await injectPageAgent(tabId);
    return {};
  }

  const snapshot = await agentCall(tabId, 'snapshot');
  const idx = await llm.findElement(step.target, snapshot);
  if (idx === -1) throw new Error(`Cannot find element: ${step.target}`);
  await agentCall(tabId, 'type', idx, step.value);
  return {};
}

async function executeClick(step, tabId, llm) {
  await agentCall(tabId, 'dismissPopups');
  await sleep(200);
  let idx = -1, clickAction = null;

  // Search button
  if (step.target && /search button|\u641c\u7d22\u6309\u94ae|submit/i.test(step.target)) {
    idx = await agentCall(tabId, 'findSearchButton');
    if (idx >= 0) {
      try { await agentCall(tabId, 'animClick', idx); } catch (e) {}
      await sleep(400);
      clickAction = () => agentCall(tabId, 'click', idx);
    }
  }

  // Bilibili first video
  if (step.target && /\u7b2c\u4e00\u4e2a\u89c6\u9891|first video|\u9996\u4e2a\u89c6\u9891/.test(step.target)) {
    const r = await agentCall(tabId, 'clickFirstBiliVideo');
    if (r?.success && r.url && /\/video\/BV[a-zA-Z0-9]{10}/.test(r.url)) {
      const nt = await detectNewTab(tabId, async () => {
        await chrome.tabs.update(tabId, { url: r.url });
      });
      if (nt !== null) {
        await injectPageAgent(nt);
        await waitForDOMReady(nt, 8000);
        return { newTabId: nt };
      }
      await waitForDOMReady(tabId, 8000);
      await injectPageAgent(tabId);
      return {};
    }
    // YouTube fallback
    const yt = await agentCall(tabId, 'clickFirstYouTubeVideo');
    if (yt?.success && yt.url) {
      const nt = await detectNewTab(tabId, async () => {
        await chrome.tabs.update(tabId, { url: yt.url });
      });
      if (nt !== null) {
        await injectPageAgent(nt);
        await waitForDOMReady(nt, 8000);
        return { newTabId: nt };
      }
      await waitForDOMReady(tabId, 8000);
      await injectPageAgent(tabId);
      return {};
    }
  }

  // First search result
  if (step.target && /search result|first|\u7b2c\u4e00\u4e2a\u7ed3\u679c|first result/i.test(step.target)) {
    idx = await agentCall(tabId, 'clickFirstResult');
    if (idx >= 0) clickAction = () => agentCall(tabId, 'click', idx);
  }

  // Fallback: LLM element finding
  if (idx === -1) {
    const snapshot = await agentCall(tabId, 'snapshot');
    idx = await llm.findElement(step.target, snapshot);
    if (idx >= 0) clickAction = () => agentCall(tabId, 'click', idx);
  }
  if (idx === -1) throw new Error(`Cannot find element: ${step.target}`);

  if (clickAction) {
    const nt = await detectNewTab(tabId, clickAction);
    if (nt !== null) {
      await injectPageAgent(nt);
      await waitForDOMReady(nt, 8000);
      return { newTabId: nt };
    }
  }
  return {};
}

async function executeAnalyze(step, tabId, llm) {
  await agentCall(tabId, 'dismissPopups');
  await sleep(500);
  const results = await agentCall(tabId, 'parseSearchResults');

  if (/first|\u7b2c\u4e00\u4e2a|\u9996\u4e2a/.test(step.goal || step.description)) {
    const idx = await agentCall(tabId, 'clickFirstResult');
    if (idx !== -1) {
      const nt = await detectNewTab(tabId, () => agentCall(tabId, 'click', idx));
      if (nt !== null) {
        await injectPageAgent(nt);
        return { newTabId: nt };
      }
      return {};
    }
  }

  const snapshot = await agentCall(tabId, 'snapshot');
  const action = await llm.analyzeAndDecide(snapshot, results, step.goal || step.description);
  if (action) {
    const sub = await executeStep(action, tabId, llm);
    if (sub?.newTabId) return sub;
  }
  return {};
}

async function executePlayVideo(step, tabId) {
  const result = await agentCall(tabId, 'playVideo');
  if (!result?.success) {
    const vi = await agentCall(tabId, 'findVideo');
    if (vi?.playButtons?.length > 0) await agentCall(tabId, 'click', 0);
  }
  return {};
}
