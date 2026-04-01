export class LLMClient {
  constructor(apiKey, model, baseUrl) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async call(systemPrompt, userPrompt, abortSignal) {
    var ctrl = new AbortController();
    var timeout = setTimeout(() => ctrl.abort(), 30000);
    if (abortSignal) abortSignal.addEventListener('abort', () => ctrl.abort());
    try {
      var resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 4096
        }),
        signal: ctrl.signal
      });
      if (!resp.ok) {
        var e = await resp.text();
        throw new Error(`LLM API error ${resp.status}: ${e}`);
      }
      return (await resp.json()).choices[0].message.content;
    } finally {
      clearTimeout(timeout);
    }
  }

  parseJSON(text) {
    return JSON.parse(
      text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    );
  }

  async plan(instruction, pageInfo, historyText) {
    var pageCtx = pageInfo && pageInfo.url !== 'about:blank'
      ? `\nCurrent page: ${pageInfo.url}\nPage title: ${pageInfo.title}\nSite type: ${pageInfo.site}\nHas search box: ${pageInfo.hasSearchBox}\nHas video: ${pageInfo.hasVideo}\nHas form: ${pageInfo.hasForm}\n`
      : '';

    var historyCtx = historyText
      ? '\nPrevious conversation context:\n' + historyText + '\n\nUse this to understand references like first result, go back, click that button, etc.\n\n'
      : '';
    var prompt = historyCtx + buildPlanPrompt(instruction, pageCtx);
    var raw = await this.call(
      'You are a browser automation assistant. Output ONLY a JSON array. No markdown. Step types: navigate, type, click, pressKey, wait, scroll, scrollTo, scrollMultiple, fillForm, analyze, play_video, getText, getPrices, observe.',
      prompt
    );
    return this.parseJSON(raw);
  }

  async findElement(description, snapshot) {
    // 使用与点击系统相同的元素索引：getVisibleElements()
    // snapshot参数暂时保留但不使用，保持API兼容性
    const getVisibleElementsFunc = `return (${getVisibleElements.toString()})()`;
    const findIndexBySelectorFunc = `return (${findIndexBySelector.toString()})()`;
    
    // 我们需要在page context中执行这些函数
    // 但由于我们在service worker中，不能直接访问DOM
    // 所以我们需要修改方法：让调用方传递正确的元素列表
    
    // 临时方案：还是使用snapshot，但尝试调整索引
    if (!snapshot?.elements?.length) return -1;
    
    // 尝试从snapshot中找出匹配"立即播放"的元素
    for (let i = 0; i < snapshot.elements.length; i++) {
      const e = snapshot.elements[i];
      const text = (e.text || '').trim();
      const cls = (e.attrs?.class || '').trim();
      
      // 如果描述包含"立即播放"，优先匹配文本为"立即播放"的元素
      if (description.includes('立即播放')) {
        if (text.includes('立即播放')) {
          console.log('[PageClaw] findElement exact match for 立即播放 at index', i, 'text:', text, 'class:', cls);
          return i;
        }
        if (cls.includes('btn-warm')) {
          console.log('[PageClaw] findElement class match btn-warm at index', i, 'text:', text, 'class:', cls);
          return i;
        }
      }
    }
    
    // 如果上述简单匹配失败，使用LLM
    var elements = snapshot.elements.slice(0, 50).map(e => ({
      i: e.index, tag: e.tag, text: (e.text || '').substring(0, 40),
      name: e.name || '', ph: e.placeholder || '', aria: e.ariaLabel || '',
      href: (e.href || '').substring(0, 60), type: e.type || '',
      class: (e.attrs?.class || '').substring(0, 60)
    }));
    console.log('[PageClaw] findElement looking for:', description);
    console.log('[PageClaw] Available elements:', elements);
    var prompt = `Page: ${snapshot.url} (${snapshot.site || 'unknown site'})
Title: ${snapshot.title}

Interactive elements:
${JSON.stringify(elements, null, 2)}

Find element matching: "${description}"

CRITICAL RULES for "播放" (play) related elements:
1. If description contains "点击立即播放" → MUST select element with EXACT "立即播放" text (NOT "播放记录")
2. If description contains "立即播放" → MUST select element with EXACT "立即播放" text
3. If description contains "播放" AND does NOT contain "记录" or "历史" → MUST select element with "立即播放" text
4. If description is "播放" → MUST select element with "立即播放" text (not "播放记录")
5. If description contains "播放记录" or "历史" → select element with "播放记录" text
6. "立即播放" means "play now" (main play button), "播放记录" means "play history" (different button)
7. NEVER select "播放记录" element when description is about playing video
8. Element with class "btn btn-warm" is very likely the play button

Matching priority:
1. EXACT text match: element.text contains exact phrase from description
2. For "播放" related: element.text contains "立即播放" (highest priority)
3. Class match: class includes "btn", "button", "play", "warm" - especially "btn btn-warm" often indicates play button
4. aria-label match: aria-label includes description
5. Href/URL match: href includes "play", "video", "watch", "nku" (common for video sites)
6. If multiple elements match, choose the one with "立即播放" text over "播放记录" text

Important examples:
- "点击立即播放" → element with text "立即播放" (index 14 or 27 in examples, NOT element with "播放记录")
- "立即播放" → element with text "立即播放" (NOT "播放记录")
- "播放" → element with text "立即播放" (NOT "播放记录")
- "播放视频" → element with text "立即播放" (NOT "播放记录")
- "播放记录" → element with text "播放记录" (NOT "立即播放")
- "历史记录" → element with text "播放记录" (NOT "立即播放")
  - Element with "播放记录" text is for history, NOT for playing video

Output: {"index": number, "reason": "brief"} — JSON only.`;
    var raw = await this.call('Output JSON only. Follow the CRITICAL RULES exactly for "播放" related elements. Never select "播放记录" element for play instructions.', prompt);
    console.log('[PageClaw] LLM raw response:', raw);
    try {
      var r = this.parseJSON(raw);
      console.log('[PageClaw] LLM parsed response:', r);
      return typeof r.index === 'number' ? r.index : -1;
    } catch {
      console.log('[PageClaw] LLM response parse failed');
      return -1;
    }
  }

  async analyzeAndDecide(snapshot, searchResults, goal) {
    var results = (searchResults?.results || []).slice(0, 5);
    var prompt = `Page: ${snapshot.url} (${searchResults?.site || snapshot.site || ''})
Goal: ${goal}

Results (${results.length}):
${JSON.stringify(results.map((r, i) => ({
  i, title: r.title, url: r.url?.substring(0, 100),
  snippet: (r.snippet || '').substring(0, 100), isVideo: r.isVideo
})), null, 2)}

Choose best match for goal. Prefer videos if goal involves video.

Output JSON: {"type":"click","target":"description","description":"..."}`;
    var raw = await this.call('Output JSON only.', prompt);
    try { return this.parseJSON(raw); } catch { return null; }
  }

  async replan(instruction, pageInfo, failContext, remainingSteps, historyText) {
    var pageCtx = pageInfo && pageInfo.url !== 'about:blank'
      ? `\nCurrent page: ${pageInfo.url}\nPage title: ${pageInfo.title}\nSite type: ${pageInfo.site}\n`
      : '';

    var historyCtx = historyText
      ? '\nPrevious conversation context:\n' + historyText + '\n\n'
      : '';

    var prompt = `${historyCtx}${pageCtx}
Original instruction: "${instruction}"

A step in the plan failed:
- Failed step: ${failContext.failedStep}
- Failure type: ${failContext.failureType}
- Reason: ${failContext.reason}
- Current page URL: ${failContext.currentUrl}
- Completed steps: ${JSON.stringify(failContext.completedSteps || [])}
- Remaining steps that may need adjustment: ${JSON.stringify(remainingSteps.map(s => ({ type: s.type, description: s.description })))}

You must generate a NEW plan for the remaining work. The page may have changed.
Consider:
1. If element-not-found: maybe the page layout changed, try alternative selectors
2. If timeout: add longer waits
3. If navigation issue: re-navigate or take alternative path

Output a JSON array of steps to replace the remaining steps. Use the same step types as normal planning.
Output ONLY a JSON array. No markdown.`;

    var raw = await this.call(
      'You are a browser automation assistant replanning after a failure. Output ONLY a JSON array of steps.',
      prompt
    );
    return this.parseJSON(raw);
  }
}

