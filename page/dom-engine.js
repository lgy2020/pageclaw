// page/dom-engine.js — DOM Extraction Engine
// Expects: ALL_SELECTORS, getVisibleElements (from page/constants.js)
// Provides: object with snapshot() and DOM helper methods

var domEngine = {
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
    const container = document.getElementById('pc-dom-highlights');
    if (container) container.remove();
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
  
};
