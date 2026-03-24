# llm/ — LLM Integration

Handles communication with LLM providers and step planning.

## Modules

### client.js (184 lines)

**LLMClient class** — generic OpenAI-compatible client:
- `call(messages)` — send messages, returns response text
- `callWithTool(messages, tools)` — function calling (planned)
- Auto-handles API errors, retries, response normalization

**MacroTool** — step planner:
- Generates the system prompt with page context
- Parses LLM responses into structured step objects
- Response format: JSON with `action`, `target`, `text`, `reason`, `reflection`
- Validates actions and auto-corrects invalid parameters

**Model patches** — auto-adapts parameters for different providers:
- DeepSeek: lower temperature, specific headers
- Qwen: adjusted max_tokens
- Claude: system message placement
- GPT: standard OpenAI format
- Gemini: Google-specific parameters

**Prompt engineering**:
- System prompt includes page snapshot, previous results, and action constraints
- Enforces JSON-only responses
- Includes reflection/evaluation for self-correction
