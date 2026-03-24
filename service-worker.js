// service-worker.js — AI Browser Agent Core Engine
// ============================================================

// State
let currentTask = null;

// ============================================================
// 1. Omnibox
// ============================================================

chrome.omnibox.onInputStarted.addListener(() => console.log('AI Agent activated'));
chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  const input = text.trim() || 'Tell me what to do';
  suggest([
    { content: input, description: `🤖 AI does it: ${input}` },
    { content: `search:${input}`, description: `🔍 Regular search: ${input}` }
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
  else { const tab = await chrome.tabs.create({ url: 'about:blank', active: disposition === 'newForegroundTab' }); tabId = tab.id; }
  await saveToHistory(text.trim());
  await executeAITask(text.trim(), tabId);
});

// ============================================================
// 2. Messages
// ============================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TEST_CONNECTION') { testLLMConnection(msg.config).then(sendResponse); return true; }
  if (msg.type === 'STOP_TASK') { if (currentTask) { currentTask.abort.abort(); agentShowToast(currentTask.tabId, '⏹️ 已取消').catch(()=>{}); currentTask = null; } sendResponse({ok:true}); return true; }
  if (msg.type === 'GET_STATUS') { sendResponse({running: !!currentTask}); return true; }
  if (msg.type === 'GET_HISTORY') { chrome.storage.local.get(['commandHistory']).then(d => sendResponse({history: d.commandHistory||[]})); return true; }
  if (msg.type === 'CLEAR_HISTORY') { chrome.storage.local.set({commandHistory:[]}).then(()=>sendResponse({ok:true})); return true; }
});

async function testLLMConnection(config) {
  try { const r = await fetch(`${config.baseUrl}/models`, { headers: { Authorization: `Bearer ${config.apiKey}` } }); return { ok: r.ok, status: r.status }; }
  catch (e) { return { ok: false, error: e.message }; }
}

async function saveToHistory(instruction) {
  const d = await chrome.storage.local.get(['commandHistory']);
  const h = (d.commandHistory || []).filter(x => x !== instruction);
  h.unshift(instruction);
  await chrome.storage.local.set({ commandHistory: h.slice(0, 20) });
}

// ============================================================
// 3. Main Engine
// ============================================================

async function executeAITask(instruction, tabId) {
  const abort = new AbortController();
  currentTask = { abort, tabId };

  try {
    const config = await chrome.storage.local.get(['apiKey', 'model', 'baseUrl']);
    if (!config.apiKey) {
      await agentShowToast(tabId, '❌ Please configure your API Key first (click extension icon → Options)');
      chrome.runtime.openOptionsPage();
      return;
    }

    const llm = new LLMClient(config.apiKey, config.model || 'google/gemini-2.0-flash', config.baseUrl || 'https://openrouter.ai/api/v1');

    // Get page context
    let pageInfo = null;
    try { await injectPageAgent(tabId); pageInfo = await agentCall(tabId, 'getPageInfo'); } catch(e) {}

    // Show conic-gradient glow overlay
    try { await agentCall(tabId, 'showOverlay'); } catch(e) {}

    await agentShowToast(tabId, '🧠 正在理解...');
    const plan = await llm.plan(instruction, pageInfo);

    if (!plan?.length) {
      await agentShowToast(tabId, '❌ 无法理解，请换种说法试试');
      try { await agentCall(tabId, 'hideOverlay'); } catch(e) {}
      return;
    }

    const validTypes = ['navigate','type','click','pressKey','wait','analyze','play_video','scroll','scrollTo','scrollMultiple','fillForm','getText','getPrices'];
    const validPlan = plan.filter(s => s?.type && validTypes.includes(s.type));

    if (!validPlan.length) {
      validPlan.push(
        { type: 'navigate', url: 'https://www.google.com', description: 'Open Google' },
        { type: 'type', target: 'search box', value: instruction, description: 'Type query' },
        { type: 'pressKey', key: 'Enter', description: 'Search' }
      );
    }

    await agentShowToast(tabId, `📋 共 ${validPlan.length} 步`);

    for (let i = 0; i < validPlan.length; i++) {
      if (abort.signal.aborted) { await agentShowToast(tabId, '⏹️ 已取消'); return; }
      const step = validPlan[i];
      await injectPageAgent(tabId);
      await agentShowToast(tabId, `🔄 [${i+1}/${validPlan.length}] ${step.description}`);
      const result = await executeStep(step, tabId, llm);
      await agentCall(tabId, "highlightElements");
      if (result?.newTabId) {
        tabId = result.newTabId;
        await injectPageAgent(tabId);
        await agentCall(tabId, "highlightElements");
      }
      await sleep(1000);
    }

    await agentShowToast(tabId, '🎉 完成！');
  } catch (err) {
    if (err.name === 'AbortError' || abort.signal.aborted) await agentShowToast(tabId, '⏹️ 已取消');
    else { console.error('AI Agent error:', err); await agentShowToast(tabId, `❌ ${err.message}`); }
  } finally {
    // Hide glow overlay
    try { await agentCall(currentTask?.tabId || tabId, 'hideOverlay'); } catch(e) {}
    currentTask = null;
  }
}

