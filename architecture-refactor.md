# PageClaw 架构重构技术方案

> 版本：v1.0 | 日期：2026-03-24 | 作者：WAWA鱼
> 目标：将当前 ~2200 行单文件代码重构为可扩展至 10,000+ 行的模块化架构

---

## 一、现状分析

### 1.1 当前代码结构

```
pageclaw/
  page-agent.js       1262 行  ← 16 个 section 塞在一个 IIFE 对象里
  service-worker.js    557 行  ← 6 个 section 塞在一个文件里
  popup.html/js        80/52 行
  options.html/js     140/94 行
  manifest.json        23 行
  CHANGELOG.md         57 行
  ─────────────────────────
  总计               2208 行
```

### 1.2 核心问题

| 问题 | 严重度 | 影响 |
|------|--------|------|
| **单文件巨型对象** | P0 | page-agent.js 1262 行一个 IIFE 对象，任何改动都是全局风险 |
| **无模块系统** | P0 | 不能按需加载、不能独立测试、不能复用 |
| **职责混乱** | P0 | DOM 提取、站点适配、动画系统、表单填写全混在一起 |
| **站点逻辑硬编码** | P1 | 15+ 站点的选择器和逻辑散落在各处，加新站点要改多个文件 |
| **LLM Prompt 写死** | P1 | 100+ 行 prompt 字符串硬编码在 LLMClient 里，无法按场景切换 |
| **无类型系统** | P2 | step 参数、返回值全靠猜，IDE 无提示 |
| **无错误分类** | P2 | 所有错误一视同仁，无法自动重试 |
| **无测试** | P2 | 无法回归验证，改一处坏一处 |
| **动画与业务耦合** | P2 | 视觉系统 300 行和 DOM 操作混在一个对象里 |

### 1.3 竞品架构参考：PageAgent（阿里开源）

PageAgent 是我们最重要的参考对象，51 个文件、~9200 行代码，其架构亮点：

```
page-agent/src/
  core/                        ← 核心引擎
    PageAgentCore.ts            主循环（ReAct + MacroTool 反思）
    dom/
      DomTreeBuilder.ts         1700 行 DOM 提取引擎
      DomUtils.ts               DOM 工具函数
      checkDarkMode.ts          暗色检测
    utils/
      autoFixer.ts              normalizeResponse 6 种修复
      modelPatch.ts             模型补丁系统
    logger.ts                   日志系统
  extension/                    ← Chrome 扩展层
    background/
      index.ts                  Service Worker 入口
    content-script/
      page-controller/          页面控制
        actions.ts              click/type/scroll 等原子操作
        pageAgent.ts            页面代理（注入到目标页）
    side-panel/                 UI（React + Tailwind）
  llms/                         ← LLM 适配层
    utils.ts                    模型补丁
    openai.ts / anthropic.ts    各模型适配器
```

**核心设计思想：**

1. **三层消息架构**：Side Panel → Service Worker → Content Script → DOM
2. **MacroTool 反思机制**：每步强制 LLM 输出 evaluation + next_goal
3. **模型补丁系统**：自动适配不同 LLM 的 API 差异
4. **DOM 引擎独立**：WeakMap 缓存 + 三级降级 + iframe/Shadow DOM 递归
5. **站点适配器模式**：每个站点是独立配置，不是散落的 if/else

---

## 二、目标架构

### 2.1 设计原则

| 原则 | 说明 |
|------|------|
| **ES Modules 原生** | Chrome MV3 原生支持 import/export，无需打包工具 |
| **单一职责** | 每个文件只做一件事 |
| **站点即插件** | 新增站点只需加一个配置文件 |
| **Prompt 即配置** | LLM prompt 独立管理，按场景组合 |
| **渐进式迁移** | 不一次性重写，按模块逐步拆分 |

### 2.2 目标目录结构

