/**
 * Conversation History — per-tab turn tracking for LLM context
 *
 * Each tab gets an independent history array. History persists across
 * page navigations within a tab, and is cleared when the tab closes.
 */

const MAX_TURNS = 20;       // hard cap per tab
const LLM_MAX_TOKENS = 800; // approximate token budget for history injection

export class ConversationHistory {
  constructor() {
    /** @type {Map<number, ConversationTurn[]>} */
    this.turns = new Map();
  }

  /**
   * Store a completed turn
   * @param {number} tabId
   * @param {string} userInstruction
   * @param {Array} plan - the executed step plan
   * @param {Array} executionResults - [{stepIndex, status, duration, error?}]
   * @param {{url: string, title: string, textSummary?: string}} pageContext
   */
  addTurn(tabId, userInstruction, plan, executionResults, pageContext) {
    if (!this.turns.has(tabId)) this.turns.set(tabId, []);
    const arr = this.turns.get(tabId);

    arr.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      userInstruction,
      plan: (plan || []).map(s => ({ type: s.type, description: s.description, target: s.target, value: s.value, url: s.url })),
      executionResults: executionResults || [],
      pageContext: {
        url: pageContext?.url || '',
        title: pageContext?.title || '',
        textSummary: (pageContext?.textSummary || '').slice(0, 300),
      },
    });

    // Trim oldest if over cap
    if (arr.length > MAX_TURNS) arr.splice(0, arr.length - MAX_TURNS);
  }

  /**
   * Get recent turns for LLM context
   * @param {number} tabId
   * @param {number} maxTurns
   * @returns {ConversationTurn[]}
   */
  getRecentTurns(tabId, maxTurns = 5) {
    const arr = this.turns.get(tabId) || [];
    return arr.slice(-maxTurns);
  }

  /**
   * Format history as compact text for LLM prompt injection
   * Stays under LLM_MAX_TOKENS (~4 chars per token)
   */
  formatForLLM(tabId, maxTurns = 5) {
    const turns = this.getRecentTurns(tabId, maxTurns);
    if (!turns.length) return '';

    const parts = ['Previous actions on this tab (most recent last):'];
    for (const t of turns) {
      const steps = t.plan.map(s => `${s.type}${s.target ? `(${s.target})` : ''}${s.url ? `→${s.url}` : ''}`).join(' → ');
      const result = t.executionResults?.length
        ? t.executionResults.map(r => r.status).join(', ')
        : 'completed';
      const page = t.pageContext?.url ? ` [page: ${t.pageContext.url}]` : '';
      parts.push(`- User: "${t.userInstruction}" | Steps: ${steps} | Result: ${result}${page}`);
    }

    let text = parts.join('\n');
    // Truncate from start if too long
    const maxChars = LLM_MAX_TOKENS * 4;
    if (text.length > maxChars) {
      text = '...(earlier history truncated)\n' + text.slice(-(maxChars - 40));
    }
    return text;
  }

  /** Get full history for a tab (for GET_HISTORY message) */
  getAll(tabId) {
    return this.turns.get(tabId) || [];
  }

  /** Clear a tab's history */
  clearHistory(tabId) {
    this.turns.delete(tabId);
  }

  /** Export as JSON string */
  exportJSON(tabId) {
    return JSON.stringify(this.turns.get(tabId) || [], null, 2);
  }

  /** Clean up when tab is closed */
  removeTab(tabId) {
    this.turns.delete(tabId);
  }
}