// ============================================================
// 4. Step Executor
// ============================================================

async function executeStep(step, tabId, llm) {
  switch (step.type) {
    case 'navigate':
      await chrome.tabs.update(tabId, { url: step.url });
      await waitForLoad(tabId);
      await injectPageAgent(tabId);
      await agentCall(tabId, 'dismissPopups');
      if (/bilibili/.test(step.url)) await waitForSelector(tabId, '.nav-search-input', 8000);
      else if (/youtube/.test(step.url)) await waitForSelector(tabId, 'input#search', 8000);
      await sleep(1000);
      break;

    case 'type': {
      await agentCall(tabId, 'dismissPopups');
      await sleep(500);
      if (step.target && /search|搜索|search box/i.test(step.target)) {
        await agentCall(tabId, 'typeInSearchBox', '');
        await sleep(300);
        await typeViaDebugger(tabId, step.value);
        await sleep(500);
        const newTabId = await detectNewTab(tabId, async () => { await agentCall(tabId, 'clickSearchButton'); });
        if (newTabId !== null) {
          await injectPageAgent(newTabId);
          await sleep(500);
          return { newTabId };
        }
        await waitForLoad(tabId, 10000);
        await sleep(1000);
        await injectPageAgent(tabId);
        await sleep(500);
        break;
      }
      const snapshot = await agentCall(tabId, 'snapshot');
      const idx = await llm.findElement(step.target, snapshot);
      if (idx === -1) throw new Error(`Cannot find element: ${step.target}`);
      await agentCall(tabId, 'type', idx, step.value);
      break;
    }

    case 'click': {
      await agentCall(tabId, 'dismissPopups');
      await sleep(500);
      let idx = -1, clickAction = null;

      if (step.target && /search button|搜索按钮|submit/i.test(step.target)) {
        idx = await agentCall(tabId, 'findSearchButton');
        if (idx >= 0) {
          try { await agentCall(tabId, 'animClick', idx); } catch(e) {}
          await sleep(400);
          clickAction = () => agentCall(tabId, 'click', idx);
        }
      }

      // Bilibili first video
      if (step.target && /第一个视频|first video|首个视频/.test(step.target)) {
        const r = await agentCall(tabId, 'clickFirstBiliVideo');
        if (r?.success && r.url && /\/video\/BV[a-zA-Z0-9]{10}/.test(r.url)) {
          const nt = await detectNewTab(tabId, async () => { await chrome.tabs.update(tabId, { url: r.url }); });
          if (nt !== null) { await injectPageAgent(nt); await sleep(2000); return { newTabId: nt }; }
          await waitForLoad(tabId); await injectPageAgent(tabId); await sleep(2000); break;
        }
        // YouTube fallback
        const yt = await agentCall(tabId, 'clickFirstYouTubeVideo');
        if (yt?.success && yt.url) {
          const nt = await detectNewTab(tabId, async () => { await chrome.tabs.update(tabId, { url: yt.url }); });
          if (nt !== null) { await injectPageAgent(nt); await sleep(2000); return { newTabId: nt }; }
          await waitForLoad(tabId); await injectPageAgent(tabId); await sleep(2000); break;
        }
      }

      if (step.target && /search result|first|第一个结果|first result/i.test(step.target)) {
        idx = await agentCall(tabId, 'clickFirstResult');
        if (idx >= 0) clickAction = () => agentCall(tabId, 'click', idx);
      }

      if (idx === -1) {
        const snapshot = await agentCall(tabId, 'snapshot');
        idx = await llm.findElement(step.target, snapshot);
        if (idx >= 0) clickAction = () => agentCall(tabId, 'click', idx);
      }
      if (idx === -1) throw new Error(`Cannot find element: ${step.target}`);

      if (clickAction) {
        const nt = await detectNewTab(tabId, clickAction);
        if (nt !== null) { await injectPageAgent(nt); await sleep(1000); return { newTabId: nt }; }
      }
      break;
    }

    case 'pressKey': await agentCall(tabId, 'pressKey', -1, step.key || 'Enter'); break;
    case 'scroll': await agentCall(tabId, 'scroll', step.direction || 'down', step.amount); break;
    case 'scrollTo': await agentCall(tabId, 'scrollTo', step.position || 'bottom'); break;
    case 'scrollMultiple': await agentCall(tabId, 'scrollMultiple', step.times || 3, step.direction || 'down'); break;

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

    case 'analyze': {
      await agentCall(tabId, 'dismissPopups');
      await sleep(500);
      const results = await agentCall(tabId, 'parseSearchResults');
      if (/first|第一个|首个/.test(step.goal || step.description)) {
        const idx = await agentCall(tabId, 'clickFirstResult');
        if (idx !== -1) {
          const nt = await detectNewTab(tabId, () => agentCall(tabId, 'click', idx));
          if (nt !== null) { await injectPageAgent(nt); return { newTabId: nt }; }
          break;
        }
      }
      const snapshot = await agentCall(tabId, 'snapshot');
      const action = await llm.analyzeAndDecide(snapshot, results, step.goal || step.description);
      if (action) {
        const sub = await executeStep(action, tabId, llm);
        if (sub?.newTabId) return sub;
      }
      break;
    }

    case 'play_video': {
      const result = await agentCall(tabId, 'playVideo');
      if (!result?.success) {
        const vi = await agentCall(tabId, 'findVideo');
        if (vi?.playButtons?.length > 0) await agentCall(tabId, 'click', 0);
      }
      break;
    }

    case 'wait': await sleep((step.seconds || 2) * 1000); break;
    default: throw new Error(`Unknown step type: ${step.type}`);
  }
}

