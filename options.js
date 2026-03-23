// options.js — Settings page logic

const apiKeyEl = document.getElementById('apiKey');
const modelEl = document.getElementById('model');
const baseUrlEl = document.getElementById('baseUrl');
const saveBtn = document.getElementById('save');
const testBtn = document.getElementById('test');
const statusEl = document.getElementById('status');
const presetBtns = document.querySelectorAll('.preset-btn');

const DEFAULTS = {
  model: 'google/gemini-2.0-flash',
  baseUrl: 'https://openrouter.ai/api/v1'
};

// Load saved settings
chrome.storage.local.get(['apiKey', 'model', 'baseUrl']).then(data => {
  apiKeyEl.value = data.apiKey || '';
  modelEl.value = data.model || DEFAULTS.model;
  baseUrlEl.value = data.baseUrl || DEFAULTS.baseUrl;

  // Highlight matching preset
  updatePresetHighlight();
});

// Preset buttons
presetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modelEl.value = btn.dataset.model;
    baseUrlEl.value = btn.dataset.base;
    presetBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// Update preset highlight based on current values
function updatePresetHighlight() {
  presetBtns.forEach(btn => {
    if (modelEl.value === btn.dataset.model && baseUrlEl.value === btn.dataset.base) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Watch for manual changes
[modelEl, baseUrlEl].forEach(el => {
  el.addEventListener('input', updatePresetHighlight);
});

// Save
saveBtn.addEventListener('click', async () => {
  const apiKey = apiKeyEl.value.trim();
  const model = modelEl.value.trim();
  const baseUrl = baseUrlEl.value.trim() || DEFAULTS.baseUrl;

  if (!apiKey) {
    showStatus('Please enter your API Key', false);
    return;
  }

  await chrome.storage.local.set({ apiKey, model, baseUrl });
  showStatus('✅ Settings saved!', true);
});

// Test connection
testBtn.addEventListener('click', async () => {
  const apiKey = apiKeyEl.value.trim();
  const baseUrl = baseUrlEl.value.trim() || DEFAULTS.baseUrl;

  if (!apiKey) {
    showStatus('Please enter your API Key first', false);
    return;
  }

  showStatus('⏳ Testing connection...', true);

  chrome.runtime.sendMessage({
    type: 'TEST_CONNECTION',
    config: { apiKey, baseUrl }
  }, (response) => {
    if (response?.ok) {
      showStatus('✅ Connection successful!', true);
    } else {
      showStatus(`❌ Connection failed: ${response?.error || 'HTTP ' + response?.status}`, false);
    }
  });
});

function showStatus(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = 'status show ' + (ok ? 'ok' : 'err');
}
