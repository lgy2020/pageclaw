// page/element-ops.js — Element operations: click, type, scroll, fillForm
// Expects: getVisibleElements (from page/constants.js)
// Provides: object with element operation methods

var elementOps = {
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
  
  // ==================== 11. Element Operations ====================
  click(index) {
    const el = pageInfo._getElement(index);
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
    const el = pageInfo._getElement(index);
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
    const el = index >= 0 ? pageInfo._getElement(index) : document.activeElement;
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
  
};
