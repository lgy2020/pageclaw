// popup.js
var MAX_TEMPLATES = 4;
var state = {
  apiKey: null,
  isRunning: false,
  history: [],
  templates: [],
  inputValue: '',
  copiedId: null,
  errorMessage: null
};

var templateGrid = document.getElementById('templateGrid');
var historyList = document.getElementById('historyList');
var emptyState = document.getElementById('emptyState');
var quickInput = document.getElementById('quickInput');
var runningIndicator = document.getElementById('runningIndicator');
var statusEl = document.getElementById('statusEl');
var toast = document.getElementById('toast');

// --- Template auto-title generation ---
function generateTitle(command) {
  var c = command.trim();
  // Strip leading emoji
  c = c.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]+/u, '').trim();
  // Take first meaningful phrase (up to 8 chars)
  if (c.length <= 8) return c;
  // Try to cut at natural break points
  var breaks = ['，', ',', '。', '、', '并', '然后', '和', '的'];
  var minIdx = c.length;
  for (var i = 0; i < breaks.length; i++) {
    var idx = c.indexOf(breaks[i], 2);
    if (idx > 0 && idx < minIdx) minIdx = idx;
  }
  var title = c.substring(0, Math.min(minIdx, 8));
  return title || c.substring(0, 6);
}

// --- Render templates ---
function renderTemplates() {
  templateGrid.innerHTML = '';
  for (var i = 0; i < MAX_TEMPLATES; i++) {
    if (i < state.templates.length) {
      var t = state.templates[i];
      var card = document.createElement('div');
      card.className = 'template-card';
      card.innerHTML = '<button class="template-delete" title="删除">✕</button>' +
        '<div class="template-icon">' + escapeHtml(t.icon || '📋') + '</div>' +
        '<div class="template-title">' + escapeHtml(t.title) + '</div>' +
        '<div class="template-desc">' + escapeHtml(truncate(t.desc || t.command, 16)) + '</div>' +
        '<button class="start-btn">启动</button>';
      (function(cmd) {
        card.querySelector('.start-btn').addEventListener('click', function(e) {
          e.stopPropagation();
          startTask(cmd);
        });
        card.querySelector('.template-delete').addEventListener('click', function(e) {
          e.stopPropagation();
          deleteTemplate(cmd);
        });
        card.addEventListener('click', function(e) {
          if (e.target.classList.contains('start-btn') || e.target.classList.contains('template-delete')) return;
          copyToClipboard(cmd);
        });
      })(t.command);
      templateGrid.appendChild(card);
    } else {
      var addCard = document.createElement('div');
      addCard.className = 'template-card add-card';
      addCard.innerHTML = '<span class="add-icon">+</span>';
      addCard.addEventListener('click', function() { showAddOverlay(); });
      templateGrid.appendChild(addCard);
    }
  }
}

// --- Add template overlay ---
function showAddOverlay() {
  var overlay = document.createElement('div');
  overlay.className = 'add-overlay';
  overlay.innerHTML = '<div class="add-overlay-box">' +
    '<div class="add-overlay-title">添加常用指令</div>' +
    '<textarea class="add-overlay-input" id="overlayInput" placeholder="输入指令模板..." autofocus></textarea>' +
    '<div class="add-overlay-btns">' +
    '<button class="btn-cancel">取消</button>' +
    '<button class="btn-save">保存</button>' +
    '</div></div>';

  overlay.querySelector('.btn-cancel').addEventListener('click', function() {
    document.body.removeChild(overlay);
  });
  overlay.querySelector('.btn-save').addEventListener('click', function() {
    var val = overlay.querySelector('#overlayInput').value.trim();
    if (val) {
      addTemplate(val);
    }
    document.body.removeChild(overlay);
  });
  overlay.querySelector('#overlayInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      overlay.querySelector('.btn-save').click();
    }
  });
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) document.body.removeChild(overlay);
  });
  document.body.appendChild(overlay);
  setTimeout(function() { overlay.querySelector('#overlayInput').focus(); }, 50);
}

