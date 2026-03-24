# worker/ — Chrome Extension Service Worker

The extension entry point and tab management layer.

## Modules

### background.js (97 lines)
Extension entry point. Registers:
- **Omnibox**: `@ai` keyword captures natural language commands
- **Context menu**: "Let AI handle this" right-click option
- **Action**: popup with quick settings

Routes commands to `core/engine.js` for execution.

### tab-manager.js (139 lines)
Tab lifecycle management:
- `getActiveTab()` — get current active tab
- `waitForDOMReady(tabId)` — poll `document.readyState` until interactive
- `waitForElement(tabId, selector)` — poll for element existence
- `waitForLoad(tabId)` — wait for `tabs.onUpdated` status=complete
- `waitForSelector(tabId, selector)` — combined wait strategy
- `injectPageAgent(tabId)` — inject page modules via `chrome.scripting.executeScript`
- `agentCall(tabId, method, ...args)` — call methods on `window.__aiAgent` from service worker
- `agentShowToast(tabId, text)` — show visual status on the page
- `detectNewTab(originalTabId, actionFn)` — detect tabs opened by actions

### debugger-input.js (33 lines)
Uses Chrome Debugger API (`chrome.debugger`) to simulate keyboard input at a lower level than `chrome.scripting`. Handles special keys and IME input.
