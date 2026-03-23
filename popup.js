// popup.js
const setupPrompt = document.getElementById('setupPrompt');
const runningIndicator = document.getElementById('runningIndicator');
const usageHint = document.getElementById('usageHint');
const statusEl = document.getElementById('statusEl');
const historySection = document.getElementById('historySection');
const historyList = document.getElementById('historyList');

chrome.storage.local.get(['apiKey']).then(data => {
  if (!data.apiKey) { setupPrompt.style.display = 'block'; usageHint.style.display = 'none'; }
});

chrome.runtime.sendMessage({ type: 'GET_STATUS' }, r => {
  if (r?.running) { runningIndicator.style.display = 'block'; usageHint.style.display = 'none'; }
});

chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, r => {
  if (r?.history?.length > 0) {
    historySection.style.display = 'block';
    historyList.innerHTML = '';
    r.history.slice(0, 5).forEach(cmd => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.textContent = cmd;
      item.addEventListener('click', () => { navigator.clipboard.writeText('@ai ' + cmd); showStatus('Copied! Paste in address bar', true); });
      historyList.appendChild(item);
    });
  }
});

document.getElementById('openSetup')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('openOptions').addEventListener('click', e => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
document.getElementById('stopTask')?.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'STOP_TASK' }, () => { runningIndicator.style.display = 'none'; showStatus('Cancelled', true); });
});
document.getElementById('clearHistory').addEventListener('click', e => {
  e.preventDefault();
  chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' }, () => { historySection.style.display = 'none'; showStatus('Cleared', true); });
});

document.querySelectorAll('.hint-item[data-cmd]').forEach(el => {
  el.addEventListener('click', () => {
    navigator.clipboard.writeText('@ai ' + el.dataset.cmd);
    showStatus('Copied! Paste in address bar and press Enter', true);
  });
});

function showStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = 'status show ' + (ok ? 'ok' : 'warn');
  setTimeout(() => { statusEl.className = 'status'; }, 3000);
}
