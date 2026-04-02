# PageClaw

AI-powered browser automation for Chrome. Type `@ai` in the address bar and tell the AI what to do.

> 用自然语言控制浏览器。支持 Google、YouTube、Bilibili、Amazon、京东、淘宝、GitHub 等 21+ 网站。

## 效果演示

你输入：

```
@ai 在 Bilibili 搜索猫咪视频并播放第一个
```

AI 自动完成：

1. 打开 Bilibili → 在搜索框输入"猫咪视频" → 点击搜索按钮 → 点击第一个视频 → 开始播放

全程有**可视化动画反馈**：紫色屏幕边框闪烁、AI 虚拟光标移动、元素高亮编号、进度条实时更新。

## 功能特性

### 🤖 AI 自动化引擎

- **自然语言指令** — 地址栏输入 `@ai` + 你的指令，AI 自动规划并执行
- **Plan-then-Execute 架构** — LLM 先规划全部步骤，再逐步执行，每步可自我纠正
- **21+ 网站适配** — 针对不同网站有专门的选择器和交互逻辑
- **通用网页操作** — 不在支持列表中的网站也能用基础的点击/输入/滚动操作

### 🎨 可视化反馈系统

- **即时边框反馈** — 任务开始时紫色边框立即亮起（`inject-overlay.js`，`document_start` 注入）
- **状态卡片** — 右上角显示当前步骤描述、进度条、步骤计数器
- **AI 虚拟光标** — 红紫渐变箭头 + AI 徽章 + 5 轨残影轨迹
- **元素编号标签** — 可交互元素显示 [0][1][2] 彩色编号（12 色循环）
- **屏幕边框闪烁** — executing（紫色）/ thinking（蓝色）/ success（绿色）/ error（红色）四态
- **点击动画** — 3 环涟漪 + 8 方向彩色粒子爆发
- **步骤列表** — 显示所有步骤状态（⏳ 待定 / ⚡ 执行中 / ✅ 完成 / ❌ 失败）

### 📋 Popup 任务启动器

点击扩展图标打开 Popup 面板：

- **快速输入框** — 直接输入指令，Enter 执行
- **模板卡片** — 最多 4 个常用指令模板，点击复制或一键启动
- **历史记录** — 最近 3 条任务，显示相对时间，点击复制或启动
- **运行指示器** — 任务执行时显示旋转加载动画
- **设置入口** — 一键跳转到设置页面

### 💬 对话历史

- 每个标签页独立维护最近 20 轮对话
- LLM 规划时自动注入最近 5 轮上下文，支持 follow-up 指令
- 标签页关闭时自动清理

### 🔧 错误恢复引擎

自动分类和恢复 6 种错误类型：

| 错误类型 | 恢复策略 |
|---------|---------|
| 元素未找到 | 重新快照 → 备选选择器 → 滚动查找 |
| 元素过期 | 重新快照 → 重新注入 → 滚动查找 |
| 元素不可交互 | 关闭弹窗 → 滚动到视图 → 等待重试 |
| 点击被拦截 | 关闭弹窗 → 滚动到视图 → 等待重试 |
| 超时 | 等待更久 → 检查导航 → 重新注入 |
| 页面跳转 | 等待稳定 → 重新注入 → 重新快照 |

### ⚡ 性能优化

- **三层缓存**：注入缓存（避免重复注入）+ 计划缓存（LRU 50 条，相同指令秒回）+ 页面模块打包（6 个脚本合并为 1 个）
- **渐进式 DOM 就绪检测** — 轮询 `document.readyState` 替代固定等待，页面加载速度提升 3-4 倍
- **智能元素等待** — `waitForElement()` 轮询目标元素出现，替代硬编码 sleep

## 支持的网站

| 网站 | 能力 |
|------|------|
| Google | 搜索、导航结果、阅读摘要 |
| YouTube | 搜索、点击视频、播放/暂停 |
| Bilibili | 搜索、播放视频、阅读评论 |
| Amazon / 京东 / 淘宝 | 搜索、查看详情、加入购物车 |
| Hacker News | 阅读热帖、导航链接 |
| GitHub | 搜索仓库、浏览代码 |
| Wikipedia | 搜索、阅读文章 |
| Google Translate | 翻译文本 |
| 通用网站 | 点击、输入、滚动、阅读内容 |

