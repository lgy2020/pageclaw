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

    // ==================== 1. Page Snapshot ====================
    snapshot() {
      const elements = [];
      let idx = 0;

      document.querySelectorAll(ALL_SELECTORS.join(',')).forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (rect.bottom < -100 || rect.top > window.innerHeight * 4) return;
        const computed = window.getComputedStyle(el);
        if (computed.visibility === 'hidden' || computed.display === 'none') return;

        elements.push({
          index: idx++,
          tag: el.tagName.toLowerCase(),
          text: (el.textContent || '').trim().replace(/\s+/g, ' ').substring(0, 120),
          type: el.type || '',
          name: el.name || '',
          placeholder: el.placeholder || '',
          href: el.href || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          title: el.title || '',
          value: el.value || '',
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y + window.scrollY),
            w: Math.round(rect.width),
            h: Math.round(rect.height)
          }
        });
      });

      return {
        url: window.location.href,
        title: document.title,
        site: detectSite(),
        elementCount: elements.length,
        elements
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
    }
  };
})();
