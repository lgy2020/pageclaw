# core/ — Task Engine

The orchestration layer between LLM planning and page execution.

## Modules

### engine.js (93 lines)
Task orchestrator. Manages the plan-execute-analyze loop:
- `executeAITask(instruction, tabId, llm)` — main entry, runs up to 25 steps
- `getCurrentTask()` / `stopCurrentTask()` — task state management
- Each step: get page snapshot → LLM decides next action → execute → repeat

### executor.js (208 lines)
Step executor. Translates LLM-decided actions into page operations:
- **click**(target) — click by index, selector, or text
- **type**(target, text) — type text into an element
- **pressKey**(key) — press keyboard keys (Enter, Tab, Escape, etc.)
- **scroll**(direction, amount) — scroll page up/down
- **scrollTo**(target) — scroll to specific element
- **waitFor**(seconds) — wait for animations/loading
- **navigate**(url) — navigate to URL
- **goBack()** — browser back button
- **analyze** — read page content for LLM context
- **clickFirstResult** — click the first search result
- **findSearchBox** / **typeInSearchBox** / **clickSearchButton** — search workflow helpers
- **fillForm**(fields) — fill multiple form fields
- **scrollMultiple**(count, direction) — scroll multiple times
- **dismissPopups** — dismiss cookie banners, modals, etc.
