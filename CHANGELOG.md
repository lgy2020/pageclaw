# PageClaw Changelog

> \u6B63\u5F0F\u4E0A\u7EBF\u524D\u5747\u4E3A 0.x \u7248\u672C


## v0.7.0 — 2026-03-28

**feat: instant overlay + conversation history (2 features, 0 breaking changes)**

- **Instant overlay**: `showOverlayFast()` for immediate visual feedback before page-bundle injection
- **Cross-page persistence**: webNavigation listeners re-inject overlay on page loads and SPA navigations
- **Early injection**: `inject-overlay.js` content script at document_start for pre-DOM overlay detection
- **Session state**: taskRunning tracked in sessionStorage for cross-context coordination
- **Bug fixes**: document.body null check for about:blank pages; removed 30s auto-hide timeout during long tasks
- **Conversation history**: per-tab turn tracking (max 20 turns, core/history.js)
- **Context injection**: LLM planning now includes recent 5 turns for follow-up instructions
- **History API**: GET_HISTORY / CLEAR_HISTORY / EXPORT_HISTORY message handlers
- **Auto-cleanup**: tab close triggers history cleanup via chrome.tabs.onRemoved
- **New permission**: webNavigation in manifest
- **Commits**: 825a455, c380dcf

## v0.6.0 \u2014 2026-03-25

**perf: three-layer cache optimization (injection cache, plan cache, page bundle)**

- **Injection cache**: `Set<tabId>` + `Map<tabId, Promise>` concurrency guard, liveness try-catch, agentCall failure auto-invalidate
- **Plan cache**: LRU Map (max 50) keyed by `site|||instruction`, skips LLM plan() on repeat (~2-5s \u2192 <1ms)
- **Page bundle**: 6 page modules concatenated into single `page-bundle.js` (1342 lines), 6x executeScript \u2192 1x
- **Build script**: `bash build.sh` for concatenation after page/ source changes
- **Commits**: f667420, da08b1a, 83cbcc6

## v0.5.0 \u2014 2026-03-24

**refactor: split monolithic files into ES modules (13 files, no logic changes)**

- service-worker.js (557 lines) \u2192 7 modules: worker/background.js, worker/tab-manager.js, worker/debugger-input.js, core/engine.js, core/executor.js, llm/client.js, utils/sleep.js
- page-agent.js (1262 lines) \u2192 6 modules: page/agent.js, page/constants.js, page/dom-engine.js, page/element-ops.js, page/page-info.js, page/animation.js
- \u6700\u5927\u5355\u6587\u4EF6\u884C\u6570: 1262 \u2192 330\u884C
- manifest.json: background.service_worker \u6307\u5411 worker/background.js
- ES Modules \u539F\u751F\u652F\u6301\uFF0C\u65E0\u9700\u6253\u5305\u5DE5\u5177
- \u6240\u6709\u516C\u5171\u65B9\u6CD5 33 \u4E2A\u5168\u90E8\u6B63\u786E\u63A5\u5165 window.__aiAgent
- **\u6548\u679C**: \u52A0\u65B0\u7AD9\u70B9 \u2192 \u6539 2-3 \u6587\u4EF6 \u2192 \u52A0 1 \u6587\u4EF6\uFF0C\u5B9A\u4F4D bug \u2192 \u6309\u6A21\u5757\u5B9A\u4F4D

## v0.4.0 \u2014 2026-03-24

**perf: progressive DOM-ready detection, replace fixed sleeps with polling (3-4x faster page loads)**

- \u65B0\u589E `waitForDOMReady()`: \u8F6E\u8BE2 document.readyState=interactive\uFF0C\u4E0D\u518D\u7B49 complete
- \u65B0\u589E `waitForElement()`: \u8F6E\u8BE2\u76EE\u6807\u5143\u7D20\u51FA\u73B0\uFF0C\u66FF\u4EE3\u56FA\u5B9A sleep
- \u91CD\u5199 `detectNewTab()`: 300ms \u8F6E\u8BE2\u66FF\u4EE3\u786C\u7F16\u7801 sleep(2500ms)
- navigate/type/click \u6240\u6709\u6B65\u9AA4\u4E2D waitForLoad \u5168\u90E8\u66FF\u6362\u4E3A waitForDOMReady
- \u56FA\u5B9A sleep \u5168\u9762\u7F29\u51CF\uFF1A\u6B65\u9AA4\u95F4 1000->300ms\uFF0Cdismiss \u5EF6\u8FDF 500->200ms\uFF0C\u79FB\u9664\u5197\u4F59 sleep
- page-agent.js \u65B0\u589E `getReadyState()` \u65B9\u6CD5
- **\u6548\u679C**: Bilibili \u641C\u7D22\u5230\u70B9\u51FB\u89C6\u9891\u4ECE ~20s \u964D\u81F3 ~6s\uFF083-4x \u63D0\u901F\uFF09

