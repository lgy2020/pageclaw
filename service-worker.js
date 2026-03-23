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
      await agentShowToast(tabId, `🔄 [${i+1}/${validPlan.length}] ${step.description}`);
      await injectPageAgent(tabId);
      const result = await executeStep(step, tabId, llm);
      if (result?.newTabId) { tabId = result.newTabId; await injectPageAgent(tabId); }
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
    await chrome.scripting.executeScript({
      target: { tabId }, args: [text],
      func: (msg) => {
        let c = document.getElementById('ai-agent-overlay');
        if (!c) {
          c = document.createElement('div'); c.id = 'ai-agent-overlay';
          c.innerHTML = '<div id="ai-agent-backdrop"></div><div id="ai-agent-card"><div id="ai-agent-icon">🤖</div><div id="ai-agent-title">AI Agent</div><div id="ai-agent-status"></div><div id="ai-agent-steps"></div><div id="ai-agent-spinner"></div></div>';
          document.body.appendChild(c);
          document.getElementById('ai-agent-backdrop').addEventListener('click', () => c.style.display = 'none');
          const s = document.createElement('style');
          s.textContent = '#ai-agent-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,-apple-system,sans-serif;animation:aiF .3s}@keyframes aiF{from{opacity:0}to{opacity:1}}#ai-agent-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);cursor:pointer}#ai-agent-card{position:relative;background:linear-gradient(145deg,#1a1a2e,#16213e,#0f3460);border:1px solid rgba(233,69,96,.3);border-radius:24px;padding:48px 56px;min-width:420px;max-width:560px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.6),0 0 60px rgba(233,69,96,.15);animation:aiC .4s cubic-bezier(.34,1.56,.64,1)}@keyframes aiC{from{transform:scale(.8) translateY(20px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}#ai-agent-icon{font-size:48px;margin-bottom:12px;animation:aiP 2s ease-in-out infinite}@keyframes aiP{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}#ai-agent-title{font-size:22px;font-weight:700;color:#e94560;margin-bottom:16px;letter-spacing:1px}#ai-agent-status{font-size:16px;color:#eee;line-height:1.6;margin-bottom:20px;min-height:24px}#ai-agent-steps{text-align:left;max-height:180px;overflow-y:auto;margin-bottom:16px}#ai-agent-steps .step{display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13px;color:#aaa;transition:all .3s}#ai-agent-steps .step.active{color:#e94560;font-weight:600}#ai-agent-steps .step.done{color:#4ade80}#ai-agent-steps .step-dot{width:8px;height:8px;border-radius:50%;background:#555;flex-shrink:0}#ai-agent-steps .step.active .step-dot{background:#e94560;box-shadow:0 0 8px #e94560;animation:aiD 1s infinite}#ai-agent-steps .step.done .step-dot{background:#4ade80}@keyframes aiD{0%,100%{box-shadow:0 0 4px #e94560}50%{box-shadow:0 0 12px #e94560}}#ai-agent-spinner{width:32px;height:32px;margin:0 auto;border:3px solid rgba(233,69,96,.2);border-top-color:#e94560;border-radius:50%;animation:aiS .8s linear infinite}@keyframes aiS{to{transform:rotate(360deg)}}';
          document.head.appendChild(s);
        }
        const st = document.getElementById('ai-agent-status'), se = document.getElementById('ai-agent-steps'), sp = document.getElementById('ai-agent-spinner'), ic = document.getElementById('ai-agent-icon');
        if (msg.includes('🎉')) { ic.textContent='🎉'; st.textContent='完成！'; sp.style.display='none'; document.getElementById('ai-agent-card').style.borderColor='rgba(74,222,128,.5)'; return; }
        if (msg.includes('❌')) { ic.textContent='⚠️'; st.textContent=msg.replace('❌','').trim(); sp.style.display='none'; document.getElementById('ai-agent-card').style.borderColor='rgba(239,68,68,.5)'; return; }
        if (msg.includes('⏹️')) { ic.textContent='⏹️'; st.textContent='已取消'; sp.style.display='none'; return; }
        const m = msg.match(/🔄\s*\[(\d+)\/(\d+)\]\s*(.+)/);
        if (m) {
          const cur=+m[1], tot=+m[2], desc=m[3];
          if (!se.children.length || se.dataset.total!==String(tot)) { se.innerHTML=''; se.dataset.total=tot; for(let i=1;i<=tot;i++){const d=document.createElement('div');d.className='step';d.dataset.step=i;d.innerHTML='<span class="step-dot"></span><span class="step-text">Waiting...</span>';se.appendChild(d);} }
          for(let i=1;i<=tot;i++){const d=se.querySelector('[data-step="'+i+'"]');if(i<cur){d.className='step done';d.querySelector('.step-text').textContent=d.dataset.desc||'Step '+i;}else if(i===cur){d.className='step active';d.querySelector('.step-text').textContent=desc;d.dataset.desc=desc;}}
          st.textContent='步骤 '+cur+'/'+tot; return;
        }
        st.textContent = msg;
      }
    });
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