```
pageclaw/
├── manifest.json
├── CHANGELOG.md
├── README.md
│
├── core/                          # 核心引擎（平台无关）
│   ├── engine.js                  # 主引擎：任务调度、步骤循环、错误处理
│   ├── planner.js                 # 规划器：LLM 调用、步骤解析、动态重规划
│   ├── executor.js                # 执行器：步骤分发、结果收集、重试逻辑
│   ├── errors.js                  # 错误分类：7 种错误类型 + 可重试判定
│   └── state.js                   # 状态管理：任务状态、历史记录
│
├── page/                          # 页面交互层（注入到目标页）
│   ├── agent.js                   # 页面代理入口：window.__aiAgent 注册
│   ├── dom-extractor.js           # DOM 提取引擎：WeakMap 缓存、可见性、交互性
│   ├── element-ops.js             # 元素操作：click/type/scroll/fillForm
│   ├── page-info.js               # 页面信息：URL/标题/站点类型/表单检测
│   └── popup-dismiss.js           # 弹窗关闭：30+ 选择器
│
├── sites/                         # 站点适配器（插件化）
│   ├── registry.js                # 站点注册表：detectSite + 选择器映射
│   ├── generic.js                 # 通用站点（默认）
│   ├── bilibili.js                # B站：搜索框/视频结果/播放
│   ├── youtube.js                 # YouTube：搜索/视频/播放
│   ├── google.js                  # Google：搜索/结果
│   ├── amazon.js                  # Amazon：搜索/价格/结果
│   ├── hackernews.js              # Hacker News：头条解析
│   └── index.js                   # 站点适配器统一导出
│
├── llm/                           # LLM 适配层
│   ├── client.js                  # LLM 客户端：API 调用、超时、重试
│   ├── parser.js                  # 响应解析：normalizeResponse 6 种修复
│   ├── model-patch.js             # 模型补丁：DeepSeek/Qwen/Claude/GPT 适配
│   └── prompts/                   # Prompt 模板
│       ├── planner.js             # 规划 prompt（按场景组装）
│       ├── finder.js              # 元素查找 prompt
│       └── analyzer.js            # 页面分析 prompt
│
├── animation/                     # 视觉动画系统
│   ├── overlay.js                 # 状态卡片 + 屏幕边框
│   ├── cursor.js                  # 虚拟光标 + 轨迹 + 点击涟漪
│   ├── highlighter.js             # 元素高亮 + 编号标签
│   ├── dark-mode.js               # 暗色检测 + 配色适配
│   └── styles.js                  # CSS 样式（数组 join 方式）
│
├── worker/                        # Service Worker 层
│   ├── background.js              # 后台入口：消息路由、生命周期
│   ├── tab-manager.js             # 标签页管理：注入、等待、新 tab 检测
│   └── debugger-input.js          # Chrome Debugger API 输入
│
├── ui/                            # 用户界面
│   ├── popup.html
│   ├── popup.js
│   ├── options.html
│   └── options.js
│
└── utils/                         # 工具函数
    ├── sleep.js                   # sleep/waitForDOMReady/waitForElement
    └── history.js                 # 命令历史
```

### 2.3 模块职责与依赖关系

```
                    ┌─────────────┐
                    │   worker/   │  Service Worker 入口
                    │ background  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  core/   │ │  llm/    │ │  utils/  │
        │ engine   │ │ client   │ │ sleep    │
        │ planner  │ │ parser   │ │ history  │
        │ executor │ │ prompts/ │ └──────────┘
        │ errors   │ │ model-   │
        │ state    │ │ patch    │
        └────┬─────┘ └──────────┘
             │
     ┌───────┼───────┐
     ▼       ▼       ▼
┌────────┐┌────────┐┌────────┐
│ page/  ││ sites/ ││animati.│
│ agent  ││registr.││overlay │
│dom-ext.││bilibili││cursor  │
│elem-ops││youtube ││highligh│
│page-inf││generic ││styles  │
│popup-d.││  ...   ││dark-m. │
└────────┘└────────┘└────────┘
```

