# page/ — Page-Side Modules

Injected into target web pages via `chrome.scripting.executeScript`. All modules define globals that are wired together in `agent.js`.

## Modules

### constants.js (153 lines)
Shared constants and utilities:
- `ALL_SELECTORS` — CSS selectors for interactive elements
- `SEARCH_BOX_SELECTORS`, `SEARCH_BTN_SELECTORS` — search-specific selectors
- `FIRST_RESULT_SELECTORS` — first search result patterns
- `POPUP_DISMISS_SELECTORS` — cookie/popup dismiss buttons
- `getVisibleElements()` — returns visible interactive elements
- `detectSite()` — identifies current site (Google, YouTube, Bilibili, Amazon, etc.)
- `findIndexBySelector(selector)` — find element index in visible list

### dom-engine.js (306 lines)
DOM tree extraction engine (simplified from PageAgent's 1706-line version):
- `snapshot(maxDepth, doHighlight)` — extract all page elements with coordinates
- `_extractElement(el, depth, maxDepth)` — recursive DOM traversal
- `_flattenTree(tree, flat)` — convert tree to flat indexed list
- `_getCoords(el)` — get element coordinates + scroll data
- `_isElementVisible(el)` — visibility check (size, opacity, display)
- `_scoreInteractive(el)` — score element interactivity (0-5)
- `_highlightElements(elements)` — add numbered labels to elements

### element-ops.js (196 lines)
Element interaction operations:
- `click(index)` — full click sequence (pointerdown → mousedown → pointerup → mouseup → click)
- `type(index, text)` — focus + set value + dispatch input events
- `pressKey(key)` — dispatch keyboard events
- `scroll(direction, amount)` — window.scrollBy with smooth behavior
- `scrollTo(index)` — scrollIntoView for specific element
- `scrollMultiple(count, direction)` — repeated scrolling
- `findSearchBox()` / `typeInSearchBox(text)` / `findSearchButton()` / `clickSearchButton()`
- `fillForm(fields)` — fill multiple form fields
- `dismissPopups()` — click dismiss buttons on popups/cookie banners

### page-info.js (330 lines)
Page information extraction with site-specific formatters:
- `getPageInfo()` — comprehensive page state (URL, title, site, elements, text preview)
- `getText()` — full page text content
- `getPrices()` — extract prices (supports ¥/$/€/£, with range detection)
- `clickFirstResult()` — find and click first search result
- `clickFirstBiliVideo()` / `clickFirstYouTubeVideo()` — site-specific video clicks
- `getHackerNewsTopStories()` — extract HN story list
- `getLinks()` — extract all page links
- `parseSearchResults()` — generic search result parsing
- `findVideo()` / `playVideo()` — video element detection and control
- `_isVideo(url, text)` — detect video links (YouTube, Bilibili, Vimeo, etc.)

### animation.js (303 lines)
Visual feedback system:
- `showOverlay()` — status widget + element highlights + cursor
- `hideOverlay()` — fade out and destroy all visual elements
- `updateStatus(text, current, total)` — update status text + progress bar
- `setGlowState(state)` — visual state (thinking/executing/success/error)
- `moveCursorTo(index)` — animate cursor to element
- `animClick(index)` — cursor move + click ripple animation
- `highlightElements()` — refresh element number labels
- Screen border glow, cursor trail particles, click ripples

### agent.js (54 lines)
Entry point. IIFE that wires all modules to `window.__aiAgent`:
```javascript
window.__aiAgent = {
  snapshot: domEngine.snapshot.bind(domEngine),
  click: elementOps.click.bind(elementOps),
  getPageInfo: pageInfo.getPageInfo.bind(pageInfo),
  showOverlay: animSystem.showOverlay.bind(animSystem),
  // ... 33 methods total
};
```
Guard: `if (window.__aiAgent) return;` prevents duplicate initialization.