function addTemplate(command) {
  if (state.templates.length >= MAX_TEMPLATES) return;
  // Save with placeholder, then generate title via LLM
  var placeholder = { command: command, icon: '⏳', title: '生成中...', desc: '', id: Date.now().toString(36) };
  state.templates.push(placeholder);
  chrome.storage.local.set({ customTemplates: state.templates });
  renderTemplates();

  chrome.runtime.sendMessage({ type: 'GENERATE_TEMPLATE_TITLE', command: command }, function(r) {
    if (chrome.runtime.lastError || !r) {
      // Fallback: use simple title
      placeholder.icon = '📋';
      placeholder.title = generateTitle(command);
      placeholder.desc = command.substring(0, 12);
    } else {
      placeholder.icon = r.icon;
      placeholder.title = r.title;
      placeholder.desc = r.desc;
    }
    chrome.storage.local.set({ customTemplates: state.templates });
    renderTemplates();
  });
}

function deleteTemplate(command) {
  state.templates = state.templates.filter(function(t) { return t.command !== command; });
  chrome.storage.local.set({ customTemplates: state.templates });
  renderTemplates();
  showToast('已删除');
}

// --- History ---
function renderHistory() {
  historyList.innerHTML = '';
  if (state.history.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';
  var recent = state.history.slice(0, 5);
  recent.forEach(function(item) {
    var el = document.createElement('div');
    el.className = 'history-item';
    var cmd = typeof item === 'string' ? item : item.command;
    var timeStr = typeof item === 'string' ? '' : getRelativeTime(item.timestamp);
    el.innerHTML = '<span class="history-content">' + escapeHtml(cmd) + '</span>' +
      (timeStr ? '<span class="history-time">' + timeStr + '</span>' : '') +
      '<button class="history-btn">启动</button>';
    (function(c) {
      el.querySelector('.history-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        startTask(c);
      });
      el.addEventListener('click', function(e) {
        if (e.target.classList.contains('history-btn')) return;
        copyToClipboard(c);
      });
    })(cmd);
    historyList.appendChild(el);
  });
}

function getRelativeTime(timestamp) {
  if (!timestamp) return '';
  var now = Date.now();
  var diff = now - timestamp;
  var min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + '分钟前';
  var hour = Math.floor(min / 60);
  if (hour < 24) return hour + '小时前';
  var day = Math.floor(hour / 24);
  return day + '天前';
}

// --- Actions ---
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(function() {
    showToast('已复制');
  }).catch(function() {
    showToast('复制失败');
  });
}

function startTask(command) {
  chrome.runtime.sendMessage({ type: 'POST_START_TASK', command: command }, function(r) {
    if (chrome.runtime.lastError) {
      showStatus('启动失败: ' + chrome.runtime.lastError.message, false);
      return;
    }
    window.close();
  });
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() {
    toast.classList.remove('show');
  }, 1500);
}

function showStatus(msg, isOk) {
  statusEl.textContent = msg;
  statusEl.className = 'status show ' + (isOk ? 'ok' : 'warn');
  setTimeout(function() {
    statusEl.className = 'status';
  }, 3000);
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, len) {
  return str.length > len ? str.substring(0, len) + '...' : str;
}

// --- Init ---
function init() {
  chrome.storage.local.get(['apiKey', 'customTemplates']).then(function(data) {
    state.apiKey = data.apiKey;
    state.templates = data.customTemplates || [];
    renderTemplates();

    if (!data.apiKey) {
      showStatus('请先配置 API Key', false);
    }
  });

  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, function(r) {
    if (chrome.runtime.lastError) return;
    if (r) {
      state.isRunning = r.isRunning || false;
      if (state.isRunning) {
        runningIndicator.classList.add('show');
      }
    }
  });

  chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, function(r) {
    if (chrome.runtime.lastError) return;
    if (r && r.history) {
      state.history = r.history;
      renderHistory();
    }
  });

  quickInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      var val = quickInput.value.trim();
      if (val) {
        startTask(val);
      }
    }
  });

  document.getElementById('quickRunBtn').addEventListener('click', function() {
    var val = quickInput.value.trim();
    if (val) {
      startTask(val);
    }
  });

  document.getElementById('openSettings').addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('clearHistory').addEventListener('click', function(e) {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, function() {
      state.history = [];
      renderHistory();
      showToast('已清除');
    });
  });
}

init();