**依赖方向**：worker/ → core/ → {page/, sites/, llm/, animation/} → utils/
**禁止反向依赖**：page/ 和 sites/ 不能调用 core/ 或 worker/

---

## 三、核心模块详细设计

### 3.1 core/engine.js — 主引擎

职责：任务生命周期管理、步骤循环、错误处理、状态通知

```javascript
// 当前：executeAITask() 一个函数 70 行，包含所有逻辑
// 目标：TaskEngine 类，职责清晰分离

class TaskEngine {
  constructor({ planner, executor, state, tabManager, animation })

  async run(instruction, tabId)         // 主入口
  async _plan(instruction, pageInfo)    // 调用 planner
  async _executeSteps(plan, tabId)      // 步骤循环
  async _handleError(step, error, retryCount)  // 错误处理 + 重试
  async _onStepComplete(step, result)   // 步骤完成回调
  async cancel()                        // 取消任务
}
```

**对比当前代码：**

| 当前 | 重构后 |
|------|--------|
| executeAITask() 70 行全包 | TaskEngine.run() 调用 planner + executor |
| 步骤失败直接抛异常 | errors.js 分类 → 可重试自动 retry |
| LLM prompt 写死在 LLMClient | prompts/ 按场景动态组装 |
| agentCall 散落各处 | executor 统一调度 |

### 3.2 core/planner.js — 规划器

职责：调用 LLM 生成步骤计划、解析响应、动态重规划

```javascript
class Planner {
  constructor({ llmClient, prompts })

  async plan(instruction, pageInfo)     // 生成步骤计划
  async replan(instruction, remainingSteps, lastError)  // 动态重规划
  async findElement(description, snapshot)  // 元素定位
  async analyzeAndDecide(snapshot, results, goal)  // 页面分析决策
}
```

**Prompt 组装逻辑（当前 vs 目标）：**

```
当前：plan() 里直接拼一个 100+ 行的字符串

目标：
  prompts/planner.js
    basePrompt        // 基础规则（18 条操作规则）
    stepTypes         // 步骤类型定义
    examples(site)    // 按站点返回示例（B站/YouTube/Amazon...）
    → plan() 时动态组装：basePrompt + stepTypes + examples(currentSite)
```

### 3.3 core/executor.js — 执行器

职责：步骤分发、原子操作执行、结果收集

```javascript
class Executor {
  constructor({ tabManager, sites, animation })

  async execute(step, tabId, llm)       // 步骤分发
  async _navigate(step, tabId)          // 导航
  async _type(step, tabId, llm)         // 输入
  async _click(step, tabId, llm)        // 点击
  async _scroll(step, tabId)            // 滚动
  async _analyze(step, tabId, llm)      // 分析
  // ... 每种步骤一个方法
}
```

**对比当前：**

```
当前：executeStep() 一个 switch 150 行，所有 case 挤在一起
目标：每个 case 独立方法，Executor.execute() 只做分发
```

### 3.4 core/errors.js — 错误分类

参考 PageAgent 的 7 种错误类型：

```javascript
const ErrorType = {
  ELEMENT_NOT_FOUND: 'element_not_found',   // 可重试：重新 snapshot
  TIMEOUT: 'timeout',                       // 可重试：增加等待
  NAVIGATION_FAILED: 'navigation_failed',   // 可重试：重试导航
  LLM_PARSE_ERROR: 'llm_parse_error',       // 可重试：normalize + 重新调用
  LLM_API_ERROR: 'llm_api_error',           // 不可重试：API key/余额问题
  PAGE_CRASH: 'page_crash',                 // 不可重试：页面崩溃
  USER_CANCELLED: 'user_cancelled',         // 不可重试：用户取消
};

function classifyError(error) { ... }      // 错误分类
function isRetryable(errorType) { ... }    // 可重试判定
function getRetryDelay(retryCount) { ... } // 指数退避：1s → 2s → 4s
```

### 3.5 sites/ — 站点适配器（插件化）

**当前问题：** 15+ 站点的选择器和逻辑散落在 page-agent.js 各个 section

