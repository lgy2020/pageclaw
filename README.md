# PageClaw

AI-powered browser automation Chrome extension.

Type `@ai` in the address bar and tell the AI what to do with natural language.

## Features

- **Omnibox Integration**: Type `@ai` + your command in the address bar
- **Smart Search**: Google, Bing, Baidu, YouTube, Bilibili, Amazon
- **Video Playback**: Auto-play first result on YouTube/Bilibili
- **Price Extraction**: Amazon price detection
- **News Reading**: Hacker News top stories
- **Form Filling**: Fill forms by describing what you want
- **Page Reading**: Extract page text content
- **Multi-scroll**: Continuous scrolling for lazy-load content
- **Popup Dismiss**: Auto-close 30+ types of popups

## Supported LLMs

Any OpenAI-compatible API:
- OpenRouter (default)
- OpenAI
- DeepSeek
- Ollama (local)

## Installation

1. Download or clone this repository
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" → select this folder
5. Click the extension icon → Settings → configure your API Key

## Usage

1. Click the address bar
2. Type `@ai` + space
3. Type your command, e.g.:
   - `@ai search for today's AI news`
   - `@ai play a Python tutorial on YouTube`
   - `@ai search bilibili for machine learning`
   - `@ai open Hacker News`
   - `@ai search for wireless earbuds on Amazon`
4. Press Enter

## Architecture

```
service-worker.js    — Background: LLM call + step execution + Debugger API
page-agent.js        — Content Script injection: DOM snapshot + element interaction
popup.html/js        — Extension popup: settings guide + command history
options.html/js      — Settings page: API Key / Model / Base URL configuration
manifest.json        — MV3 manifest
```

## Permissions

| Permission | Purpose |
|-----------|---------|
| activeTab | Access current tab for automation |
| scripting | Inject page-agent.js into pages |
| storage | Save API Key and settings locally |
| omnibox | @ai address bar integration |
| debugger | Keyboard input for framework-controlled inputs (Vue/React) |

## Privacy

- API Key stored locally in chrome.storage.local
- Page content only read when you trigger a command
- No data sent to any server except your configured LLM API
- No browsing history stored

## License

MIT