## 项目架构

```
pageclaw/
├── manifest.json              Chrome MV3 扩展清单（v0.11.0）
├── build.sh                   构建脚本（合并 page/ → page-bundle.js）
│
├── worker/                    🔧 Service Worker 层（扩展后台）
│   ├── background.js          入口：注册 omnibox、右键菜单、消息路由
│   ├── tab-manager.js         标签页生命周期、模块注入、agentCall
│   └── debugger-input.js      Chrome Debugger API 键盘输入模拟
│
├── core/                      🧠 任务引擎层
│   ├── engine.js              任务编排器（plan → execute 循环，最多 25 步）
│   ├── executor.js            步骤执行器（click/type/scroll/navigate 等 18 种操作）
│   ├── history.js             对话历史管理（每标签页最多 20 轮）
│   └── recovery.js            错误恢复引擎（6 种错误分类 + 恢复策略）
│
├── llm/                       🤖 LLM 集成层
│   └── client.js              LLM 客户端 + MacroTool 步骤规划 + 多模型适配
│
├── page/                      📄 页面注入模块（注入到目标网页）
│   ├── constants.js           CSS 选择器、网站检测、可见元素获取
│   ├── dom-engine.js          DOM 树提取与扁平化（三级 WeakMap 缓存）
│   ├── element-ops.js         元素交互操作（点击/输入/滚动/表单填充）
│   ├── page-info.js           页面信息提取（搜索结果/价格/链接/视频）
│   ├── animation.js           视觉动画系统（光标/高亮/覆盖层/进度条）
│   └── agent.js               入口：将所有模块绑定到 window.__aiAgent
│
├── utils/                     🛠️ 工具函数
│   └── sleep.js               异步 sleep 辅助函数
│
├── inject-overlay.js          即时边框覆盖层（content script，document_start 注入）
├── page-agent.js              单体回退文件（v0.5.0 前的旧版，保留兼容）
├── page-bundle.js             构建产物（page/ 下 6 个模块合并，1700+ 行）
├── service-worker.js          单体回退文件（v0.5.0 前的旧版，保留兼容）
│
├── popup.html / popup.js      Popup 任务启动器（模板 + 历史 + 快速输入）
├── options.html / options.js  设置页面（API Key、模型、端点配置）
│
├── icons/                     扩展图标（128px）
├── CHANGELOG.md               版本变更记录
├── README.md                  本文件
└── architecture-refactor.md   v0.5.0 架构重构文档
```

### 模块依赖关系

```
用户输入 "@ai ..."
      │
      ▼
┌─────────────────┐
│ worker/background │ ← omnibox / 右键菜单 / popup 消息
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  core/engine.js  │ ← 任务编排：plan → execute 循环
└──┬──────────┬───┘
   │          │
   ▼          ▼
┌──────┐  ┌──────────┐
│ llm/ │  │ core/    │
│client│  │executor  │ ← 步骤执行
└──┬───┘  └────┬─────┘
   │           │
   │    ┌──────┴──────┐
   │    ▼             ▼
   │ ┌────────────────────┐
   │ │ worker/tab-manager │ ← 注入 + agentCall
   │ └─────────┬──────────┘
   │           ▼
   │ ┌────────────────────┐
   │ │ page/agent.js      │ ← window.__aiAgent（33 个方法）
   │ │ → dom-engine.js    │
   │ │ → element-ops.js   │
   │ │ → page-info.js     │
   │ │ → animation.js     │
   │ │ → constants.js     │
   │ └────────────────────┘
   │
   │   ┌──────────────────┐
   └──→│ core/history.js  │ ← 记录对话上下文
       └──────────────────┘
```

## 快速开始

### 安装

1. **克隆项目**
   ```bash
   git clone <repo-url> pageclaw
   cd pageclaw
   ```

