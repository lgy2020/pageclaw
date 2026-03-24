# PageClaw Changelog

> 正式上线前均为 0.x 版本

## v0.4.0 — 2026-03-24

**perf: progressive DOM-ready detection, replace fixed sleeps with polling (3-4x faster page loads)**

- 新增 `waitForDOMReady()`: 轮询 document.readyState=interactive，不再等 complete
- 新增 `waitForElement()`: 轮询目标元素出现，替代固定 sleep
- 重写 `detectNewTab()`: 300ms 轮询替代硬编码 sleep(2500ms)
- navigate/type/click 所有步骤中 waitForLoad 全部替换为 waitForDOMReady
- 固定 sleep 全面缩减：步骤间 1000->300ms，dismiss 延迟 500->200ms，移除冗余 sleep
- page-agent.js 新增 `getReadyState()` 方法
- **效果**: Bilibili 搜索到点击视频从 ~20s 降至 ~6s（3-4x 提速）

## v0.3.0 — 2026-03-24

**feat: visual animation system v4 (screen border, status card, element labels, cursor trail, click particles)**

- 屏幕边框闪烁状态指示（executing/thinking/success/error 四态）
- 右上角状态卡片（步骤描述 + 进度条 + 计数器）
- 可交互元素 [0][1][2] 彩色编号标签（12 色循环）
- AI 虚拟光标（红紫渐变箭头 + AI 徽章 + 5 轨迹残影）
- 点击动画（3 环涟漪 + 8 方向彩色粒子爆发）
- 所有覆盖层 pointer-events: none，不阻塞页面交互

## v0.2.0 — 2026-03-24

**feat: DOM extraction engine with WeakMap caching, site detection, multi-scenario support**

- 1700+ 行 DOM 提取引擎（WeakMap 三级缓存、可见性检查、交互性评分）
- `detectSite()`: 15+ 网站自动识别（Google/YouTube/Bilibili/Amazon/HN/GitHub/JD/Taobao...）
- `getText()`: 页面正文提取（article/main 优先）
- `getPrices()`: 价格提取（Amazon 选择器 + 通用正则）
- `getHackerNewsTopStories()`: HN 结构化解析
- `getLinks()`: 通用链接提取
- `scrollMultiple()`: 连续滚动（懒加载场景）
- `fillForm()`: 表单填写（name/selector/label 三种定位）
- `dismissPopups()`: 30+ 弹窗关闭选择器
- popup.html 和 service-worker.js 中文化

## v0.1.0 — 2026-03-23

**init: MV3 extension skeleton with omnibox, LLM planner, basic step executor**

- Chrome Manifest V3 扩展骨架
- Omnibox 入口（地址栏输入 @ai 触发）
- LLM Planner（Plan-then-Execute 架构，一次规划全部步骤）
- 基础步骤执行器（navigate/type/click/pressKey/wait/scroll）
- LLM Client（OpenRouter API，30s 超时）
- 页面注入式 DOM 操作（executeScript，绕过 CSP）
- Chrome Debugger API 输入（适配 Vue 自定义组件）
- Bilibili/YouTube 搜索框和视频选择器
- 任务取消（AbortController）
- 命令历史（最近 20 条）
- Quick Setup 预设（OpenRouter/OpenAI/DeepSeek/Ollama）
