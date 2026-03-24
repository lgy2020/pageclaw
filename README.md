# PageClaw

AI-powered browser automation for Chrome. Type `@ai` in the address bar and tell the AI what to do.

## What It Does

PageClaw lets you control any web page with natural language:

- **"Search Google for best laptops 2026"** — types the query, clicks search, reads results
- **"Click the first YouTube video"** — navigates, finds, and plays the video
- **"Add iPhone 16 to cart on Amazon"** — interacts with e-commerce sites
- **"Read the top 5 Hacker News stories"** — extracts content from news sites

The AI sees the page like you do, plans steps, and executes them with visual feedback (animated cursor, element highlights, progress overlay).

## Architecture

```
worker/          Chrome extension service worker
├── background.js        Entry point, omnibox & context menu
├── tab-manager.js       Tab lifecycle, module injection, agentCall
└── debugger-input.js    Chrome Debugger API for text input

core/            Task engine
├── engine.js            Task orchestrator (plan → execute loop)
└── executor.js          Step execution (click/type/scroll/wait/analyze)

llm/             LLM integration
└── client.js            LLM client, MacroTool planning, model patches

page/            Page-side modules (injected into target pages)
├── constants.js         Selectors, site detection, getVisibleElements
├── dom-engine.js        DOM tree extraction & flattening
├── element-ops.js       Click, type, scroll, form filling
├── page-info.js         Page info, search results, price parsing
├── animation.js         Visual effects (cursor, highlights, overlay)
└── agent.js             Entry point, wires modules to window.__aiAgent

utils/
└── sleep.js             Async sleep helper
```

## Supported Sites

| Site | Capabilities |
|------|-------------|
| Google | Search, navigate results, read snippets |
| YouTube | Search, click videos, play/pause |
| Bilibili | Search, play videos, read comments |
| Amazon / JD / Taobao | Search, product details, add to cart |
| Hacker News | Read top stories, navigate links |
| GitHub | Search repos, navigate code |
| Wikipedia | Search, read articles |
| Google Translate | Translate text |
| Generic sites | Click, type, scroll, read content |

## Setup

1. Clone the repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode**
4. Click **Load unpacked** → select the project folder
5. Click the extension icon → **Options** → enter your API key (OpenRouter or any OpenAI-compatible endpoint)
6. Type `@ai` in the address bar, then describe what you want

## How It Works

```
User types "@ai search for cats on YouTube"
    ↓
Omnibox captures input → LLM plans steps
    ↓
Step 1: navigate to youtube.com          [executor]
Step 2: type "cats" in search box        [executor → agentCall → element-ops]
Step 3: click search button              [executor → agentCall → element-ops]
Step 4: click first video result         [executor → agentCall → page-info]
Step 5: analyze what's playing           [executor → agentCall → dom-engine]
    ↓
Each step: inject page modules → execute → return result → LLM decides next
Visual feedback: animated cursor, element labels, progress overlay
```

## Configuration

- **API Key**: Any OpenAI-compatible provider (OpenRouter, DeepSeek, Google Gemini, etc.)
- **Model**: Default `google/gemini-2.0-flash`, configurable in options
- **Base URL**: Default `https://openrouter.ai/api/v1`

## License

MIT

## Credits

Inspired by [PageAgent](https://github.com/nicekate/PageAgent) — the original vision of LLM-powered browser agents.