// ============================================================
// 5. LLM Client
// ============================================================

class LLMClient {
  constructor(apiKey, model, baseUrl) { this.apiKey = apiKey; this.model = model; this.baseUrl = baseUrl; }

  async call(systemPrompt, userPrompt, signal) {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 30000);
    if (signal) signal.addEventListener('abort', () => ctrl.abort());
    try {
      const resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: this.model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.1, max_tokens: 4096 }),
        signal: ctrl.signal
      });
      if (!resp.ok) { const e = await resp.text(); throw new Error(`LLM API error ${resp.status}: ${e}`); }
      return (await resp.json()).choices[0].message.content;
    } finally { clearTimeout(timeout); }
  }

  parseJSON(text) { return JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()); }

  async plan(instruction, pageInfo) {
    const pageCtx = pageInfo && pageInfo.url !== 'about:blank'
      ? `\nCurrent page: ${pageInfo.url}\nPage title: ${pageInfo.title}\nSite type: ${pageInfo.site}\nHas search box: ${pageInfo.hasSearchBox}\nHas video: ${pageInfo.hasVideo}\nHas form: ${pageInfo.hasForm}\n`
      : '';

    const prompt = `You are a browser automation assistant. Break the user's instruction into browser action steps.

Available step types (MUST use exactly these):
- navigate: Open URL {"type":"navigate","url":"https://...","description":"..."}
- type: Type in search box {"type":"type","target":"search box","value":"text","description":"..."}
  [IMPORTANT: search box type auto-presses Enter. Do NOT add extra pressKey]
- click: Click element {"type":"click","target":"description","description":"..."}
- pressKey: Press key {"type":"pressKey","key":"Enter","description":"..."}
- wait: Wait seconds {"type":"wait","seconds":3,"description":"..."}
- scroll: Scroll {"type":"scroll","direction":"down","description":"..."}
- scrollTo: Scroll to position {"type":"scrollTo","position":"bottom","description":"..."}
- scrollMultiple: Scroll multiple times for lazy-loading {"type":"scrollMultiple","times":3,"direction":"down","description":"..."}
- fillForm: Fill form fields {"type":"fillForm","fields":[{"name":"email","value":"x@y.com"}],"description":"..."}
- analyze: Analyze page content {"type":"analyze","goal":"find best result","description":"..."}
- play_video: Play video {"type":"play_video","description":"..."}
- getText: Read page text {"type":"getText","maxChars":3000,"description":"..."}
${pageCtx}
User instruction: "${instruction}"

EXAMPLES BY SCENARIO:

# 1. Google search
"search Google for AI news"
[{"type":"navigate","url":"https://www.google.com","description":"Open Google"},{"type":"type","target":"search box","value":"AI news","description":"Search"}]

# 2. YouTube video
"play a cooking tutorial on YouTube"
[{"type":"navigate","url":"https://www.youtube.com","description":"Open YouTube"},{"type":"type","target":"search box","value":"cooking tutorial","description":"Search"},{"type":"wait","seconds":3,"description":"Wait results"},{"type":"click","target":"first video","description":"Click video"},{"type":"wait","seconds":2,"description":"Load"},{"type":"play_video","description":"Play"}]

# 3. Bilibili video
"bilibili搜索机器学习播放第一个视频"
[{"type":"navigate","url":"https://www.bilibili.com","description":"Open Bilibili"},{"type":"type","target":"search box","value":"机器学习","description":"Search"},{"type":"wait","seconds":3,"description":"Wait"},{"type":"click","target":"first video","description":"Click video"},{"type":"wait","seconds":2,"description":"Load"},{"type":"play_video","description":"Play"}]

# 4. Amazon shopping
"search Amazon for wireless headphones under 50 dollars"
[{"type":"navigate","url":"https://www.amazon.com","description":"Open Amazon"},{"type":"type","target":"search box","value":"wireless headphones","description":"Search"},{"type":"wait","seconds":3,"description":"Wait results"},{"type":"scrollMultiple","times":2,"direction":"down","description":"Scroll for more options"}]

# 5. Read news (Hacker News)
"open Hacker News and show top stories"
[{"type":"navigate","url":"https://news.ycombinator.com","description":"Open HN"},{"type":"wait","seconds":2,"description":"Load"},{"type":"getText","maxChars":2000,"description":"Read headlines"}]

# 6. Price comparison
"compare iPhone 16 prices on Google"
[{"type":"navigate","url":"https://www.google.com","description":"Open Google"},{"type":"type","target":"search box","value":"iPhone 16 price","description":"Search"},{"type":"wait","seconds":2,"description":"Wait"},{"type":"getText","maxChars":2000,"description":"Read prices"}]

# 7. Open specific site
"open GitHub"
[{"type":"navigate","url":"https://github.com","description":"Open GitHub"}]

# 8. Scroll long page
"scroll down to see more"
[{"type":"scroll","direction":"down","description":"Scroll down"}]

"scroll all the way to the bottom"
[{"type":"scrollTo","position":"bottom","description":"Scroll to bottom"}]

"keep scrolling to load more content"
[{"type":"scrollMultiple","times":5,"direction":"down","description":"Load more"}]

# 9. Form filling
"fill in my email in the newsletter form"
[{"type":"fillForm","fields":[{"name":"email","value":"user@example.com"}],"description":"Fill email"}]

# 10. Click link on current page
"click the first search result"
[{"type":"click","target":"first result","description":"Click first result"},{"type":"wait","seconds":2,"description":"Wait load"}]

# 11. Read current page
"what does this page say"
[{"type":"getText","maxChars":3000,"description":"Read page"}]

Generate steps for the user instruction. Output JSON array only.`;

    const raw = await this.call('You are a browser automation assistant. Output ONLY a JSON array. No markdown. Step types: navigate, type, click, pressKey, wait, scroll, scrollTo, scrollMultiple, fillForm, analyze, play_video, getText, getPrices.', prompt);
    return this.parseJSON(raw);
  }

  async findElement(description, snapshot) {
    if (!snapshot?.elements?.length) return -1;
    const elements = snapshot.elements.slice(0, 50).map(e => ({
      i: e.index, tag: e.tag, text: (e.text || '').substring(0, 40),
      name: e.name || '', ph: e.placeholder || '', aria: e.ariaLabel || '',
      href: (e.href || '').substring(0, 60), type: e.type || ''
    }));
    const prompt = `Page: ${snapshot.url} (${snapshot.site || 'unknown site'})
Title: ${snapshot.title}

Interactive elements:
${JSON.stringify(elements, null, 2)}

Find element matching: "${description}"

Tips:
- Search box: input[name='q'], input#search, input[type='search'], textarea
- Search button: button[type='submit'], button with "Search"/"搜索"
- Video links: youtube.com/watch, bilibili.com/video/BV
- Navigation: links matching description
- Buttons: text or aria-label matching
- Products: h2>a in result items

Output: {"index": number, "reason": "brief"} — JSON only.`;
    const raw = await this.call('Output JSON only.', prompt);
    try { const r = this.parseJSON(raw); return typeof r.index === 'number' ? r.index : -1; } catch { return -1; }
  }

  async analyzeAndDecide(snapshot, searchResults, goal) {
    const results = (searchResults?.results || []).slice(0, 5);
    const prompt = `Page: ${snapshot.url} (${searchResults?.site || snapshot.site || ''})
Goal: ${goal}

Results (${results.length}):
${JSON.stringify(results.map((r,i) => ({ i, title: r.title, url: r.url?.substring(0,100), snippet: (r.snippet||'').substring(0,100), isVideo: r.isVideo })), null, 2)}

Choose best match for goal. Prefer videos if goal involves video.

Output JSON: {"type":"click","target":"description","description":"..."}`;
    const raw = await this.call('Output JSON only.', prompt);
    try { return this.parseJSON(raw); } catch { return null; }
  }
}

