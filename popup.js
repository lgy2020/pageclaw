// popup.js
var state = {
  apiKey: null,
  isRunning: false,
  history: [],
  inputValue: '',
  copiedId: null,
  errorMessage: null
};

var templates = [
  { id: 't1', icon: '📝', title: '总结页面', desc: '提取页面核心内容', command: '总结当前页面内容' },
  { id: 't2', icon: '📊', title: '提取数据', desc: '提取表格/列表数据', command: '提取页面中的数据表格' },
  { id: 't3', icon: '🖊️', title: '填写表单', desc: '智能填写页面表单', command: '帮我填写当前表单' },
  { id: 't4', icon: '🔍', title: '搜索比较', desc: '搜索并对比信息', command: '搜索并比较相关信息' }
];

var templateGrid = document.getElementById('templateGrid');
var historyList = document.getElementById('historyList');
var emptyState = document.getElementById('emptyState');
var quickInput = document.getElementById('quickInput');
var runningIndicator = document.getElementById('runningIndicator');
var statusEl = document.getElementById('statusEl');
var toast = document.getElementById('toast');

function renderTemplates() {
  templateGrid.innerHTML = '';
  templates.forEach(function(t) {
    var card = document.createElement('div');
    card.className = 'template-card';
    card.innerHTML = '<div class="template-icon">' + t.icon + '</div>' +
      '<div class="template-title">' + t.title + '</div>' +
      '<div class="template-desc">' + t.desc + '</div>' +
      '<button class="start-btn">启动</button>';
    card.addEventListener('click', function(e) {
      if (e.target.classList.contains('start-btn')) {
        startTask(t.command);
      } else {
        copyToClipboard(t.command, t.id);
      }
    });
    templateGrid.appendChild(card);
  });
}

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
    var timeStr = getRelativeTime(item.timestamp);
    el.innerHTML = '<span class="history-content">' + item.command + '</span>' +
      '<span class="history-time">' + timeStr + '</span>' +
      '<button class="history-btn">启动</button>';
    el.addEventListener('click', function(e) {
      if (e.target.classList.contains('history-btn')) {
        startTask(item.command);
      } else {
        copyToClipboard(item.command, item.id);
      }
    });
    historyList.appendChild(el);
  });
}

function getRelativeTime(timestamp) {
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

function copyToClipboard(text, id) {
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

function init() {
  renderTemplates();

  chrome.storage.local.get(['apiKey']).then(function(data) {
    state.apiKey = data.apiKey;
    if (!data.apiKey) {
      showStatus('API key missing', false);
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