**目标设计：** 每个站点是一个配置对象

```javascript
// sites/bilibili.js
export default {
  id: 'bilibili',
  name: 'Bilibili',
  patterns: [
    { host: /bilibili\.com/, path: /\/search/ => 'bilibili-search' },
    { host: /bilibili\.com/, path: /\/video\// => 'bilibili-video' },
    { host: /bilibili\.com/ => 'bilibili' },
  ],
  selectors: {
    searchBox: ['textarea#chat-textarea', 'input.nav-search-input'],
    searchButton: ['.search-btn', 'button.nav-search-btn'],
    firstResult: ['.video-list-item .title', '.bili-video-card__info--right a'],
  },
  actions: {
    clickFirstVideo: (agent) => { ... },  // B站特有逻辑
  },
  examples: [                              // LLM prompt 示例
    { instruction: 'bilibili搜索XX播放第一个视频', steps: [...] },
  ],
};

// sites/registry.js
import bilibili from './bilibili.js';
import youtube from './youtube.js';

const sites = [bilibili, youtube, ...];

export function detectSite(url) {
  for (const site of sites) {
    for (const pattern of site.patterns) {
      if (pattern.host.test(hostname)) return site;
    }
  }
  return genericSite;
}

export function getSelectors(siteId, type) { ... }
export function getExamples(siteId) { ... }
```

**加新站点只需：** 创建 `sites/newsite.js` → 在 registry.js import → 完成

### 3.6 llm/parser.js — 响应解析

当前 `parseJSON()` 只做基本清理。参考 PageAgent 的 normalizeResponse 6 种修复：

```javascript
class ResponseParser {
  parse(rawText) {
    let text = rawText;
    text = this.stripMarkdown(text);      // 去掉 ```json ... ```
    text = this.extractJSON(text);        // 从混杂文本提取 JSON
    text = this.fixTrailingCommas(text);  // 修复尾逗号
    text = this.fixSingleQuotes(text);    // 单引号 → 双引号
    return JSON.parse(text);
  }

  stripMarkdown(text) { ... }
  extractJSON(text) { ... }
  fixTrailingCommas(text) { ... }
  fixSingleQuotes(text) { ... }
}
```

### 3.7 animation/ — 动画系统

从 page-agent.js 的 Section 16 拆分为 4 个独立模块：

```
animation/
  overlay.js     ← showOverlay/hideOverlay/updateStatus/setGlowState（~100 行）
  cursor.js      ← _createCursor/moveCursorTo/animClick（~150 行）
  highlighter.js ← highlightElements/_clearHighlights（~80 行）
  styles.js      ← _injectAnimCSS 全部 CSS（~100 行）
  dark-mode.js   ← _isPageDark 三策略检测（~30 行，新增）
```

### 3.8 llm/prompts/ — Prompt 管理

```
当前：LLMClient.plan() 里一个 120 行的字符串

目标：
llm/prompts/
  planner.js     ← 基础规则 + 步骤类型定义
  examples.js    ← 11 个场景示例（按站点分组）
  finder.js      ← findElement prompt
  analyzer.js    ← analyzeAndDecide prompt

使用方式：
  import { buildPlanPrompt } from './prompts/planner.js';
  import { getExamples } from '../sites/registry.js';

  const prompt = buildPlanPrompt({
    instruction,
    pageInfo,
    examples: getExamples(siteId),  // 动态获取当前站点示例
  });
```

---

## 四、迁移策略

### 4.1 渐进式迁移（不一次性重写）

**Phase 1：目录结构 + 入口拆分**（~2 小时）
- 创建目标目录结构
- manifest.json 改为 service_worker 指向 worker/background.js
- worker/background.js 导入当前所有逻辑（暂不拆分内部）
- 验证扩展能正常加载和运行

**Phase 2：拆分 page-agent.js**（~3 小时）
- animation/ 模块拆出（最独立，风险最低）
- sites/ 适配器拆出（按站点提取配置）
- page/ 模块拆出（dom-extractor、element-ops 等）
- page/agent.js 作为入口 import 所有子模块