// ============================================================
// 6. Utilities
// ============================================================

async function getActiveTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab; }

async function injectPageAgent(tabId) {
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['page-agent.js'] }); } catch(e) {}
}

async function agentCall(tabId, method, ...args) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (m, a) => { const agent = window.__aiAgent; if (!agent || typeof agent[m] !== 'function') return null; return agent[m](...a); },
      args: [method, args]
    });
    return results[0]?.result;
  } catch (e) {
    if (e.message && /XML|parser error|internal-suggestion/.test(e.message)) return null;
    console.error(`agentCall(${method}) failed:`, e); return null;
  }
}

async function agentShowToast(tabId, text) {
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
        try { await agentCall(tabId, 'hideOverlay'); } catch(e) {}
      }, state === 'success' ? 2000 : 4000);
    }
  } catch(e) {}
}
async function waitForLoad(tabId, timeout) {
  timeout = timeout || 15000;
  return new Promise(resolve => {
    let done = false;
    const ok = () => { if (!done) { done = true; resolve(); } };
    const listener = (id, info) => { if (id === tabId && info.status === 'complete') { chrome.tabs.onUpdated.removeListener(listener); ok(); } };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); ok(); }, timeout);
  });
}

async function waitForSelector(tabId, selector, timeout) {
  timeout = timeout || 10000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await agentCall(tabId, '_hasElement', selector)) return true;
    await sleep(500);
  }
  return false;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function detectNewTab(originalTabId, actionFn) {
  const before = new Set((await chrome.tabs.query({})).map(t => t.id));
  await actionFn();
  await sleep(2500);
  const newTabs = (await chrome.tabs.query({})).filter(t => !before.has(t.id));
  if (newTabs.length > 0) {
    console.log(`New tab: id=${newTabs[0].id} url=${newTabs[0].url}`);
    await waitForLoad(newTabs[0].id, 15000);
    await sleep(1000);
    return newTabs[0].id;
  }
  return null;
}

async function typeViaDebugger(tabId, text) {
  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    await sleep(100);
    await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text });
    await chrome.debugger.detach({ tabId });
    return { success: true, method: 'debugger_insertText' };
  } catch (e) {
    try { await chrome.debugger.detach({ tabId }); } catch(_) {}
    return { success: false, error: e.message };
  }
}
