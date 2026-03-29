// page/page-info.js — Page info, text/price extraction, site-specific operations
// Contains: getPageInfo, getText, getPrices, clickFirstResult,
//   clickFirstBiliVideo, clickFirstYouTubeVideo, getHackerNewsTopStories,
//   getLinks, parseSearchResults, findVideo, playVideo, utilities

var pageInfo = {
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
  getReadyState() { return document.readyState; },
  _isVideo(url, title) {
    return /youtube|bilibili|youku|iqiyi|vimeo|dailymotion|video/.test(url) ||
           /视频|video|发布会|直播|播放|movie|film/i.test(title);
  },

  // ==================== 16. Structured Data Extraction ====================
  extractData(extractConfig) {
    var config = extractConfig || {};
    var containerSel = config.selector || 'body';
    var maxItems = config.maxItems || 20;
    var fields = config.fields || [];
    try {
      if (config.type === 'list') {
        var containers = document.querySelectorAll(containerSel);
        var results = [];
        for (var ci = 0; ci < containers.length && ci < maxItems; ci++) {
          var item = {};
          for (var fi = 0; fi < fields.length; fi++) {
            var f = fields[fi];
            var el = containers[ci].querySelector(f.selector);
            if (el) {
              var attr = f.attr || 'text';
              if (attr === 'text') item[f.name] = (el.textContent || '').trim().substring(0, 200);
              else if (attr === 'href') item[f.name] = el.getAttribute('href') || '';
              else if (attr === 'src') item[f.name] = el.getAttribute('src') || '';
              else item[f.name] = el.getAttribute(attr) || '';
            } else { item[f.name] = ''; }
          }
          results.push(item);
        }
        return { success: true, data: results, count: results.length };
      }
      if (config.type === 'text') {
        var el = document.querySelector(containerSel);
        if (!el) return { success: false, data: null, count: 0, error: 'Element not found' };
        return { success: true, data: (el.textContent || '').trim().substring(0, 2000), count: 1 };
      }
      return { success: false, data: [], count: 0, error: 'Unknown type' };
    } catch (e) { return { success: false, data: [], count: 0, error: e.message }; }
  },

};