**Phase 3：拆分 service-worker.js**（~2 小时）
- core/engine.js 拆出主引擎
- core/planner.js 拆出规划器
- core/executor.js 拆出执行器
- core/errors.js 新增错误分类
- llm/ 模块拆出（client、parser、prompts）

**Phase 4：增强功能**（~3 小时）
- llm/parser.js 实现 normalizeResponse
- llm/model-patch.js 实现模型补丁
- core/errors.js 实现重试机制
- animation/dark-mode.js 实现暗色检测

**总计预估：~10 小时**（可分 3-4 天完成）

### 4.2 验证策略

每完成一个 Phase，在 Chrome 中加载扩展测试：

```
测试清单：
  □ 地址栏 @ai 输入指令能正常触发
  □ Google 搜索正常
  □ Bilibili 搜索→点击视频正常
  □ YouTube 搜索→播放视频正常
  □ 动画效果正常（边框闪、状态卡、光标、高亮）
  □ 任务取消正常
  □ Options 页面保存配置正常
```

### 4.3 兼容性保证

- ES Modules：Chrome 92+ 原生支持（MV3 requirement: Chrome 88+）
- 不引入任何 npm 依赖、不需要打包工具
- 所有 import 使用相对路径（`./dom-extractor.js`）
- manifest.json 的 background.service_worker 保持指向单一入口文件

---

## 五、关键架构决策

### 5.1 为什么不用 TypeScript？

| 选项 | 优势 | 劣势 |
|------|------|------|
| TypeScript | 类型安全、IDE 提示 | 需要构建步骤、增加复杂度 |
| **JSDoc + JS** | 无需构建、渐进添加类型 | 类型覆盖不完整 |

**决策：用 JSDoc 注释提供类型提示，不引入构建工具。**

```javascript
/**
 * @typedef {Object} Step
 * @property {'navigate'|'type'|'click'} type
 * @property {string} [url]
 * @property {string} [target]
 * @property {string} [value]
 * @property {string} description
 */

/**
 * @param {Step} step
 * @param {number} tabId
 * @returns {Promise<{newTabId?: number}>}
 */
async execute(step, tabId) { ... }
```

### 5.2 为什么不用 React？

PageAgent 用 React + Tailwind 做 Side Panel UI。PageClaw 的 UI 只有 popup（52 行）和 options（94 行），用 vanilla HTML/JS 完全够用。引入 React 会增加 200KB+ 的包体积。

**决策：UI 保持 vanilla HTML/JS，直到功能复杂度真正需要组件化。**

### 5.3 page-agent.js 注入策略

当前所有 page/ 代码打包成一个文件注入。重构后有两种选择：

| 选项 | 方案 | 优劣 |
|------|------|------|
| A. 打包注入 | 构建时合并为一个文件 | 需要构建步骤 |
| **B. 单入口导入** | agent.js 作为入口，import 子模块 | MV3 原生支持，无需构建 |

**决策：用方案 B。** page/agent.js 作为入口文件，通过 ES Module import 加载子模块。Chrome 的 executeScript 支持注入 ES module（需在 manifest 中声明 `"type": "module"`）。

```javascript
// manifest.json
"background": {
  "service_worker": "worker/background.js",
  "type": "module"
}

// worker/background.js
import { TaskEngine } from '../core/engine.js';
import { Planner } from '../core/planner.js';

// 注入 page-agent 时也用 module 类型
chrome.scripting.executeScript({
  target: { tabId },
  files: ['page/agent.js'],  // 这是 ES module
});
```

---

## 六、预期效果

### 6.1 代码组织

| 指标 | 当前 | 重构后 |
|------|------|--------|
| 最大单文件行数 | 1262 | < 300 |
| 文件数量 | 7 | ~30 |
| 加新站点 | 改 2-3 个文件 | 加 1 个文件 |
| 加新步骤类型 | 改 switch + prompt | 加 executor 方法 + prompt |
| 定位 bug | 全文搜索 | 按模块定位 |