## v0.3.0 \u2014 2026-03-24

**feat: visual animation system v4 (screen border, status card, element labels, cursor trail, click particles)**

- \u5C4F\u5E55\u8FB9\u6846\u95EA\u70C1\u72B6\u6001\u6307\u793A\uFF08executing/thinking/success/error \u56DB\u6001\uFF09
- \u53F3\u4E0A\u89D2\u72B6\u6001\u5361\u7247\uFF08\u6B65\u9AA4\u63CF\u8FF0 + \u8FDB\u5EA6\u6761 + \u8BA1\u6570\u5668\uFF09
- \u53EF\u4EA4\u4E92\u5143\u7D20 [0][1][2] \u5F69\u8272\u7F16\u53F7\u6807\u7B7E\uFF0812 \u8272\u5FAA\u73AF\uFF09
- AI \u865A\u62DF\u5149\u6807\uFF08\u7EA2\u7D2B\u6E10\u53D8\u7BAD\u5934 + AI \u5FBD\u7AE0 + 5 \u8F68\u8FF9\u6B8B\u5F71\uFF09
- \u70B9\u51FB\u52A8\u753B\uFF083 \u73AF\u6D9F\u6F2A + 8 \u65B9\u5411\u5F69\u8272\u7C92\u5B50\u7206\u53D1\uFF09
- \u6240\u6709\u8986\u76D6\u5C42 pointer-events: none\uFF0C\u4E0D\u963B\u585E\u9875\u9762\u4EA4\u4E92

## v0.2.0 \u2014 2026-03-24

**feat: DOM extraction engine, site detection, 10-scenario support with Chinese UI**

- 1700+ \u884C DOM \u63D0\u53D6\u5F15\u64CE\uFF08WeakMap \u4E09\u7EA7\u7F13\u5B58\u3001\u53EF\u89C1\u6027\u68C0\u67E5\u3001\u4EA4\u4E92\u6027\u8BC4\u5206\uFF09
- `detectSite()`: 15+ \u7F51\u7AD9\u81EA\u52A8\u8BC6\u522B
- \u5341\u5927\u573A\u666F\u793A\u4F8B\uFF08Google/YouTube/Bilibili/Amazon/HN\u7B49\uFF09
- popup.html \u548C service-worker.js \u4E2D\u6587\u5316

## v0.1.0 \u2014 2026-03-23

**init: MV3 extension skeleton with omnibox, LLM planner, basic step executor**

- Chrome Manifest V3 \u6269\u5C55\u9AA8\u67B6
- Omnibox \u5165\u53E3\uFF08\u5730\u5740\u680F\u8F93\u5165 @ai \u89E6\u53D1\uFF09
- LLM Planner\uFF08Plan-then-Execute \u67B6\u6784\uFF0C\u4E00\u6B21\u89C4\u5212\u5168\u90E8\u6B65\u9AA4\uFF09
- \u57FA\u7840\u6B65\u9AA4\u6267\u884C\u5668\uFF08navigate/type/click/pressKey/wait/scroll\uFF09
- LLM Client\uFF08OpenRouter API\uFF0C30s \u8D85\u65F6\uFF09
- \u9875\u9762\u6CE8\u5165\u5F0F DOM \u64CD\u4F5C\uFF08executeScript\uFF0C\u7ED5\u8FC7 CSP\uFF09
- Bilibili/YouTube \u641C\u7D22\u6846\u548C\u89C6\u9891\u9009\u62E9\u5668
- \u4EFB\u52A1\u53D6\u6D88\uFF08AbortController\uFF09
- \u547D\u4EE4\u5386\u53F2\uFF08\u6700\u8FD1 20 \u6761\uFF09
- Quick Setup \u9884\u8BBE\uFF08OpenRouter/OpenAI/DeepSeek/Ollama\uFF09
