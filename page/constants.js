// page/constants.js — DOM selectors, site detection, shared helpers
// Globals: ALL_SELECTORS, SEARCH_BOX_SELECTORS, etc.
// Globals: getVisibleElements(), detectSite(), POPUP_DISMISS_SELECTORS

// Interactive element selectors
var ALL_SELECTORS = [
  'a[href]', 'button', 'input', 'textarea', 'select',
  '[role="button"]', '[role="link"]', '[role="textbox"]',
  '[role="searchbox"]', '[onclick]', '[tabindex]:not([tabindex="-1"])',
  'video', 'iframe[src*="youtube"]', 'iframe[src*="bilibili"]',
  'iframe[src*="vimeo"]', 'iframe[src*="dailymotion"]'
];

function getVisibleElements() {
  const all = document.querySelectorAll(ALL_SELECTORS.join(','));
  return Array.from(all).filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

function findIndexBySelector(el) {
  if (!el) return -1;
  return getVisibleElements().indexOf(el);
}

// ---- Site detection ----
function detectSite() {
  const h = window.location.hostname.toLowerCase();
  const u = window.location.href.toLowerCase();
  if (/google\./.test(h) && /\/search/.test(u)) return 'google-search';
  if (/google\./.test(h)) return 'google';
  if (/youtube/.test(h) && /\/results|\/search/.test(u)) return 'youtube-search';
  if (/youtube/.test(h) && /\/watch/.test(u)) return 'youtube-watch';
  if (/youtube/.test(h)) return 'youtube';
  if (/bilibili/.test(h) && /\/search/.test(u)) return 'bilibili-search';
  if (/bilibili/.test(h) && /\/video\//.test(u)) return 'bilibili-video';
  if (/bilibili/.test(h)) return 'bilibili';
  if (/amazon\./.test(h) && /\/s[?/]/.test(u)) return 'amazon-search';
  if (/amazon\./.test(h)) return 'amazon';
  if (/bing\.com/.test(h) && /\/search/.test(u)) return 'bing-search';
  if (/bing\.com/.test(h)) return 'bing';
  if (/baidu\.com/.test(h) && /\/s[?]/.test(u)) return 'baidu-search';
  if (/baidu\.com/.test(h)) return 'baidu';
  if (/news\.ycombinator/.test(h)) return 'hackernews';
  if (/github\.com/.test(h)) return 'github';
  if (/twitter\.com|x\.com/.test(h)) return 'twitter';
  if (/reddit\.com/.test(h)) return 'reddit';
  if (/jd\.com/.test(h)) return 'jd';
  if (/taobao\.com/.test(h)) return 'taobao';
  if (/tmall\.com/.test(h)) return 'tmall';
  return 'generic';
}

// Search box selectors (multi-site, prioritized)
var SEARCH_BOX_SELECTORS = [
  // Bilibili
  'textarea#chat-textarea', 'input.nav-search-input',
  // Baidu
  'input#kw[name="wd"]', 'input[name="wd"]',
  // Google
  'input[name="q"][type="text"]', 'input[name="q"]', 'textarea[name="q"]',
  // Bing
  'input[name="q"][id="sb_form_q"]',
  // DuckDuckGo
  'input[name="q"][id="search_form_input"]',
  // Amazon
  'input#twotabsearchtextbox', 'input[name="field-keywords"]',
  // Taobao / JD
  'input#q', 'input#key',
  // YouTube
  'input#search', 'input[name="search_query"]',
  // GitHub
  'input[name="query-builder"]', 'input#query-builder-test',
  // Twitter/X
  'input[aria-label="Search query"]', 'input[data-testid="SearchBox_Search_Input"]',
  // Reddit
  'input[name="q"]', 'input[aria-label="Search Reddit"]',
  // Generic
  'input[type="search"]', 'input[role="searchbox"]',
  'input[aria-label*="search" i]', 'input[aria-label*="搜索" i]',
  'input[placeholder*="search" i]', 'input[placeholder*="搜索" i]',
  'input[name="search"]', 'input[name="keyword"]', 'input[name="keywords"]'
];

// Search button selectors
var SEARCH_BTN_SELECTORS = [
  '.nav-search-btn',
  '#chat-submit-button', '#su', 'input#su',
  'button[aria-label="Google Search"]', 'input[name="btnK"]',
  'button[aria-label="Search"]', 'label[aria-label="Search"]',
  '#nav-search-submit-button',
  '.search-button',
  'button#search-icon-legacy',
  'button[type="submit"]', 'input[type="submit"]',
  'button[aria-label*="Search" i]', 'button[aria-label*="搜索" i]'
];

// First result selectors
var FIRST_RESULT_SELECTORS = [
  // Bilibili
  '.search-content .video-list-item a[href*="/video"]',
  '.video-list-item a[href*="/video"]',
  '.bili-video-card a[href*="/video"]',
  // Google
  '#search .g a[href]:not([href*="google.com"])',
  '#rso .g a[href]:not([href*="google.com"])',
  // Bing
  '#b_results .b_algo a[href]',
  // Baidu
  '.result a[href]', '.c-container a[href]',
  // Amazon
  '[data-component-type="s-search-result"] a[href*="/dp/"]',
  '.s-result-item h2 a',
  // YouTube
  'ytd-video-renderer a#video-title',
  'ytd-video-renderer a#thumbnail',
  // Hacker News
  '.titleline > a',
  // GitHub
  '.repo-list-item a[href]',
  // Reddit
  '[data-testid="post-container"] a[data-click-id="body"]',
  // Generic
  'main a[href]', '[role="main"] a[href]',
  '.results a[href]:first-of-type', '.search-results a[href]:first-of-type'
];

// ---- Popup/overlay dismissal patterns ----
var POPUP_DISMISS_SELECTORS = [
  // Cookie consent (common patterns)
  'button[id*="accept" i]', 'button[id*="consent" i]',
  'button[aria-label*="Accept" i]', 'button[aria-label*="同意" i]',
  '[data-cky-tag="accept-button"]',
  // Close buttons
  'button[aria-label="Close"]', '[aria-label="关闭"]', '.nCP5yc',
  'button[aria-label*="close" i]', 'button[aria-label*="dismiss" i]',
  '[class*="modal"] button[class*="close"]',
  '[class*="overlay"] button[class*="close"]',
  // Login/signup popups
  '.dialog-close', '.pass-login-close', '.pass-login-cancel',
  '.pass-login-closeBtn',
  // Notification prompts
  'button[aria-label*="Not now" i]', 'button[aria-label*="No thanks" i]',
  'button[aria-label*="以后再说" i]',
  // Bilibili
  '.bdsug-ai-upgrade', '.chat-input-panel', '.bdsug', '.sug-box',
  // Generic newsletter/modals
  '[class*="newsletter"] [class*="close"]',
  '[class*="popup"] [class*="close"]',
  '[class*="modal"] [aria-label*="close" i]'
];