function buildPlanPrompt(instruction, pageCtx) {
  return `You are a browser automation assistant. Break the user's instruction into browser action steps.

CRITICAL RULES FOR VIDEO PLAYBACK:
1. If user instruction contains "播放" AND does NOT contain "记录" or "历史" → MUST include "play_video" step
2. If user instruction is "点击立即播放" or similar → plan: [{"type":"play_video","description":"Play video"}]
3. If user instruction is "播放视频" or "播放" → plan: [{"type":"play_video","description":"Play video"}]
4. If user instruction contains "搜索" and "播放" → plan: navigate → type search → wait → click first video → wait → play_video
5. "立即播放" means "play now" button, "播放记录" means "play history" - they are DIFFERENT buttons
6. When clicking play buttons, target should be "立即播放" for play-related instructions

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
- observe: Extract structured data {"type":"observe","extract":{"type":"list|text","selector":".item","fields":[{"name":"title","selector":"h2","attr":"text"}]},"description":"..."}
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
"bilibili\u641c\u7d22\u673a\u5668\u5b66\u4e60\u64ad\u653e\u7b2c\u4e00\u4e2a\u89c6\u9891"
[{"type":"navigate","url":"https://www.bilibili.com","description":"Open Bilibili"},{"type":"type","target":"search box","value":"\u673a\u5668\u5b66\u4e60","description":"Search"},{"type":"wait","seconds":3,"description":"Wait"},{"type":"click","target":"first video","description":"Click video"},{"type":"wait","seconds":2,"description":"Load"},{"type":"play_video","description":"Play"}]

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

# 12. Extract structured data
"extract all product names and prices from the page"
[{"type":"observe","extract":{"type":"list","selector":".product-item","fields":[{"name":"name","selector":"h2","attr":"text"},{"name":"price","selector":".price","attr":"text"}]},"description":"Extract products"}]

Generate steps for the user instruction. Output JSON array only.`;
}
