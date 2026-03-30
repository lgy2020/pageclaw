export var ExperienceEvaluator = {
  buildEvaluationPrompt: function(input) {
    var stepsText = '';
    if (input.steps && input.steps.length > 0) {
      stepsText = input.steps.map(function(step, idx) {
        var resultSummary = '';
        if (step.result) {
          if (step.result.success) {
            if (step.result.data && step.result.data.url) {
              resultSummary = ' -> Navigated to ' + step.result.data.url;
            } else if (step.result.data && step.result.data.text) {
              resultSummary = ' -> Got text (' + step.result.data.text.substring(0, 50) + '...)';
            } else if (step.result.data && step.result.data.elements) {
              resultSummary = ' -> Found ' + step.result.data.elements.length + ' elements';
            } else if (step.result.data && step.result.data.observed) {
              resultSummary = ' -> Observed data';
            } else {
              resultSummary = ' -> Success';
            }
          } else if (step.result.error) {
            resultSummary = ' -> Failed: ' + step.result.error;
          }
        }
        return (idx + 1) + '. [' + step.type + '] ' + step.description + resultSummary;
      }).join('\n');
    }

    var pageContent = '';
    if (input.finalPageState && input.finalPageState.contentSummary) {
      pageContent = '\n\nFinal page content (first 1000 chars):\n' + input.finalPageState.contentSummary.substring(0, 1000);
    }

    var executionTimeSec = input.executionTimeMs ? (input.executionTimeMs / 1000).toFixed(1) + 's' : 'unknown';

    var userPrompt = 'You are a task execution quality evaluator. Analyze the browser automation task execution and provide objective assessment. Output ONLY valid JSON.\n\n' +
      'Original instruction: "' + input.instruction + '"\n\n' +
      'Steps executed (' + (input.steps ? input.steps.length : 0) + ' steps, ' + executionTimeSec + '):\n' + stepsText + '\n\n' +
      'Final page state:\n- URL: ' + (input.finalPageState && input.finalPageState.url ? input.finalPageState.url : 'unknown') + '\n' +
      '- Title: ' + (input.finalPageState && input.finalPageState.title ? input.finalPageState.title : 'unknown') + '' + pageContent + '\n\n' +
      'Evaluate the execution quality and output JSON with these fields:\n' +
      '- overall_success: boolean (true if task mostly succeeded)\n' +
      '- success_rate: number 0-100 (estimated success percentage)\n' +
      '- key_decisions: array of {step: number, decision: string, score: 1-10} (important decisions made during execution)\n' +
      '- failure_reason: string|null (if task failed, explain why)\n' +
      '- lessons_learned: string|null (what could be improved)\n\n' +
      'Output ONLY valid JSON, no markdown fences.';

    return userPrompt;
  },

  parseEvaluationResult: function(llmResponse) {
    if (!llmResponse || typeof llmResponse !== 'string') {
      return null;
    }

    var jsonStr = llmResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    var startIdx = jsonStr.indexOf('{');
    var endIdx = jsonStr.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
      return null;
    }

    jsonStr = jsonStr.substring(startIdx, endIdx + 1);

    try {
      var parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.log('[ExperienceEvaluator] JSON parse failed:', e.message);
      return null;
    }

    if (typeof parsed.overall_success !== 'boolean' ||
        typeof parsed.success_rate !== 'number' ||
        parsed.success_rate < 0 || parsed.success_rate > 100) {
      console.log('[ExperienceEvaluator] Invalid required fields');
      return null;
    }

    return {
      success: parsed.overall_success,
      score: parsed.success_rate,
      root_cause: typeof parsed.failure_reason === 'string' ? parsed.failure_reason : null,
      suggestions: typeof parsed.lessons_learned === 'string' ? parsed.lessons_learned : null
    };
  },

  extractPageType: function(pageInfo) {
    if (!pageInfo) return 'unknown';

    var url = pageInfo.url || '';
    var title = pageInfo.title || '';
    var site = pageInfo.site || '';
    var text = (url + ' ' + title + ' ' + site).toLowerCase();

    if (text.match(/search|search=|google|bing|baidu|sogou/)) {
      return 'search_results';
    }
    if (text.match(/video|youtube|bilibili|twitch|youtu\.be/)) {
      return 'video_page';
    }
    if (text.match(/list|products|results|items/)) {
      return 'list_page';
    }
    if (text.match(/detail|product|item\/|p\/|product\/|detail/)) {
      return 'detail_page';
    }
    if (text.match(/form|login|register|signup|input|contact/)) {
      return 'form_page';
    }

    return 'unknown';
  }
};

// Note: exported as ES Module, globalThis assignment removed