2. **加载扩展**
   - 打开 Chrome，地址栏输入 `chrome://extensions/`
   - 右上角开启 **开发者模式**（Developer mode）
   - 点击 **加载已解压的扩展程序**（Load unpacked）
   - 选择 `pageclaw` 项目文件夹

3. **配置 API Key**
   - 点击扩展图标 → 点击左下角 ⚙️ 设置
   - 选择一个 AI 提供商（推荐 OpenRouter），获取 API Key
   - 粘贴 API Key，点击保存
   - 点击"测试连接"验证是否可用

4. **开始使用**
   - 在地址栏输入 `@ai` + 空格 + 你的指令
   - 按 Enter，AI 开始执行

### 快捷设置选项

| 预设 | Base URL | 默认模型 |
|------|----------|---------|
| OpenRouter (Gemini Flash) | `https://openrouter.ai/api/v1` | `google/gemini-2.0-flash` |
| OpenRouter (MiMo) | `https://openrouter.ai/api/v1` | `xiaomi/mimo-v2-pro` |
| OpenAI (GPT-4o Mini) | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Ollama (本地) | `http://localhost:11434/v1` | `llama3` |

支持任何 OpenAI 兼容的 API 端点。

### 所需权限说明

| 权限 | 用途 |
|------|------|
| `activeTab` | 访问当前标签页内容 |
| `scripting` | 向页面注入自动化脚本 |
| `storage` | 保存 API Key 和设置 |
| `omnibox` | 注册 `@ai` 地址栏快捷指令 |
| `debugger` | 低级别键盘输入模拟（用于特殊输入法场景） |
| `webNavigation` | 检测页面导航和 SPA 路由变化，重新注入覆盖层 |

## 工作流程

```
用户在地址栏输入 "@ai 搜索猫咪视频"
    │
    ▼
Omnibox 捕获指令
    │
    ▼
LLM 规划步骤（plan）
    │  Step 1: navigate → bilibili.com
    │  Step 2: type → 搜索框输入"猫咪视频"
    │  Step 3: click → 搜索按钮
    │  Step 4: click → 第一个视频
    │  Step 5: analyze → 确认播放状态
    │
    ▼
Engine 逐步执行
    │
    ├─ 每一步：
    │   1. 页面快照（dom-engine → 可见元素列表）
    │   2. 注入 page 模块（tab-manager → agentCall）
    │   3. 执行操作（element-ops → click/type/scroll）
    │   4. 返回结果 → LLM 决定下一步
    │   5. 更新视觉反馈（animation → 进度条/光标/高亮）
    │
    ├─ 出错时：
    │   1. classifyError() 识别错误类型
    │   2. getRecoveryStrategy() 获取恢复策略
    │   3. 自动重试（最多 3 次，按策略逐步降级）
    │   4. 仍失败 → LLM 重新规划（replan）
    │
    └─ 完成后：
        记录到 ConversationHistory → 隐藏覆盖层 → 显示结果
```

## 开发指南

### 构建系统

PageClaw 使用一个简单的 shell 脚本将 `page/` 目录下的 6 个模块合并为单个 `page-bundle.js`：

```bash
# 修改 page/ 下的任何文件后，重新构建
bash build.sh

# 输出：Built page-bundle.js: XXX lines, XXX bytes
```

> **什么时候需要 build？** 修改了 `page/` 目录下的任何 `.js` 文件后都需要运行 `bash build.sh`。其他目录（`worker/`、`core/`、`llm/`）的修改直接生效，不需要构建。

### 模块说明

#### `worker/` — Service Worker 层

扩展的后台入口，运行在独立的 Service Worker 线程中。

- **background.js**（97 行）— 注册 omnibox (`@ai`)、右键菜单、popup 消息监听，将指令路由到 `core/engine.js`
- **tab-manager.js**（139 行）— 标签页管理核心：
  - `injectPageAgent(tabId)` — 通过 `chrome.scripting.executeScript` 注入页面模块
  - `agentCall(tabId, method, ...args)` — 从 Service Worker 调用页面端的 `window.__aiAgent` 方法
  - `waitForDOMReady()` / `waitForElement()` / `waitForLoad()` — 智能等待函数
  - `detectNewTab()` — 检测由操作打开的新标签页
