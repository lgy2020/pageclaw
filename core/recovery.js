// core/recovery.js — Recovery strategies module
// Provides: RecoveryError, classifyError, generateFallbackSelectors, getRecoveryStrategy, getSuggestion

export class RecoveryError extends Error {
	constructor(failureType, message) {
		super(message);
		this.name = 'RecoveryError';
		this.failureType = failureType;
	}
}

export function classifyError(err) {
	if (err instanceof RecoveryError) return err.failureType;
	var msg = (err?.message || String(err)).toLowerCase();
	if (/stale.?element|stale element/.test(msg)) return 'stale-element';
	if (/no.?such.?element|no such element/.test(msg)) return 'element-not-found';
	if (/cannot find element|element not found|no element/.test(msg)) return 'element-not-found';
	if (/element.?click.?intercepted|click intercepted/.test(msg)) return 'click-intercepted';
	if (/element.?not.?interactable|not interactable|disabled|obscured|covered|not visible/.test(msg)) return 'not-interactable';
	if (/timeout|timed out|deadline/.test(msg)) return 'timeout';
	if (/navigation|navigate|redirect|page changed/.test(msg)) return 'navigation';
	return 'unknown';
}

export function generateFallbackSelectors(element) {
	if (!element) return [];
	var selectors = [];
	var tag = element.tag || '';
	var attrs = element.attrs || {};

	// ID-based
	if (attrs.id) {
		selectors.push('#' + CSS.escape(attrs.id));
	}

	// ARIA label-based
	if (attrs.ariaLabel) {
		selectors.push(tag + '[aria-label="' + attrs.ariaLabel + '"]');
	}

	// Text content-based (XPath-like fallback via querySelector won't work, store as descriptor)
	if (element.text) {
		selectors.push('__text__:' + element.text.substring(0, 80));
	}

	// Role-based
	if (attrs.role) {
		selectors.push(tag + '[role="' + attrs.role + '"]');
	}

	// Type + name combo
	if (attrs.type && attrs.name) {
		selectors.push(tag + '[type="' + attrs.type + '"][name="' + attrs.name + '"]');
	}

	// Name-only
	if (attrs.name) {
		selectors.push(tag + '[name="' + attrs.name + '"]');
	}

	// Placeholder-based
	if (attrs.placeholder) {
		selectors.push(tag + '[placeholder="' + attrs.placeholder + '"]');
	}

	// Class-based (first 2 classes if available)
	if (attrs.class) {
		var classes = attrs.class.split(/\s+/).filter(function(c) { return c.length > 0; });
		if (classes.length > 0) {
			var classSelector = tag + '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
			selectors.push(classSelector);
		}
	}

	// Tag + href partial match for links
	if (tag === 'a' && attrs.href) {
		var hrefPart = attrs.href.split('?')[0].split('#')[0];
		selectors.push('a[href*="' + hrefPart.substring(0, 50) + '"]');
	}

	// At least 2 selectors guaranteed (fallback: tag + index)
	if (selectors.length < 2) {
		selectors.push(tag);
	}

	return selectors.slice(0, 5);
}

export function getRecoveryStrategy(failureType) {
	switch (failureType) {
		case 'element-not-found':
			return {
				name: 'refind',
				description: '重新查找元素',
				actions: ['re-snapshot', 'fallback-selectors', 'scroll-to-find']
			};
		case 'stale-element':
			return {
				name: 'refind',
				description: '重新查找过期元素',
				actions: ['re-snapshot', 're-inject', 'scroll-to-find']
			};
		case 'not-interactable':
			return {
				name: 'force-interact',
				description: '尝试强制交互',
				actions: ['dismiss-popups', 'scroll-into-view', 'wait-and-retry']
			};
		case 'click-intercepted':
			return {
				name: 'clear-interception',
				description: '清除遮挡后重试',
				actions: ['dismiss-popups', 'scroll-into-view', 'wait-and-retry']
			};
		case 'timeout':
			return {
				name: 'wait-retry',
				description: '等待后重试',
				actions: ['wait-longer', 'check-navigation', 're-inject']
			};
		case 'navigation':
			return {
				name: 'recover-nav',
				description: '恢复页面状态',
				actions: ['wait-stable', 're-inject', 're-snapshot']
			};
		default:
			return {
				name: 'generic-retry',
				description: '通用重试',
				actions: ['wait-and-retry']
			};
	}
}

export function getSuggestion(failureType) {
	switch (failureType) {
		case 'element-not-found':
			return '目标元素可能已消失或页面结构发生了变化';
		case 'stale-element':
			return '元素已过期，页面可能已更新';
		case 'not-interactable':
			return '元素可能被弹窗遮挡或处于禁用状态';
		case 'click-intercepted':
			return '点击被其他元素拦截，可能存在遮挡层';
		case 'timeout':
			return '页面响应较慢，请检查网络连接';
		case 'navigation':
			return '页面发生了意外跳转';
		default:
			return '操作遇到了未知问题';
	}
}