### 6.2 可扩展性

```
当前加一个新站点的工作量：
  1. page-agent.js 加 detectSite 条件     （改核心文件）
  2. page-agent.js 加搜索框选择器          （改核心文件）
  3. page-agent.js 加搜索按钮选择器        （改核心文件）
  4. page-agent.js 加结果选择器            （改核心文件）
  5. page-agent.js 加 clickXxxVideo 方法   （改核心文件）
  6. service-worker.js 加 click case       （改核心文件）
  7. service-worker.js 加 LLM prompt 示例  （改核心文件）
  → 改动 2 个核心文件，7 处修改

重构后加一个新站点：
  1. 创建 sites/newsite.js                 （新建文件）
  2. 在 sites/registry.js 加 import        （一行）
  → 改动 1 行 + 新建 1 个文件
```

### 6.3 为未来功能铺路

重构后的架构直接支持之前列出的未实现功能：

| 功能 | 重构后如何实现 |
|------|---------------|
| normalizeResponse | llm/parser.js 独立实现 |
| 模型补丁 | llm/model-patch.js 独立实现 |
| 错误重试 | core/errors.js + engine.js 重试循环 |
| 暗色检测 | animation/dark-mode.js 独立实现 |
| 截图分析 | core/planner.js 加 screenshot 分支 |
| ReAct 混合模式 | core/engine.js 加 replan 调用 |
| 执行日志 | core/state.js 加 log 记录 |

---

## 七、风险与对策

| 风险 | 概率 | 对策 |
|------|------|------|
| ES Module 注入兼容性 | 低 | Chrome 92+ 原生支持，MV3 最低要求 88+ |
| 拆分过程中引入 bug | 中 | 每 Phase 完成后跑测试清单 |
| 文件数量增加导致加载变慢 | 低 | ES Module 有缓存，且 page-agent 只注入一次 |
| 重构期间功能开发停滞 | 中 | 分 Phase 进行，每个 Phase < 3 小时 |

---

## 附录 A：当前代码 → 目标模块映射

| 当前文件 | 当前行范围 | 目标模块 |
|----------|-----------|----------|
| page-agent.js L1-155 | DOM 选择器 + detectSite | sites/registry.js + sites/*.js |
| page-agent.js L157-451 | DOM 提取引擎 | page/dom-extractor.js |
| page-agent.js L452-490 | 页面信息 + 文本提取 | page/page-info.js |
| page-agent.js L491-584 | 价格/搜索框/结果 | page/element-ops.js + sites/ |
| page-agent.js L598-687 | B站/YouTube/HN 专项 | sites/bilibili.js + youtube.js + hackernews.js |
| page-agent.js L688-964 | 元素操作/表单/视频 | page/element-ops.js |
| page-agent.js L965-1262 | 动画系统 | animation/*.js |
| service-worker.js L7-32 | Omnibox | worker/background.js |
| service-worker.js L34-56 | 消息处理 | worker/background.js |
| service-worker.js L58-129 | 主引擎 | core/engine.js |
| service-worker.js L131-281 | 步骤执行器 | core/executor.js |
| service-worker.js L282-432 | LLM 客户端 | llm/client.js + llm/prompts/ |
| service-worker.js L433-557 | 工具函数 | utils/ + worker/tab-manager.js |

## 附录 B：参考资源

- PageAgent 源码：https://github.com/alibaba/page-agent （52 stars, Apache-2.0）
- Chrome Extension MV3 ES Modules：https://developer.chrome.com/docs/extensions/develop/migrate/improve-serviceworker-ability
- PageClaw PRD v3.0：https://www.feishu.cn/docx/MEyNd3AqroPrSqxjzBwc92IynEf
- PageClaw 竞品深度分析 v2：https://www.feishu.cn/docx/Ut0cd8AczobUpNxyqiTcLNUpnPf
