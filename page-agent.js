// page-agent.js — DOM operation layer injected into target pages
(function () {
  'use strict';
  if (window.__aiAgent) return;

  // Interactive element selectors
  const ALL_SELECTORS = [
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
  const SEARCH_BOX_SELECTORS = [
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
  const SEARCH_BTN_SELECTORS = [
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
  const FIRST_RESULT_SELECTORS = [
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
  const POPUP_DISMISS_SELECTORS = [
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

  window.__aiAgent = {

    // ==================== 1. DOM Extraction Engine ====================
    // Inspired by PageAgent dom/dom_tree/index.js (1706 lines), simplified to ~350 lines

    _domCache: new WeakMap(),
    _rectCache: new WeakMap(),
    _styleCache: new WeakMap(),
    _highlightEls: [],
    _highlightContainer: null,

    // --- Cached DOM queries ---
    _getCachedRect(el) {
      if (this._rectCache.has(el)) return this._rectCache.get(el);
      const rect = el.getBoundingClientRect();
      this._rectCache.set(el, rect);
      return rect;
    },
    _getCachedStyle(el) {
      if (this._styleCache.has(el)) return this._styleCache.get(el);
      const style = window.getComputedStyle(el);
      this._styleCache.set(el, style);
      return style;
    },

    // --- Element visibility ---
    _isElementVisible(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
      const style = this._getCachedStyle(el);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      return true;
    },

    // --- Interactivity scoring (0-10) ---
    _scoreInteractive(el) {
      let score = 0;
      const tag = el.tagName.toLowerCase();

      // Native interactive tags
      if (/^(a|button|input|select|textarea)$/.test(tag)) score += 5;
      if (/^(video|audio|iframe)$/.test(tag)) score += 3;

      // Role-based
      const role = el.getAttribute('role');
      if (role === 'button' || role === 'link' || role === 'textbox' || role === 'searchbox') score += 4;
      if (role === 'tab' || role === 'menuitem' || role === 'option') score += 3;

      // Event handlers
      if (el.onclick || el.getAttribute('onclick')) score += 4;
      if (el.getAttribute('tabindex') && el.getAttribute('tabindex') !== '-1') score += 3;

      // Cursor style
      const style = this._getCachedStyle(el);
      if (style && style.cursor === 'pointer') score += 2;

      // Interactive attributes
      if (el.href && tag === 'a') score += 3;
      if (el.type && /submit|button|reset/.test(el.type)) score += 3;
      if (el.contentEditable === 'true') score += 4;

      // Has text or ARIA label
      if ((el.textContent || '').trim().length > 0 && tag !== 'script') score += 1;
      if (el.getAttribute('aria-label')) score += 1;

      return score;
    },

    // --- Scrollable detection ---
    _getScrollData(el) {
      const style = this._getCachedStyle(el);
      if (!style) return null;
      const overflowX = style.overflowX;
      const overflowY = style.overflowY;
      const scrollableX = overflowX === 'auto' || overflowX === 'scroll';
      const scrollableY = overflowY === 'auto' || overflowY === 'scroll';
      if (!scrollableX && !scrollableY) return null;
      const sw = el.scrollWidth - el.clientWidth;
      const sh = el.scrollHeight - el.clientHeight;
      if (sw < 4 && sh < 4) return null;
      return {
        top: el.scrollTop,
        bottom: el.scrollHeight - el.clientHeight - el.scrollTop,
        left: el.scrollLeft,
        right: el.scrollWidth - el.clientWidth - el.scrollLeft,
      };
    },

    // --- Element coordinates ---
    _getCoords(el) {
      const rect = this._getCachedRect(el);
      return {
        x: Math.round(rect.left),
        y: Math.round(rect.top + window.scrollY),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        cx: Math.round(rect.left + rect.width / 2),
        cy: Math.round(rect.top + rect.height / 2),
        inViewport: rect.top >= 0 && rect.top < window.innerHeight,
      };
    },

    // --- Essential attributes ---
    _getAttrs(el) {
      const attrs = {};
      if (el.id) attrs.id = el.id;
      if (typeof el.className === 'string' && el.className) attrs.class = el.className.substring(0, 60);
      if (el.title) attrs.title = el.title;
      if (el.href) attrs.href = el.href.substring(0, 100);
      if (el.src) attrs.src = el.src.substring(0, 100);
      if (el.type) attrs.type = el.type;
      if (el.name) attrs.name = el.name;
      if (el.value && el.tagName === 'INPUT') attrs.value = String(el.value).substring(0, 60);
      if (el.placeholder) attrs.placeholder = el.placeholder;
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) attrs.ariaLabel = ariaLabel;
      const role = el.getAttribute('role');
      if (role) attrs.role = role;
      if (el.disabled) attrs.disabled = true;
      if (el.checked) attrs.checked = true;
      return attrs;
    },

    // --- Shadow DOM / iframe content extraction ---
    _extractShadowContent(el) {
      if (!el.shadowRoot) return null;
      const items = [];
      for (const child of el.shadowRoot.children) {
        const extracted = this._extractElement(child, 0, 2);
        if (extracted) items.push(extracted);
      }
      return items.length ? items : null;
    },

    // --- Single element extraction ---
    _extractElement(el, depth, maxDepth) {
      if (depth > maxDepth || !el) return null;
      if (el.nodeType !== 1) return null;
      // Skip hidden elements early
      if (!this._isElementVisible(el)) return null;
      // Skip script/style/noscript/meta
      const tag = el.tagName.toLowerCase();
      if (/^(script|style|noscript|meta|link|head)$/.test(tag)) return null;
      // Skip our own overlays
      if (el.hasAttribute('data-page-agent-ignore')) return null;
      // Skip aria-hidden
      if (el.getAttribute('aria-hidden') === 'true') return null;

      const rect = this._getCachedRect(el);
      if (rect.width < 2 || rect.height < 2) return null;

      const score = this._scoreInteractive(el);
      const scrollData = this._getScrollData(el);
      const text = (el.childNodes.length === 1 && el.firstChild.nodeType === 3)
        ? el.textContent.trim().substring(0, 120) : '';

      const result = {
        tag,
        text,
        attrs: score >= 2 ? this._getAttrs(el) : (el.id ? { id: el.id } : {}),
        score,
        scrollable: scrollData,
        children: [],
        _el: el,
      };

      // Handle iframe
      if (tag === 'iframe') {
        try {
          const doc = el.contentDocument;
          if (doc && doc.body) {
            const iframeContent = this._extractElement(doc.body, depth + 1, maxDepth);
            if (iframeContent) result.children.push(iframeContent);
          } else {
            result.text = '[跨域 iframe: ' + (el.src || '').substring(0, 60) + ']';
          }
        } catch (e) {
          result.text = '[iframe 不可访问]';
        }
        return result;
      }

      // Handle Shadow DOM
      if (el.shadowRoot) {
        const shadowItems = this._extractShadowContent(el);
        if (shadowItems) result.children.push(...shadowItems);
      }

      // Recurse children
      for (const child of el.children) {
        const childResult = this._extractElement(child, depth + 1, maxDepth);
        if (childResult) result.children.push(childResult);
      }

      return result;
    },

    // --- Flatten tree to interactive elements list ---
    _flattenTree(node, result) {
      if (!node) return;
      // Keep elements with score >= 2 (meaningfully interactive)
      if (node.score >= 2) {
        result.push(node);
      }
      // Always recurse into children
      if (node.children) {
        for (const child of node.children) {
          this._flattenTree(child, result);
        }
      }
    },

    // --- Highlight elements on page ---
    _highlightElements(elements) {
      this._clearHighlights();
      // Create container
      let container = document.getElementById('pc-dom-highlights');
      if (!container) {
        container = document.createElement('div');
        container.id = 'pc-dom-highlights';
        container.setAttribute('data-page-agent-ignore', 'true');
        container.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:0;z-index:2147483639;pointer-events:none;';
        document.body.appendChild(container);
      }
      this._highlightContainer = container;

      elements.forEach((item, i) => {
        const el = item._el;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;

        const overlay = document.createElement('div');
        overlay.className = 'pc-dom-hl';
        overlay.style.cssText = `
          position:fixed;left:${rect.left}px;top:${rect.top}px;
          width:${rect.width}px;height:${rect.height}px;
          border:2px solid rgba(0,255,136,0.7);background:rgba(0,255,136,0.06);
          border-radius:4px;pointer-events:none;
        `;
        // Index label
        const label = document.createElement('span');
        label.textContent = i;
        label.style.cssText = `
          position:absolute;top:-16px;left:0;
          background:#00ff88;color:#000;font-size:10px;font-weight:bold;
          padding:1px 4px;border-radius:3px;line-height:14px;
        `;
        overlay.appendChild(label);
        container.appendChild(overlay);
        this._highlightEls.push(overlay);
      });
    },

    _clearHighlights() {
      for (const el of this._highlightEls) el.remove();
      this._highlightEls = [];
    },

    // --- Main snapshot: replaces old snapshot() ---
    snapshot(maxDepth, doHighlight) {
      maxDepth = maxDepth || 5;
      doHighlight = doHighlight !== false;

      // Clear caches
      this._domCache = new WeakMap();
      this._rectCache = new WeakMap();
      this._styleCache = new WeakMap();

      // Extract DOM tree
      const tree = this._extractElement(document.body, 0, maxDepth);

      // Flatten to interactive elements
      const flat = [];
      this._flattenTree(tree, flat);

      // Build output (remove _el references)
      const elements = flat.map((item, i) => {
        const coords = this._getCoords(item._el);
        return {
          index: i,
          tag: item.tag,
          text: item.text,
          attrs: item.attrs,
          coords,
          scrollable: !!item.scrollable,
        };
      });

      // Highlight if requested
      if (doHighlight) this._highlightElements(flat);

      return {
        url: window.location.href,
        title: document.title,
        site: detectSite(),
        elementCount: elements.length,
        elements,
      };
    },

    // ==================== 2. Current Page Info ====================
    getPageInfo() {
      const site = detectSite();
      return {
        url: window.location.href,
        title: document.title,
        hostname: window.location.hostname,
        site,
        hasSearchBox: !!document.querySelector(SEARCH_BOX_SELECTORS.join(',')),
        hasVideo: !!document.querySelector('video'),
        hasForm: !!document.querySelector('form'),
        scrollHeight: document.body.scrollHeight,
        scrollY: window.scrollY
      };
    },

    // ==================== 3. Page Text Extraction ====================
    getText(maxChars) {
      maxChars = maxChars || 3000;
      // Try article/main content first
      const contentSelectors = [
        'article', 'main', '[role="main"]',
        '.post-content', '.article-content', '.entry-content',
        '#content', '.content', '.post-body',
        '.story', '.text'
      ];
      for (const sel of contentSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.innerText || el.textContent || '';
          if (text.length > 100) return text.substring(0, maxChars);
        }
      }
      // Fallback: body text minus nav/footer/sidebar
      const body = document.body.cloneNode(true);
      body.querySelectorAll('nav, header, footer, script, style, noscript, iframe').forEach(el => el.remove());
      return (body.innerText || body.textContent || '').substring(0, maxChars);
    },

    // ==================== 4. Price Extraction ====================
    getPrices() {
      const prices = [];
      const pricePattern = /[\$€£¥₹￥]\s*[\d,]+\.?\d*|[\d,]+\.?\d*\s*(?:USD|EUR|GBP|CNY|JPY|元)/g;

      // Amazon price selectors
      const amazonPrices = document.querySelectorAll(
        '.a-price .a-offscreen, .a-price-whole, [data-a-color="price"] .a-offscreen'
      );
      amazonPrices.forEach(el => {
        const text = el.textContent.trim();
        if (text) prices.push({ text, context: el.closest('.s-result-item, [data-component-type]')?.querySelector('h2, h3')?.textContent?.trim()?.substring(0, 80) || '' });
      });

      // Generic price extraction from page text
      if (prices.length === 0) {
        const text = document.body.innerText;
        const matches = text.match(pricePattern);
        if (matches) {
          matches.slice(0, 10).forEach(m => prices.push({ text: m, context: '' }));
        }
      }

      return prices;
    },

    // ==================== 5. Search Box ====================
    findSearchBox() {
      for (const sel of SEARCH_BOX_SELECTORS) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return findIndexBySelector(el);
      }
      return -1;
    },

    typeInSearchBox(text) {
      for (const sel of SEARCH_BOX_SELECTORS) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
          el.click();

          try {
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, text);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, selector: sel, value: text, method: 'execCommand' };
          } catch (e) { }

          try {
            const setter = (el.tagName === 'INPUT'
              ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
              : Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
            )?.set;
            if (setter) setter.call(el, text); else el.value = text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, selector: sel, value: text, method: 'setter' };
          } catch (e) { }

          el.value = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return { success: true, selector: sel, value: text, method: 'direct' };
        }
      }
      return { success: false, error: 'Search box not found' };
    },

    clickSearchButton() {
      for (const sel of SEARCH_BTN_SELECTORS) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.click();
          el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
          return { success: true, selector: sel };
        }
      }
      return { success: false };
    },

    findSearchButton() {
      for (const sel of SEARCH_BTN_SELECTORS) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) return findIndexBySelector(el);
      }
      return -1;
    },

    // ==================== 6. First Result ====================
    clickFirstResult() {
      for (const sel of FIRST_RESULT_SELECTORS) {
        const el = document.querySelector(sel);
        if (el && (el.href || el.querySelector('a'))) {
          const link = el.href ? el : el.querySelector('a');
          if (!link) continue;
          return findIndexBySelector(link);
        }
      }
      return -1;
    },

    // ==================== 7. Bilibili Video ====================
    clickFirstBiliVideo() {
      const BV_PATTERN = /\/video\/(BV[a-zA-Z0-9]{10})/;
      const resultContainers = [
        '.search-content', '.video-list', '.card-list',
        '#search-card-list', '.search-card', '[class*="search"]'
      ];

      for (const containerSel of resultContainers) {
        const container = document.querySelector(containerSel);
        if (!container) continue;
        const links = container.querySelectorAll('a[href*="/video/"]');
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          if (BV_PATTERN.test(href)) {
            return { success: true, url: href.startsWith('//') ? 'https:' + href : href, text: link.textContent?.trim().substring(0, 80) };
          }
        }
      }

      const excludeSelectors = [
        '.v-inline-player', '[class*="upload"]', '[class*="member"]',
        '[class*="creator"]', 'nav', 'header', 'footer',
        '.bili-header', '.right-entry', '.left-entry'
      ];

      for (const link of document.querySelectorAll('a[href*="/video/"]')) {
        const href = link.getAttribute('href') || '';
        if (!BV_PATTERN.test(href)) continue;
        if (excludeSelectors.some(sel => link.closest(sel))) continue;
        return { success: true, url: href.startsWith('//') ? 'https:' + href : href, text: link.textContent?.trim().substring(0, 80) };
      }
      return { success: false, error: 'No Bilibili video link found' };
    },

    // ==================== 8. YouTube Video ====================
    clickFirstYouTubeVideo() {
      const selectors = [
        'ytd-video-renderer a#video-title',
        'ytd-video-renderer a#thumbnail',
        'ytd-rich-item-renderer a#video-title-link',
        'a[href*="/watch?v="]'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.href?.includes('/watch')) {
          return { success: true, url: el.href, text: el.textContent?.trim().substring(0, 80) };
        }
      }
      return { success: false, error: 'No YouTube video link found' };
    },

    // ==================== 9. Hacker News Top Stories ====================
    getHackerNewsTopStories() {
      const stories = [];
      document.querySelectorAll('.athing').forEach(row => {
        const titleLink = row.querySelector('.titleline > a');
        const subtext = row.nextElementSibling;
        const score = subtext?.querySelector('.score')?.textContent || '';
        const comments = subtext?.querySelector('a[href*="item?id"]:last-child')?.textContent || '';
        if (titleLink) {
          stories.push({
            title: titleLink.textContent.trim(),
            url: titleLink.href,
            score,
            comments
          });
        }
      });
      return stories.slice(0, 15);
    },

    // ==================== 10. Generic Link Extraction ====================
    getLinks(filter) {
      const links = [];
      const seen = new Set();
      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.href;
        if (!href || href.startsWith('javascript:') || href.startsWith('#') || seen.has(href)) return;
        seen.add(href);
        const text = (a.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 100);
        if (!text) return;
        if (filter === 'articles' && !/article|post|story|blog|news|read/i.test(text + href)) return;
        if (filter === 'videos' && !/video|watch|play|tube|bili/i.test(text + href)) return;
        if (filter === 'products' && !/product|item|buy|shop|price|\$|€|£|¥/i.test(text + href)) return;
        links.push({ text, url: href });
      });
      return links.slice(0, 20);
    },

    // ==================== 11. Element Operations ====================
    click(index) {
      const el = this._getElement(index);
      if (!el) return { success: false, error: 'Element not found: ' + index };

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const rect = el.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y };

      el.dispatchEvent(new MouseEvent('mouseover', opts));
      el.dispatchEvent(new MouseEvent('mouseenter', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.focus();
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));

      return { success: true, tag: el.tagName, text: (el.textContent || '').substring(0, 50).trim() };
    },

    type(index, text) {
      const el = this._getElement(index);
      if (!el) return { success: false, error: 'Element not found: ' + index };

      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
      el.click();

      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        const setter = (el.tagName === 'INPUT'
          ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
          : Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
        )?.set;
        if (setter) setter.call(el, text); else el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      }

      return { success: true, value: text };
    },

    pressKey(index, key) {
      const el = index >= 0 ? this._getElement(index) : document.activeElement;
      const target = el || document.activeElement;
      target.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true }));
      target.dispatchEvent(new KeyboardEvent('keypress', { key, code: key, bubbles: true }));
      target.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true }));
      return { success: true, key };
    },

    scroll(direction, amount) {
      amount = amount || 600;
      const delta = direction === 'up' ? -amount : amount;
      window.scrollBy({ top: delta, behavior: 'smooth' });
      return { success: true, scrollY: window.scrollY + delta };
    },

    scrollTo(position) {
      if (position === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
      else if (position === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      else if (typeof position === 'number') window.scrollTo({ top: position, behavior: 'smooth' });
      return { success: true };
    },

    scrollMultiple(times, direction) {
      times = Math.min(times || 3, 10);
      direction = direction || 'down';
      const amount = direction === 'up' ? -600 : 600;
      let i = 0;
      const interval = setInterval(() => {
        window.scrollBy({ top: amount, behavior: 'smooth' });
        if (++i >= times) clearInterval(interval);
      }, 800);
      return { success: true, scrolled: times };
    },

    // ==================== 12. Form Filling ====================
    fillForm(fields) {
      // fields: [{name: 'email', value: 'test@example.com'}, {selector: '#password', value: 'xxx'}]
      const results = [];
      for (const field of fields) {
        let el = null;
        if (field.selector) {
          el = document.querySelector(field.selector);
        } else if (field.name) {
          el = document.querySelector(`input[name="${field.name}"], textarea[name="${field.name}"], input[id="${field.name}"]`);
        } else if (field.label) {
          // Find label by text, then get associated input
          const labels = document.querySelectorAll('label');
          for (const label of labels) {
            if (label.textContent.toLowerCase().includes(field.label.toLowerCase())) {
              el = label.querySelector('input, textarea, select') ||
                   document.getElementById(label.getAttribute('for'));
              break;
            }
          }
        }
        if (!el) {
          results.push({ field: field.name || field.selector, success: false, error: 'Not found' });
          continue;
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        if (el.tagName === 'SELECT') {
          el.value = field.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          const setter = (el.tagName === 'INPUT'
            ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
            : Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
          )?.set;
          if (setter) setter.call(el, field.value); else el.value = field.value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        results.push({ field: field.name || field.selector, success: true });
      }
      return results;
    },

    // ==================== 13. Search Results Parsing ====================
    parseSearchResults() {
      const results = [];

      // Google
      document.querySelectorAll('#search .g, #rso .g, [data-hveid]').forEach(item => {
        const link = item.querySelector('a[href]');
        const title = item.querySelector('h3');
        if (!link || !title) return;
        const url = link.href;
        if (!url || url.startsWith('javascript:')) return;
        results.push({ title: title.textContent.trim(), url, snippet: (item.textContent || '').replace(title.textContent, '').trim().substring(0, 200), isVideo: this._isVideo(url, title.textContent) });
      });

      // Baidu
      if (!results.length) {
        document.querySelectorAll('.result, .c-container').forEach(item => {
          const link = item.querySelector('a[href]');
          const title = item.querySelector('h3, .t');
          if (!link || !title) return;
          results.push({ title: title.textContent.trim(), url: link.href, snippet: (item.textContent || '').replace(title.textContent, '').trim().substring(0, 200), isVideo: this._isVideo(link.href, title.textContent) });
        });
      }

      // Bing
      if (!results.length) {
        document.querySelectorAll('#b_results .b_algo').forEach(item => {
          const link = item.querySelector('a[href]');
          const snippet = item.querySelector('.b_caption p');
          if (!link) return;
          results.push({ title: link.textContent.trim(), url: link.href, snippet: snippet?.textContent?.trim()?.substring(0, 200) || '', isVideo: this._isVideo(link.href, link.textContent) });
        });
      }

      // Bilibili
      if (!results.length) {
        document.querySelectorAll('.video-list-item, .bili-video-card').forEach(item => {
          const link = item.querySelector('a[href*="/video"]');
          const title = item.querySelector('.title, h3, .bili-video-card__info--tit');
          if (!link) return;
          results.push({ title: (title || link).textContent.trim(), url: link.href.startsWith('//') ? 'https:' + link.href : link.href, snippet: '', isVideo: true });
        });
      }

      // YouTube
      if (!results.length) {
        document.querySelectorAll('ytd-video-renderer').forEach(item => {
          const link = item.querySelector('a#video-title, a#thumbnail');
          if (!link) return;
          results.push({ title: link.textContent?.trim() || '', url: link.href || '', snippet: '', isVideo: true });
        });
      }

      // Amazon
      if (!results.length) {
        document.querySelectorAll('[data-component-type="s-search-result"]').forEach(item => {
          const link = item.querySelector('h2 a, a.a-link-normal');
          if (!link) return;
          const price = item.querySelector('.a-price .a-offscreen')?.textContent?.trim() || '';
          results.push({ title: link.textContent.trim(), url: link.href, snippet: price, isVideo: false });
        });
      }

      // Hacker News
      if (!results.length) {
        document.querySelectorAll('.athing .titleline > a').forEach(link => {
          results.push({ title: link.textContent.trim(), url: link.href, snippet: '', isVideo: false });
        });
      }

      return { results, count: results.length, site: detectSite() };
    },

    // ==================== 14. Video Detection & Playback ====================
    findVideo() {
      const videos = [];
      document.querySelectorAll('video').forEach((v, i) => {
        videos.push({ type: 'native', index: i, src: v.src || v.currentSrc, paused: v.paused, duration: v.duration || 0 });
      });

      const playButtons = [];
      const selectors = [
        '.ytp-large-play-button', '.ytp-play-button',
        '.bpx-player-ctrl-play', '.bilibili-player-video-btn-start',
        '.bili-player-video-btn-start', '.video-play-button',
        'button[aria-label*="播放"]', 'button[aria-label*="Play"]',
        'button[class*="play"]', '.prism-big-play-btn',
        '.ytp-cued-thumbnail-overlay'
      ];
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(btn => {
          if (btn.offsetParent !== null) {
            playButtons.push({ selector: sel, text: (btn.textContent || '').trim(), ariaLabel: btn.getAttribute('aria-label') || '' });
          }
        });
      });

      return { videos, playButtons, hasVideo: videos.length > 0 };
    },

    playVideo() {
      const video = document.querySelector('video');
      if (video && !video.paused) return { success: true, method: 'already_playing' };

      if (video && video.paused) {
        video.muted = true;
        video.play().catch(() => {});
      }

      const selectors = [
        '.ytp-large-play-button', '.ytp-play-button',
        '.bpx-player-ctrl-play', '.bilibili-player-video-btn-start',
        '.bili-player-video-btn-start', '.video-play-button',
        'button[aria-label*="播放"]', 'button[aria-label*="Play"]',
        '.prism-big-play-btn', '.ytp-cued-thumbnail-overlay'
      ];
      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn && btn.offsetParent !== null) {
          btn.click();
          return { success: true, method: 'button', selector: sel };
        }
      }

      const player = document.querySelector('.bpx-player-video-wrap, .bilibili-player-video-wrap, .player-wrap, .html5-video-player');
      if (player) { player.click(); return { success: true, method: 'player_click' }; }
      if (video) return { success: true, method: 'video.play()' };
      return { success: false, error: 'No video or play button found' };
    },

    // ==================== 15. Utilities ====================
    _getElement(index) {
      return getVisibleElements()[index] || null;
    },

    dismissPopups() {
      POPUP_DISMISS_SELECTORS.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (el.offsetParent !== null && el.offsetWidth > 0) el.click();
        });
      });
      // Hide overlay elements
      document.querySelectorAll('[class*="modal"][style*="display: block"], [class*="overlay"][style*="display: block"]').forEach(el => {
        el.style.display = 'none';
      });
    },

    _hasElement(selector) { return !!document.querySelector(selector); },
    _getUrl() { return window.location.href; },
    _isVideo(url, title) {
      return /youtube|bilibili|youku|iqiyi|vimeo|dailymotion|video/.test(url) ||
             /视频|video|发布会|直播|播放|movie|film/i.test(title);
    },

    // ==================== 16. Visual Animation System ====================

    _animOverlay: null,
    _animCursor: null,
    _animStyle: null,

    _isPageDark() {
      try {
        // Strategy 1: class detection
        const darkClasses = ['dark', 'dark-mode', 'theme-dark', 'night', 'night-mode'];
        for (const cls of darkClasses) {
          if (document.documentElement.classList.contains(cls)) return true;
          if (document.body && document.body.classList.contains(cls)) return true;
        }
        // Strategy 2: data-theme attribute
        const theme = document.documentElement.getAttribute('data-theme');
        if (theme && theme.toLowerCase().includes('dark')) return true;
        // Strategy 3: background color luminance
        const bg = getComputedStyle(document.body || document.documentElement).backgroundColor;
        const rgb = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgb) {
          const lum = 0.299 * parseInt(rgb[1]) + 0.587 * parseInt(rgb[2]) + 0.114 * parseInt(rgb[3]);
          return lum < 128;
        }
      } catch (e) {}
      return false;
    },

    _injectAnimCSS() {
      if (this._animStyle) return;
      const dark = this._isPageDark();
      const colors = dark
        ? ['#e94560', '#0f3460', '#16213e']
        : ['#ff6b8a', '#4a7fdb', '#2d4a7a'];
      const bg = dark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)';

      this._animStyle = document.createElement('style');
      this._animStyle.textContent = `
        @keyframes pp-spin-a { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pp-spin-b { from { transform: rotate(120deg); } to { transform: rotate(480deg); } }
        @keyframes pp-spin-c { from { transform: rotate(240deg); } to { transform: rotate(600deg); } }
        @keyframes pp-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pp-fade-out { from { opacity: 1; } to { opacity: 0; } }
        @keyframes pp-cursor-click {
          0% { transform: translate(-50%,-50%) scale(1); opacity: 0.8; }
          50% { transform: translate(-50%,-50%) scale(2.5); opacity: 0; }
          100% { transform: translate(-50%,-50%) scale(1); opacity: 0; }
        }
        @keyframes pp-ripple {
          0% { width: 0; height: 0; opacity: 0.6; }
          100% { width: 80px; height: 80px; opacity: 0; }
        }

        #pc-overlay {
          position: fixed; inset: 0; z-index: 2147483640;
          pointer-events: none;
          animation: pp-fade-in 0.4s ease-out;
        }
        #pc-overlay.hiding { animation: pp-fade-out 0.3s ease-in forwards; }
        #pc-overlay .pc-backdrop {
          position: absolute; inset: 0;
          background: ${bg};
          backdrop-filter: blur(4px);
        }
        #pc-overlay .pc-glow {
          position: absolute; inset: 0;
          border-radius: 16px; margin: 20px;
          overflow: hidden;
        }
        #pc-overlay .pc-glow .pc-layer {
          position: absolute; inset: -40px;
          border-radius: 16px;
          filter: blur(60px);
          opacity: 0.55;
        }
        #pc-overlay .pc-glow .pc-layer-a {
          background: conic-gradient(from 0deg, ${colors[0]}, ${colors[1]}, ${colors[2]}, ${colors[0]});
          animation: pp-spin-a 4s linear infinite;
        }
        #pc-overlay .pc-glow .pc-layer-b {
          background: conic-gradient(from 120deg, ${colors[1]}, ${colors[2]}, ${colors[0]}, ${colors[1]});
          animation: pp-spin-b 4s linear infinite;
        }
        #pc-overlay .pc-glow .pc-layer-c {
          background: conic-gradient(from 240deg, ${colors[2]}, ${colors[0]}, ${colors[1]}, ${colors[2]});
          animation: pp-spin-c 4s linear infinite;
        }
        #pc-overlay .pc-border {
          position: absolute; inset: 20px;
          border: 3px solid ${colors[0]};
          border-radius: 16px;
          opacity: 0.3;
          box-shadow: 0 0 30px ${colors[0]}44, inset 0 0 30px ${colors[0]}22;
        }

        #pc-cursor {
          position: fixed; z-index: 2147483641;
          width: 20px; height: 20px;
          pointer-events: none;
          transition: left 0.3s ease, top 0.3s ease;
        }
        #pc-cursor .pc-cursor-dot {
          position: absolute; inset: 0;
          border-radius: 50%;
          background: ${colors[0]};
          box-shadow: 0 0 12px ${colors[0]}, 0 0 24px ${colors[0]}66;
          opacity: 0.9;
        }
        #pc-cursor .pc-cursor-ring {
          position: absolute; inset: -6px;
          border-radius: 50%;
          border: 2px solid ${colors[0]}88;
          opacity: 0.5;
        }
        #pc-cursor.clicking .pc-cursor-dot {
          animation: pp-cursor-click 0.35s ease-out;
        }
        #pc-cursor .pc-ripple {
          position: absolute; left: 50%; top: 50%;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          border: 2px solid ${colors[0]};
          animation: pp-ripple 0.6s ease-out forwards;
        }
      `;
      document.head.appendChild(this._animStyle);
    },

    showOverlay() {
      this._injectAnimCSS();
      if (this._animOverlay) return;
      const ov = document.createElement('div');
      ov.id = 'pc-overlay';
      ov.setAttribute('data-page-agent-ignore', 'true');
      ov.innerHTML = `
        <div class="pc-backdrop"></div>
        <div class="pc-glow">
          <div class="pc-layer pc-layer-a"></div>
          <div class="pc-layer pc-layer-b"></div>
          <div class="pc-layer pc-layer-c"></div>
        </div>
        <div class="pc-border"></div>
      `;
      document.body.appendChild(ov);
      this._animOverlay = ov;

      // Create cursor
      if (!this._animCursor) {
        const cur = document.createElement('div');
        cur.id = 'pc-cursor';
        cur.setAttribute('data-page-agent-ignore', 'true');
        cur.innerHTML = '<div class="pc-cursor-dot"></div><div class="pc-cursor-ring"></div>';
        cur.style.left = '-100px';
        cur.style.top = '-100px';
        document.body.appendChild(cur);
        this._animCursor = cur;
      }
    },

    hideOverlay() {
      if (this._animOverlay) {
        this._animOverlay.classList.add('hiding');
        const ov = this._animOverlay;
        setTimeout(() => { ov.remove(); }, 300);
        this._animOverlay = null;
      }
      if (this._animCursor) {
        this._animCursor.style.left = '-100px';
      }
    },

    moveCursorTo(x, y) {
      if (!this._animCursor) this.showOverlay();
      this._animCursor.style.left = x + 'px';
      this._animCursor.style.top = y + 'px';
    },

    moveCursorToElement(index) {
      const el = this._getElement(index);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      this.moveCursorTo(x, y);
    },

    cursorClick() {
      if (!this._animCursor) return;
      this._animCursor.classList.remove('clicking');
      void this._animCursor.offsetHeight; // force reflow
      this._animCursor.classList.add('clicking');
      // Add ripple
      const ripple = document.createElement('div');
      ripple.className = 'pc-ripple';
      this._animCursor.appendChild(ripple);
      setTimeout(() => { ripple.remove(); }, 600);
      setTimeout(() => { this._animCursor.classList.remove('clicking'); }, 350);
    },

    // --- State-aware glow colors ---
    setGlowState(state) {
      const palettes = {
        thinking: ['#4a90d9', '#2d5aa0', '#1a3a6e'],   // 蓝色 — 思考中
        executing: ['#e94560', '#0f3460', '#16213e'],   // 红色 — 执行中
        success:   ['#4ade80', '#16a34a', '#0d6832'],   // 绿色 — 成功
        error:     ['#ef4444', '#b91c1c', '#7f1d1d'],   // 暗红 — 错误
      };
      const colors = palettes[state] || palettes.executing;
      if (!this._animOverlay) return;
      const layers = this._animOverlay.querySelectorAll('.pc-layer');
      layers.forEach((layer, i) => {
        const offset = i * 120;
        layer.style.background = `conic-gradient(from ${offset}deg, ${colors[0]}, ${colors[1]}, ${colors[2]}, ${colors[0]})`;
      });
      const border = this._animOverlay.querySelector('.pc-border');
      if (border) border.style.borderColor = colors[0];
      // Update cursor color
      if (this._animCursor) {
        const dot = this._animCursor.querySelector('.pc-cursor-dot');
        if (dot) {
          dot.style.background = colors[0];
          dot.style.boxShadow = `0 0 12px ${colors[0]}, 0 0 24px ${colors[0]}66`;
        }
        const ring = this._animCursor.querySelector('.pc-cursor-ring');
        if (ring) ring.style.borderColor = colors[0] + '88';
      }
    },

    animClick(index) {
      this.moveCursorToElement(index);
      setTimeout(() => this.cursorClick(), 300);
    }
  };
})();
