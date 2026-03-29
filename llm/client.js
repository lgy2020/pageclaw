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
    if (!snapshot?.elements?.length) return -1;
    var elements = snapshot.elements.slice(0, 50).map(e => ({
      i: e.index, tag: e.tag, text: (e.text || '').substring(0, 40),
      name: e.name || '', ph: e.placeholder || '', aria: e.ariaLabel || '',
      href: (e.href || '').substring(0, 60), type: e.type || ''
    }));
    var prompt = `Page: ${snapshot.url} (${snapshot.site || 'unknown site'})
Title: ${snapshot.title}

Interactive elements:
${JSON.stringify(elements, null, 2)}

Find element matching: "${description}"

Tips:
- Search box: input[name='q'], input#search, input[type='search'], textarea
- Search button: button[type='submit'], button with "Search"/"\u641c\u7d22"
- Video links: youtube.com/watch, bilibili.com/video/BV
- Navigation: links matching description
- Buttons: text or aria-label matching
- Products: h2>a in result items

Output: {"index": number, "reason": "brief"} — JSON only.`;
    var raw = await this.call('Output JSON only.', prompt);
    try {
      var r = this.parseJSON(raw);
      return typeof r.index === 'number' ? r.index : -1;
    } catch {
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
