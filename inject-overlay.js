/**
 * inject-overlay.js — Conditional overlay injection (document_start)
 *
 * Shows purple border glow ONLY when a PageClaw task is running.
 * Creates overlay div immediately (synchronous), checks storage async.
 * SPA navigation handled by background webNavigation listeners.
 */
(function () {
  'use strict';

  // Guard: chrome API may not exist on restricted pages
  if (typeof chrome === 'undefined' || !chrome.storage) return;

  // Inject overlay div immediately — hidden by default
  if (!document.getElementById('__pc_quick')) {
    var el = document.createElement('div');
    el.id = '__pc_quick';
    el.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;pointer-events:none;' +
      'border:3px solid #7c4dff;box-shadow:inset 0 0 30px rgba(124,77,255,0.3);' +
      'border-radius:4px;transition:border-color .5s,box-shadow .5s,opacity .5s;' +
      'display:none;';
    document.documentElement.appendChild(el);
  }

  function showOverlay() {
    var el = document.getElementById('__pc_quick');
    if (!el) return;
    el.style.display = 'block';
    el.style.opacity = '1';
  }

  // Check task state — async but fast (<1ms from session storage)
  chrome.storage.session.get('taskRunning', function (data) {
    if (data && data.taskRunning) showOverlay();
  });
})();
