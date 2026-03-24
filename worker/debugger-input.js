import { sleep } from '../utils/sleep.js';

export async function typeViaDebugger(tabId, text) {
  try {
    await chrome.debugger.attach({ tabId }, '1.3');

    // Ctrl+A
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2
    });
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2
    });

    // Backspace
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8
    });
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8
    });

    await sleep(100);

    // Insert text
    await chrome.debugger.sendCommand({ tabId }, 'Input.insertText', { text });
    await chrome.debugger.detach({ tabId });
    return { success: true, method: 'debugger_insertText' };
  } catch (e) {
    try { await chrome.debugger.detach({ tabId }); } catch (_) {}
    return { success: false, error: e.message };
  }
}