- **debugger-input.js**（33 行）— 使用 Chrome Debugger API 模拟低级别键盘输入

#### `core/` — 任务引擎层

LLM 规划和页面执行之间的编排层。

- **engine.js**（93 行）— 任务编排器：
  - `executeAITask(instruction, tabId, llm)` — 主入口，最多执行 25 步
  - 每步循环：获取页面快照 → LLM 决定下一步 → 执行 → 反馈结果 → 重复
- **executor.js**（208 行）— 18 种步骤执行器：
  - 基础操作：`click`、`type`、`pressKey`、`scroll`、`scrollTo`、`navigate`、`goBack`、`waitFor`
  - 高级操作：`analyze`、`clickFirstResult`、`findSearchBox`、`typeInSearchBox`、`clickSearchButton`、`fillForm`、`scrollMultiple`、`dismissPopups`
- **history.js**（103 行）— 对话历史管理：
  - 每个标签页独立的对话记录（最多 20 轮）
  - `formatForLLM()` — 格式化为紧凑文本注入 LLM 上下文
  - 标签页关闭时自动清理
- **recovery.js**（153 行）— 错误恢复引擎：
  - `classifyError()` — 将错误分为 6 种类型
  - `getRecoveryStrategy()` — 返回对应的恢复策略和行动列表
  - `generateFallbackSelectors()` — 生成备选 CSS 选择器（ID → ARIA → 文本 → 角色 → 类名 → href）

#### `llm/` — LLM 集成层

- **client.js**（184 行）— 包含三个组件：
  - `LLMClient` — 通用 OpenAI 兼容客户端，支持调用和错误重试
  - `MacroTool` — 步骤规划器，生成系统提示词、解析 LLM 响应为结构化步骤
  - 模型补丁 — 自动适配 DeepSeek/Qwen/Claude/GPT/Gemini 的参数差异

#### `page/` — 页面注入模块

通过 `chrome.scripting.executeScript` 注入到目标网页，所有模块绑定到 `window.__aiAgent`。

- **constants.js**（153 行）— CSS 选择器库 + `detectSite()` 网站识别 + `getVisibleElements()` 可见元素获取
- **dom-engine.js**（306 行）— DOM 树提取引擎，三级 WeakMap 缓存，生成页面元素快照
- **element-ops.js**（196 行）— 元素交互操作，完整的事件序列模拟（pointerdown → mousedown → pointerup → mouseup → click）
- **page-info.js**（330 行）— 页面信息提取，支持搜索结果/价格/链接/视频等结构化数据
- **animation.js**（303 行）— 视觉动画系统，所有覆盖层 `pointer-events: none` 不阻塞页面交互
- **agent.js**（54 行）— 入口 IIFE，将 33 个方法绑定到 `window.__aiAgent`，防重复初始化

### 代码风格

- **变量声明**：使用 `var`（不用 `const`/`let`），因为 Chrome MV3 Service Worker 中 `const` 被重新赋值会报错
- **模块系统**：ES Modules（`import`/`export`），Chrome 原生支持，无需打包工具
- **缩进**：Tab 缩进
- **字符串拼接**：使用 `+` 拼接（不用模板字符串），兼容性更好

### 添加新网站支持

1. 在 `page/constants.js` 的 `detectSite()` 中添加网站识别逻辑
2. 在 `page/constants.js` 的 `ALL_SELECTORS` 中添加该网站的选择器
3. 如需专用操作，在 `page/page-info.js` 中添加 `getXxxResults()` 方法
4. 运行 `bash build.sh` 重新构建 `page-bundle.js`
5. 刷新扩展（`chrome://extensions/` → 点击刷新按钮）

## 技术细节

### 页面模块注入流程

