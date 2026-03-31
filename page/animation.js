// page/animation.js — Visual Animation System v4
// Contains: screen border, status card, cursor trail, click particles, highlight
// Provides: object with animation methods

var animSystem = {
  // ==================== 16. Visual Animation System v4 ====================
  
  _animOverlay: null, _animCursor: null, _animStyle: null,
  _screenBorder: null,
  _highlightContainer: null, _highlightEls: [], _highlightLabels: [], _indexedEls: [],
  _overlayHidden: false,
  _HL_COLORS: ['#FF0000','#00CC00','#0066FF','#FF8800','#8800CC','#008888','#FF3399','#4400CC','#FF4400','#228844','#CC0033','#336699'],
  
  _injectAnimCSS() {
    if (this._animStyle) return;
    var s = document.createElement('style');
    s.setAttribute('data-pageclaw-ignore', 'true');
    s.textContent = [
      '@keyframes pp-fade-in { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }',
      '@keyframes pp-fade-out { from { opacity: 1; } to { opacity: 0; } }',
      '@keyframes pp-label-pop { 0% { transform: scale(0); opacity: 0; } 70% { transform: scale(1.2); } 100% { transform: scale(1); opacity: 1; } }',
  
      // Screen border flash - shows when AI is controlling the page
      '#pc-screen-border { position: fixed; inset: 0; z-index: 2147483637; pointer-events: none; box-sizing: border-box; border: 4px solid transparent; transition: border-color 0.3s; }',
      '#pc-screen-border.active { border-color: #e94560; animation: pp-border-flash 1.5s ease-in-out infinite; }',
      '#pc-screen-border.thinking { border-color: #6366f1; animation: pp-border-flash-blue 1.5s ease-in-out infinite; }',
      '#pc-screen-border.success { border-color: #4ade80; animation: pp-border-flash-green 1s ease-in-out 2; }',
      '#pc-screen-border.error { border-color: #ef4444; animation: pp-border-flash-red 0.8s ease-in-out 3; }',
      '@keyframes pp-border-flash { 0%,100% { border-color: #e94560; box-shadow: inset 0 0 20px rgba(233,69,96,0.15); } 50% { border-color: #ff6b8a; box-shadow: inset 0 0 40px rgba(233,69,96,0.3); } }',
      '@keyframes pp-border-flash-blue { 0%,100% { border-color: #6366f1; box-shadow: inset 0 0 20px rgba(99,102,241,0.15); } 50% { border-color: #818cf8; box-shadow: inset 0 0 40px rgba(99,102,241,0.3); } }',
      '@keyframes pp-border-flash-green { 0%,100% { border-color: #4ade80; box-shadow: inset 0 0 15px rgba(74,222,128,0.15); } 50% { border-color: #22c55e; box-shadow: inset 0 0 30px rgba(74,222,128,0.3); } }',
      '@keyframes pp-border-flash-red { 0%,100% { border-color: #ef4444; box-shadow: inset 0 0 15px rgba(239,68,68,0.15); } 50% { border-color: #dc2626; box-shadow: inset 0 0 30px rgba(239,68,68,0.3); } }',
  
      // Status card (top-right, clean, no animated icon)
      '#pc-status { position: fixed; top: 16px; right: 16px; z-index: 2147483640; pointer-events: none; user-select: none; font-family: -apple-system, "Segoe UI", "PingFang SC", sans-serif; animation: pp-fade-in 0.3s ease-out; }',
      '#pc-status.hiding { animation: pp-fade-out 0.3s ease-in forwards; }',
      '#pc-status .pc-card { background: rgba(10,14,28,0.92); backdrop-filter: blur(20px); border: 2px solid rgba(233,69,96,0.5); border-radius: 14px; padding: 16px 20px; min-width: 260px; max-width: 360px; text-align: left; box-shadow: 0 20px 60px rgba(0,0,0,0.6); color: #eee; }',
      '#pc-status .pc-card.thinking { border-color: rgba(99,102,241,0.6); box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(99,102,241,0.2); }',
      '#pc-status .pc-card.executing { border-color: rgba(233,69,96,0.5); }',
      '#pc-status .pc-card.success { border-color: rgba(74,222,128,0.6); box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(74,222,128,0.2); }',
      '#pc-status .pc-card.error { border-color: rgba(239,68,68,0.6); box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(239,68,68,0.2); }',
      '#pc-status .pc-card-title { font-weight: 700; font-size: 16px; color: #e94560; margin-bottom: 6px; }',
      '#pc-status .pc-card.success .pc-card-title { color: #4ade80; }',
      '#pc-status .pc-card.error .pc-card-title { color: #ef4444; }',
      '#pc-status .pc-card.thinking .pc-card-title { color: #818cf8; }',
      '#pc-status .pc-card-step { font-size: 14px; color: #ddd; line-height: 1.4; margin-bottom: 12px; max-width: 260px; }',
      '#pc-status .pc-card-progress { height: 5px; border-radius: 3px; background: rgba(255,255,255,0.1); overflow: hidden; }',
      '#pc-status .pc-card-progress-bar { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #e94560, #ff6b8a); transition: width 0.5s ease; }',
      '#pc-status .pc-card.success .pc-card-progress-bar { background: linear-gradient(90deg, #22c55e, #4ade80); }',
      '#pc-status .pc-card.error .pc-card-progress-bar { background: linear-gradient(90deg, #dc2626, #ef4444); }',
      '#pc-status .pc-card.thinking .pc-card-progress-bar { background: linear-gradient(90deg, #6366f1, #818cf8); }',
      '#pc-status .pc-card-counter { font-size: 12px; color: #999; margin-top: 4px; }',
  
      // Element highlight
      '#pc-highlight-container { position: fixed; inset: 0; z-index: 2147483638; pointer-events: none; }',
  
      // AI cursor
      '#pc-cursor { position: fixed; z-index: 2147483641; width: 36px; height: 44px; pointer-events: none; transition: left 0.4s cubic-bezier(0.34,1.56,0.64,1), top 0.4s cubic-bezier(0.34,1.56,0.64,1); }',
      '#pc-cursor .pc-cursor-arrow { width: 36px; height: 44px; filter: drop-shadow(0 0 8px rgba(233,69,96,0.9)) drop-shadow(0 0 16px rgba(99,102,241,0.6)); animation: pp-cursor-glow 1.5s ease-in-out infinite; }',
      '@keyframes pp-cursor-glow { 0%,100% { filter: drop-shadow(0 0 8px rgba(233,69,96,0.9)) drop-shadow(0 0 16px rgba(99,102,241,0.6)); transform: scale(1); } 50% { filter: drop-shadow(0 0 14px rgba(233,69,96,1)) drop-shadow(0 0 28px rgba(99,102,241,0.8)); transform: scale(1.08); } }',
      '#pc-cursor .pc-cursor-ring { position: absolute; inset: -12px; border-radius: 50%; border: 2px solid rgba(233,69,96,0.4); animation: pp-ring-rotate 2s linear infinite; }',
      '@keyframes pp-ring-rotate { to { transform: rotate(360deg); } }',
      '#pc-cursor .pc-cursor-trail { position: absolute; pointer-events: none; opacity: 0; transition: none; }',
      '#pc-cursor .pc-ai-badge { position: absolute; top: -8px; left: 38px; background: linear-gradient(135deg, #e94560, #6366f1); color: #fff; font-size: 9px; font-weight: 800; padding: 2px 5px; border-radius: 6px; font-family: -apple-system, sans-serif; letter-spacing: 0.5px; box-shadow: 0 2px 8px rgba(233,69,96,0.5); animation: pp-badge-pulse 2s ease-in-out infinite; }',
      '@keyframes pp-badge-pulse { 0%,100% { opacity: 0.9; transform: scale(1); } 50% { opacity: 1; transform: scale(1.1); } }',
      '#pc-cursor.clicking .pc-cursor-arrow { animation: pp-cursor-click 0.4s ease-out !important; }',
      '@keyframes pp-cursor-click { 0% { transform: scale(1); } 30% { transform: scale(0.8); } 60% { transform: scale(1.15); } 100% { transform: scale(1); } }',
      '#pc-cursor .pc-ripple-ring { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); border-radius: 50%; border: 2px solid #e94560; animation: pp-ripple 0.8s ease-out forwards; pointer-events: none; }',
      '@keyframes pp-ripple { 0% { width: 0; height: 0; opacity: 1; } 100% { width: 100px; height: 100px; opacity: 0; } }',
      '@keyframes pp-ripple2 { 0% { width: 0; height: 0; opacity: 0.7; } 100% { width: 150px; height: 150px; opacity: 0; } }',
      '@keyframes pp-ripple3 { 0% { width: 0; height: 0; opacity: 0.5; } 100% { width: 200px; height: 200px; opacity: 0; } }',

      // Steps list
      '.pc-steps-list { max-height: 208px; overflow-y: auto; margin-top: 8px; mask-image: linear-gradient(to bottom, black calc(100% - 12px), transparent 100%); -webkit-mask-image: linear-gradient(to bottom, black calc(100% - 12px), transparent 100%); }',
      '.pc-step-item { display: flex; align-items: center; gap: 12px; padding: 4px 0; font-size: 12px; color: #aaa; border-radius: 4px; }',
      '.pc-step-item.active { color: #fff; animation: pp-step-pulse 1.5s ease-in-out infinite; }',
      '.pc-step-item.completed { color: #666; }',
      '.pc-step-item.failed { color: #ef4444; }',
      '.pc-step-item.pending { color: #666; opacity: 0.6; }',
      '.pc-step-item .pc-step-num { min-width: 18px; height: 18px; line-height: 18px; text-align: center; border-radius: 50%; background: rgba(255,255,255,0.1); font-size: 10px; font-weight: 600; }',
      '.pc-step-item .pc-step-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }',
      '.pc-step-item.completed .pc-step-num { background: #666; color: #222; }',
      '.pc-step-item.active .pc-step-num { background: #6366f1; color: #fff; }',
      '.pc-step-item.failed .pc-step-num { background: #ef4444; color: #fff; }',
      '@keyframes pp-step-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }',

      // Retry state
      '.pc-step-item.retrying { color: #f59e0b; }',
      '.pc-step-item.retrying .pc-step-num { background: #f59e0b; color: #222; position: relative; }',
      '.pc-step-item.retrying .pc-step-num::after { content: "\\27F3"; position: absolute; top: 0; left: 0; width: 18px; height: 18px; line-height: 18px; text-align: center; font-size: 12px; animation: pp-spin 1s linear infinite; }',
      '@keyframes pp-spin { to { transform: rotate(360deg); } }',
      '.pc-step-item.retrying-warn { color: #eab308; }',
      '.pc-step-item.retrying-warn .pc-step-num { background: #eab308; color: #222; }',

      // Replanning state
      '.pc-card.replanning { border-color: rgba(168,85,247,0.6) !important; box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(168,85,247,0.2) !important; }',
      '.pc-card.replanning .pc-card-title { color: #a855f7 !important; }',
      '.pc-card.replanning .pc-card-progress-bar { background: linear-gradient(90deg, #7c3aed, #a855f7) !important; }',

      // Failure summary card
      '#pc-failure-summary { position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); z-index: 2147483642; pointer-events: auto; background: rgba(10,14,28,0.95); border: 2px solid #ef4444; border-radius: 14px; padding: 16px 20px; min-width: 300px; max-width: 400px; color: #eee; font-family: -apple-system, "Segoe UI", "PingFang SC", sans-serif; box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(239,68,68,0.2); animation: pp-fade-in 0.3s ease-out; }',
      '#pc-failure-summary .pc-fs-title { font-weight: 700; font-size: 14px; color: #ef4444; margin-bottom: 8px; }',
      '#pc-failure-summary .pc-fs-step { font-size: 13px; color: #ddd; margin-bottom: 4px; }',
      '#pc-failure-summary .pc-fs-reason { font-size: 12px; color: #f59e0b; margin-bottom: 6px; }',
      '#pc-failure-summary .pc-fs-suggestion { font-size: 12px; color: #999; font-style: italic; }'
    ].join('\n');
    document.head.appendChild(s);
    this._animStyle = s;
  },
  
  // --- Screen border: flashing border when AI controls the page ---
  _createScreenBorder() {
    if (this._screenBorder) return;
    var border = document.createElement('div');
    border.id = 'pc-screen-border';
    border.setAttribute('data-pageclaw-ignore', 'true');
    document.body.appendChild(border);
    this._screenBorder = border;
  },
  
  _setScreenBorderState(state) {
    if (!this._screenBorder) this._createScreenBorder();
    this._screenBorder.className = '';
    if (state) this._screenBorder.classList.add(state);
  },
  
  _removeScreenBorder() {
    if (this._screenBorder) { this._screenBorder.remove(); this._screenBorder = null; }
  },
  
  // --- Create AI cursor ---
  _createCursor() {
    if (this._animCursor) return;
    var arrowUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='44' viewBox='0 0 36 44'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23e94560'/%3E%3Cstop offset='50%25' stop-color='%236366f1'/%3E%3Cstop offset='100%25' stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M2 2L2 34L10 26L18 40L23 37L15 23L28 23Z' fill='url(%23g)' stroke='white' stroke-width='2' stroke-linejoin='round'/%3E%3C/svg%3E";
    var trailUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='30' viewBox='0 0 36 44'%3E%3Cpath d='M2 2L2 34L10 26L18 40L23 37L15 23L28 23Z' fill='rgba(233,69,96,0.4)' stroke='none'/%3E%3C/svg%3E";
    var c = document.createElement('div');
    c.id = 'pc-cursor';
    c.setAttribute('data-pageclaw-ignore', 'true');
    c.innerHTML = '<img class="pc-cursor-arrow" src="' + arrowUrl + '" draggable="false" style="pointer-events:none">' +
      '<div class="pc-cursor-ring"></div>' +
      '<div class="pc-ai-badge">AI</div>';
    var trailColors = ['rgba(233,69,96,0.4)', 'rgba(99,102,241,0.35)', 'rgba(6,182,212,0.3)', 'rgba(168,85,247,0.25)', 'rgba(236,72,153,0.2)'];
    for (var t = 0; t < 5; t++) {
      var trail = document.createElement('img');
      trail.className = 'pc-cursor-trail';
      var sz = 24 - t * 3;
      trail.src = trailUrl;
      trail.draggable = false;
      trail.style.cssText = 'pointer-events:none;width:' + sz + 'px;height:' + (sz * 1.2) + 'px;opacity:' + (0.5 - t * 0.08) + ';filter:drop-shadow(0 0 4px ' + trailColors[t] + ')';
      c.appendChild(trail);
    }
    c.style.left = '-100px';
    c.style.top = '-100px';
    document.body.appendChild(c);
    this._animCursor = c;
    this._cursorTrails = c.querySelectorAll('.pc-cursor-trail');
  },
  
  // --- Move cursor to element center with trail ---
  async moveCursorTo(index) {
    this._createCursor();
    var target = this._indexedEls[index];
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(function(r) { setTimeout(r, 200); });
    var r = target.getBoundingClientRect();
    var tx = r.left + r.width / 2 - 18;
    var ty = r.top + r.height / 2 - 22;
    if (this._cursorTrails) {
      var curX = parseFloat(this._animCursor.style.left) || -100;
      var curY = parseFloat(this._animCursor.style.top) || -100;
      for (var t = 0; t < this._cursorTrails.length; t++) {
        (function(trail, t) {
          var progress = (t + 1) / 6;
          setTimeout(function() {
            trail.style.transition = 'left 0.25s ease-out, top 0.25s ease-out, opacity 0.4s';
            trail.style.left = ((tx - curX) * progress) + 'px';
            trail.style.top = ((ty - curY) * progress) + 'px';
            trail.style.opacity = String(0.4 - t * 0.06);
          }, (t + 1) * 60);
        })(this._cursorTrails[t], t);
      }
    }
    this._animCursor.style.left = tx + 'px';
    this._animCursor.style.top = ty + 'px';
  },
  
  // --- Click: cursor flies to element center, shows click animation ---
  async animClick(index) {
    await this.moveCursorTo(index);
    await new Promise(function(r) { setTimeout(r, 500); });
    if (!this._animCursor) return;
    this._animCursor.classList.add('clicking');
    var self = this;
    var ringColors = ['#e94560', '#6366f1', '#06b6d4'];
    for (var ri = 0; ri < 3; ri++) {
      (function(ri) {
        setTimeout(function() {
          if (!self._animCursor) return;
          var ring = document.createElement('div');
          ring.className = 'pc-ripple-ring';
          ring.style.borderColor = ringColors[ri];
          ring.style.animationDuration = (0.6 + ri * 0.2) + 's';
          if (ri === 1) ring.style.animationName = 'pp-ripple2';
          if (ri === 2) ring.style.animationName = 'pp-ripple3';
          self._animCursor.appendChild(ring);
        }, ri * 100);
      })(ri);
    }
    var sparkColors = ['#e94560', '#6366f1', '#06b6d4', '#a855f7', '#ec4899', '#f59e0b', '#10b981', '#ef4444'];
    for (var p = 0; p < 8; p++) {
      (function(p) {
        var angle = (p / 8) * Math.PI * 2;
        var dist = 30 + Math.random() * 25;
        var dx = Math.round(Math.cos(angle) * dist);
        var dy = Math.round(Math.sin(angle) * dist);
        var particle = document.createElement('div');
        particle.style.cssText = 'position:absolute;left:50%;top:50%;width:5px;height:5px;border-radius:50%;' +
          'background:' + sparkColors[p] + ';pointer-events:none;' +
          'box-shadow:0 0 6px ' + sparkColors[p] + ';' +
          'transition:all 0.5s cubic-bezier(0.22,1,0.36,1);opacity:1;';
        self._animCursor.appendChild(particle);
        requestAnimationFrame(function() {
          particle.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(0)';
          particle.style.opacity = '0';
        });
      })(p);
    }
    setTimeout(function() {
      if (self._animCursor) {
        self._animCursor.classList.remove('clicking');
        self._animCursor.querySelectorAll('.pc-ripple-ring').forEach(function(e) { e.remove(); });
        self._animCursor.querySelectorAll('div[style]').forEach(function(e) {
          if (!e.classList.contains('pc-ai-badge')) e.remove();
        });
      }
    }, 1000);
  },
  
  // --- Highlight elements with [0][1][2] labels ---
  highlightElements() {
    if (this._overlayHidden) return;
    this._clearHighlights();
    this._injectAnimCSS();
    if (!this._highlightContainer) {
      var c = document.createElement('div');
      c.id = 'pc-highlight-container';
      c.setAttribute('data-pageclaw-ignore', 'true');
      document.body.appendChild(c);
      this._highlightContainer = c;
    }
    var container = this._highlightContainer;
    var indexed = [];
    var all = document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [onclick], [tabindex], [contenteditable="true"], video, audio, summary, details');
    var self = this;
    var visible = Array.from(all).filter(function(el) {
      if (el.closest('#pc-status,#pc-cursor,#pc-highlight-container,#pc-screen-border')) return false;
      if (el.hasAttribute('data-pageclaw-ignore')) return false;
      var r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      if (r.bottom < 0 || r.top > window.innerHeight) return false;
      var s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    });
    visible.slice(0, 200).forEach(function(el, i) {
      var r = el.getBoundingClientRect();
      var color = self._HL_COLORS[i % self._HL_COLORS.length];
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;pointer-events:none;left:' + (r.left - 2) + 'px;top:' + (r.top - 2) + 'px;width:' + (r.width + 4) + 'px;height:' + (r.height + 4) + 'px;border:2px solid ' + color + ';border-radius:4px;background:' + color + '12;z-index:2147483639;animation:pp-label-pop 0.3s ease-out;box-sizing:border-box;';
      overlay.setAttribute('data-pageclaw-ignore', 'true');
      container.appendChild(overlay);
      self._highlightEls.push(overlay);
      var label = document.createElement('div');
      label.style.cssText = 'position:fixed;pointer-events:none;left:' + (r.left - 2) + 'px;top:' + (r.top - 18) + 'px;background:' + color + ';color:#fff;font-size:11px;font-weight:700;font-family:-apple-system,sans-serif;padding:1px 5px;border-radius:4px;min-width:18px;text-align:center;line-height:14px;z-index:2147483639;animation:pp-label-pop 0.3s ease-out;box-shadow:0 1px 4px rgba(0,0,0,0.3);';
      label.textContent = String(i);
      label.setAttribute('data-pageclaw-ignore', 'true');
      container.appendChild(label);
      self._highlightLabels.push(label);
      indexed.push(el);
    });
    this._indexedEls = indexed;
    console.log('[PageClaw] Highlighted ' + indexed.length + ' elements');
  },
  
  _clearHighlights() {
    if (this._highlightContainer) { this._highlightContainer.remove(); }
    this._highlightContainer = null;
    this._highlightEls = [];
    this._highlightLabels = [];
    this._indexedEls = [];
  },
  
  // --- Show overlay (status card + border + highlights + cursor) ---
  showOverlay() {
    // Remove fast overlay if present (showOverlayFast from engine.js)
    var q = document.getElementById('__pc_quick');
    if (q) q.remove();
    this._overlayHidden = false;
    this._injectAnimCSS();
    this._createScreenBorder();
    this._setScreenBorderState('active');
    this.highlightElements();
    this._createCursor();
    if (this._animOverlay) return;
    var widget = document.createElement('div');
    widget.id = 'pc-status';
    widget.setAttribute('data-pageclaw-ignore', 'true');
    widget.innerHTML = '<div class="pc-card executing" id="pc-card"><div class="pc-card-title" id="pc-title">PageClaw</div><div class="pc-card-step" id="pc-step">Starting...</div><div class="pc-card-progress"><div class="pc-card-progress-bar" id="pc-bar" style="width:0%"></div></div><div class="pc-card-counter" id="pc-counter"></div><div class="pc-steps-list" id="pc-steps-list"></div></div>';
    document.body.appendChild(widget);
this._animOverlay = widget;
    this._stepsList = widget.querySelector('#pc-steps-list');
  },

  initSteps(descriptions) {
    if (!this._animOverlay) this.showOverlay();
    var list = this._animOverlay.querySelector('#pc-steps-list');
    if (!list) return;
    list.innerHTML = '';
    for (var i = 0; i < descriptions.length; i++) {
      var item = document.createElement('div');
      item.className = 'pc-step-item pending';
      item.id = 'pc-step-' + i;
      var numSpan = document.createElement('span');
      numSpan.className = 'pc-step-num';
      numSpan.textContent = (i + 1);
      var textSpan = document.createElement('span');
      textSpan.className = 'pc-step-text';
      textSpan.textContent = descriptions[i] || '';
      item.appendChild(numSpan);
      item.appendChild(textSpan);
      list.appendChild(item);
    }
  },

  updateStatus(text, current, total) {
    if (!this._animOverlay) this.showOverlay();
    var title = document.getElementById('pc-title');
    var step = document.getElementById('pc-step');
    var bar = document.getElementById('pc-bar');
    var counter = document.getElementById('pc-counter');
    var card = document.getElementById('pc-card');
    if (title) title.textContent = 'PageClaw';
    if (step) step.textContent = text;
    if (counter && total > 0) counter.textContent = current + ' / ' + total;
    if (bar && total > 0) {
      var pct = (current / total) * 100;
      bar.style.width = pct + '%';
      if (pct < 30) {
        bar.style.background = 'linear-gradient(90deg, #dc2626, #ef4444)';
      } else if (pct < 70) {
        bar.style.background = 'linear-gradient(90deg, #eab308, #facc15)';
      } else {
        bar.style.background = 'linear-gradient(90deg, #22c55e, #4ade80)';
      }
    }
    var list = this._animOverlay.querySelector('#pc-steps-list');
    if (list) {
      var items = list.querySelectorAll('.pc-step-item');
      for (var i = 0; i < items.length; i++) {
        if (i < current - 1) {
          items[i].className = 'pc-step-item completed';
        } else if (i === current - 1) {
          items[i].className = 'pc-step-item active';
        } else {
          items[i].className = 'pc-step-item pending';
        }
      }
    }
if (card && current > 0) {
      card.className = 'pc-card executing';
    }
  },

  markStepFailed(index) {
    var item = document.getElementById('pc-step-' + index);
    if (item) {
      item.className = 'pc-step-item failed';
    }
  },

  showRetryStatus(stepIndex, attempt, maxAttempts, failureType) {
    if (!this._animOverlay) this.showOverlay();
    var item = document.getElementById('pc-step-' + stepIndex);
    if (item) {
      if (attempt >= maxAttempts) {
        item.className = 'pc-step-item retrying-warn';
      } else {
        item.className = 'pc-step-item retrying';
      }
      var textEl = item.querySelector('.pc-step-text');
      if (textEl) {
        var original = textEl.getAttribute('data-original') || textEl.textContent;
        textEl.setAttribute('data-original', original);
        textEl.textContent = original + ' \u{1F504} (' + attempt + '/' + maxAttempts + ')';
      }
    }
    // Update card step text
    var step = document.getElementById('pc-step');
    if (step) {
      var typeLabels = {
        'element-not-found': '\u5143\u7D20\u672A\u627E\u5230',
        'not-interactable': '\u5143\u7D20\u4E0D\u53EF\u4EA4\u4E92',
        'timeout': '\u64CD\u4F5C\u8D85\u65F6',
        'navigation': '\u9875\u9762\u8DF3\u8F6C\u5F02\u5E38',
        'unknown': '\u672A\u77E5\u95EE\u9898'
      };
      var label = typeLabels[failureType] || '\u91CD\u8BD5\u4E2D';
      step.textContent = '\u9047\u5230\u95EE\u9898\uFF1A' + label + ' \uFF0C\u6B63\u5728\u91CD\u8BD5(' + (attempt + 1) + '/' + maxAttempts + ')';
    }
    // Update progress bar color to yellow for warning
    var bar = document.getElementById('pc-bar');
    if (bar) {
      bar.style.background = 'linear-gradient(90deg, #eab308, #facc15)';
    }
    var card = document.getElementById('pc-card');
    if (card) {
      card.className = 'pc-card executing';
    }
  },

  showFailureSummary(summary) {
    if (!this._animOverlay) this.showOverlay();
    this._removeFailureSummary();
    // Red flash
    this._setScreenBorderState('error');
    var card = document.createElement('div');
    card.id = 'pc-failure-summary';
    card.setAttribute('data-pageclaw-ignore', 'true');
    var typeLabels = {
      'element-not-found': '\u5143\u7D20\u672A\u627E\u5230',
      'not-interactable': '\u5143\u7D20\u4E0D\u53EF\u4EA4\u4E92',
      'timeout': '\u64CD\u4F5C\u8D85\u65F6',
      'navigation': '\u9875\u9762\u8DF3\u8F6C\u5F02\u5E38',
      'unknown': '\u672A\u77E5\u95EE\u9898'
    };
    var typeLabel = typeLabels[summary.failureType] || summary.failureType;
    card.innerHTML =
      '<div class="pc-fs-title">\u26A0\uFE0F \u65E0\u6CD5\u5B8C\u6210\u6B64\u6B65\u9AA4</div>' +
      '<div class="pc-fs-step">' + (summary.stepName || '') + '</div>' +
      '<div class="pc-fs-reason">\u539F\u56E0\uFF1A' + typeLabel + ' \u2014 ' + (summary.reason || '') + '</div>' +
      '<div class="pc-fs-close" style="text-align:right;margin-top:10px;"><span style="cursor:pointer;color:#888;font-size:12px;border:1px solid #555;padding:3px 12px;border-radius:6px;">\u5173\u95ED</span></div>';
    document.body.appendChild(card);
    this._failureSummary = card;
    // Close button + auto-hide after 10s
    var self = this;
    var closed = false;
    var doClose = function() { if (!closed) { closed = true; self._removeFailureSummary(); } };
    card.querySelector('.pc-fs-close').addEventListener('click', doClose);
    setTimeout(doClose, 20000);
  },

  _removeFailureSummary() {
    if (this._failureSummary) {
      this._failureSummary.remove();
      this._failureSummary = null;
    }
  },

  showReplanning() {
    if (!this._animOverlay) this.showOverlay();
    var title = document.getElementById('pc-title');
    var step = document.getElementById('pc-step');
    var card = document.getElementById('pc-card');
    var bar = document.getElementById('pc-bar');
    if (title) title.textContent = '\u267B\uFE0F \u91CD\u65B0\u89C4\u5212\u4E2D...';
    if (step) step.textContent = '\u6B63\u5728\u5206\u6790\u5F53\u524D\u9875\u9762\u72B6\u6001\uFF0C\u8C03\u6574\u6267\u884C\u8BA1\u5212';
    if (card) card.className = 'pc-card replanning';
    if (bar) bar.style.background = 'linear-gradient(90deg, #7c3aed, #a855f7)';
    this._setScreenBorderState('thinking');
  },

  setGlowState(state) {
    if (!this._animOverlay) this.showOverlay();
    var card = document.getElementById('pc-card');
    if (!card) return;
    card.className = 'pc-card' + (state ? ' ' + state : '');
    this._setScreenBorderState(state);
  },
  
  hideOverlay() {
    this._overlayHidden = true;
    if (this._animOverlay) {
      this._animOverlay.classList.add('hiding');
      var el = this._animOverlay;
      this._animOverlay = null;
      this._stepsList = null;
      setTimeout(function() { if (el) el.remove(); }, 300);
    }
    this._clearHighlights();
    this._removeScreenBorder();
    this._removeFailureSummary();
    if (this._animCursor) { this._animCursor.remove(); this._animCursor = null; }
  }
  };