```
1. Service Worker 检查注入缓存（Set<tabId>）
2. 未注入 → 通过 chrome.scripting.executeScript 注入 page-bundle.js
3. page-bundle.js 执行 agent.js IIFE → window.__aiAgent 就绪
4. 后续操作通过 agentCall(tabId, method, ...args) 调用页面端方法
```

### 三层缓存机制

| 层级 | 实现 | 效果 |
|------|------|------|
| 注入缓存 | `Set<tabId>` + `Map<tabId, Promise>` 并发守卫 | 避免重复注入，并发安全 |
| 计划缓存 | LRU Map（最多 50 条），key = `site\|\|\|instruction` | 相同指令跳过 LLM，<1ms 响应 |
| 页面打包 | 6 个 page 模块合并为 1 个 page-bundle.js | 6 次注入 → 1 次注入 |

### DOM 提取引擎

- 三级 WeakMap 缓存：元素 → 可见性 → 交互性评分
- 可见性检查：尺寸、opacity、display、visibility
- 交互性评分（0-5）：根据标签类型、属性、角色计算
- 支持 iframe 内的元素提取

## 故障排除

### 问题：输入 @ai 后没有反应

- 确认扩展已正确加载（`chrome://extensions/` 中显示 PageClaw）
- 检查 API Key 是否已配置（点击扩展图标 → ⚙️ 设置）
- 检查 API Key 是否有效（设置页面点击"测试连接"）

### 问题：AI 执行到一半卡住

- 打开浏览器开发者工具（F12）→ Console 标签查看错误信息
- 可能是 LLM API 超时，检查网络连接
- 可能是目标网站结构变化，导致元素选择器失效

### 问题：某些网站操作失败

- 确认该网站在支持列表中
- 对于不支持的网站，AI 会尝试通用的点击/输入操作，但可能不够精准
- 尝试更具体的指令，比如"点击页面上写着 XXX 的按钮"

### 问题：修改了 page/ 下的代码但没有生效

- 修改 `page/` 目录下的文件后，需要运行 `bash build.sh` 重新生成 `page-bundle.js`
- 然后在 `chrome://extensions/` 中点击 PageClaw 的刷新按钮

## 配置参考

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| API Key | 无 | 必填，从 AI 提供商获取 |
| Model | `google/gemini-2.0-flash` | LLM 模型 ID |
| Base URL | `https://openrouter.ai/api/v1` | API 端点，支持任何 OpenAI 兼容接口 |

## 版本历史

| 版本 | 日期 | 核心内容 |
|------|------|---------|
| v0.11.0 | 2026-03-29 | Popup 任务启动器（模板卡片 + 历史记录 + 快速输入） |
| v0.10.0 | 2026-03-29 | Observe 步骤 + 按需 Replan（空结果触发重新规划） |
| v0.9.0 | 2026-03-29 | 智能步骤执行与错误恢复引擎（重试+重新规划+三级通知） |
| v0.8.0 | 2026-03-28 | 实时任务进度反馈（步骤列表 + 颜色进度条 + 呼吸动画） |
| v0.7.0 | 2026-03-28 | 即时覆盖层 + 对话历史（跨页面持久化） |
| v0.6.0 | 2026-03-25 | 三层缓存优化（注入/计划/打包） |
| v0.5.0 | 2026-03-24 | 架构模块化重构（13 个 ES 模块） |
| v0.4.0 | 2026-03-24 | DOM-ready 轮询替代固定等待（3-4 倍提速） |
| v0.3.0 | 2026-03-24 | 可视化动画系统 v4 |
| v0.2.0 | 2026-03-24 | DOM 提取引擎 + 10 场景支持 |
| v0.1.0 | 2026-03-23 | 初始版本：MV3 骨架 + omnibox + LLM 规划器 |

> 完整变更记录见 [CHANGELOG.md](./CHANGELOG.md)

## 隐私说明

- API Key 存储在 Chrome 本地，不会上传或共享
- 页面内容仅发送给你选择的 AI 提供商进行处理
- 本扩展不收集任何用户数据

## 致谢

灵感来自 [PageAgent](https://github.com/nicekate/PageAgent) — LLM 驱动浏览器代理的最初构想。

## License

MIT
