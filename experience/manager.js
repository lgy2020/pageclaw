import { ExperienceEvaluator } from './evaluator.js';
export { ExperienceEvaluator };

export var ExperienceManager = {
  STORAGE_KEY: 'pageclaw_experiences',
  MAX_EXPERIENCES: 100,
  MAX_STORAGE_SIZE: 5242880,
  SIMILARITY_THRESHOLD: 70,

  init: function() {
    var self = this;
    return new Promise(function(resolve) {
      chrome.storage.local.get([self.STORAGE_KEY], function(result) {
        var experiences = result[self.STORAGE_KEY] || [];
        console.log('[Experience] Loaded ' + experiences.length + ' experiences');
        resolve();
      });
    });
  },

  // Store a pre-evaluated experience (no LLM call, for use by engine.js eval flow)
  storeExperience: function(taskContext, evaluation) {
    var self = this;
    return new Promise(function(resolve) {
      (async function() {
        try {
          var pageInfo = taskContext.pageInfo || {};
          var keywords = self._extractKeywords(taskContext.instruction);
          var intentType = self._classifyIntent(keywords);
          var pageType = ExperienceEvaluator.extractPageType(pageInfo);

          var stepTypes = [];
          if (taskContext.steps) {
            taskContext.steps.forEach(function(step) {
              if (step.type && stepTypes.indexOf(step.type) === -1) {
                stepTypes.push(step.type);
              }
            });
          }

          var experience = {
            id: self._generateId(),
            version: 1,
            timestamp: Date.now(),
            task_signature: {
              instruction_hash: btoa(unescape(encodeURIComponent(taskContext.instruction))).substring(0, 32),
              keywords: keywords,
              intent_type: intentType
            },
            page_context: {
              domain: pageInfo.url ? pageInfo.url.replace(/^https?:\/\/([^/]+).*/, '$1') : '',
              page_type: pageType,
              has_pagination: !!(pageInfo.hasPaginator || pageInfo.hasPagination)
            },
            execution_summary: {
              total_steps: taskContext.steps ? taskContext.steps.length : 0,
              step_types: stepTypes,
              duration_ms: taskContext.durationMs || 0
            },
            evaluation: evaluation,
            access_count: 0,
            last_accessed: Date.now()
          };

          var experiences = await self._loadExperiences();
          experiences.push(experience);
          experiences = self._evictIfNeeded(experiences);
          await self._saveExperiences(experiences);

          console.log('[Experience] Stored:', experience.id, 'score:', evaluation.score);
          resolve();
        } catch (e) {
          console.log('[Experience] storeExperience failed:', e.message);
          resolve();
        }
      })();
    });
  },

  evaluateAndStore: function(taskContext, llmClient) {
    var self = this;
    return new Promise(function(resolve) {
      (async function() {
        try {
          var pageInfo = taskContext.pageInfo || {};
          var finalPageState = {
            url: pageInfo.url || '',
            title: pageInfo.title || '',
            contentSummary: pageInfo.text || ''
          };

          var input = {
            instruction: taskContext.instruction,
            steps: taskContext.steps || [],
            finalPageState: finalPageState,
            executionTimeMs: taskContext.durationMs || 0
          };

          var userPrompt = ExperienceEvaluator.buildEvaluationPrompt(input);
          var systemPrompt = 'You are a task execution quality evaluator. Analyze the browser automation task execution and provide objective assessment. Output ONLY valid JSON.';

          var llmResponse = await llmClient.call(systemPrompt, userPrompt);
          var evaluation = ExperienceEvaluator.parseEvaluationResult(llmResponse);

          if (!evaluation) {
            console.log('[Experience] Evaluation parsing failed, using defaults');
            evaluation = {
              success: true,
              score: 50,
              root_cause: null,
              suggestions: null
            };
          }

          var keywords = self._extractKeywords(taskContext.instruction);
          var intentType = self._classifyIntent(keywords);
          var pageType = ExperienceEvaluator.extractPageType(pageInfo);

          var stepTypes = [];
          if (taskContext.steps) {
            taskContext.steps.forEach(function(step) {
              if (step.type && stepTypes.indexOf(step.type) === -1) {
                stepTypes.push(step.type);
              }
            });
          }

          var experience = {
            id: self._generateId(),
            version: 1,
            timestamp: Date.now(),
            task_signature: {
              instruction_hash: btoa(taskContext.instruction).substring(0, 32),
              keywords: keywords,
              intent_type: intentType
            },
            page_context: {
              domain: pageInfo.url ? pageInfo.url.replace(/^https?:\/\/([^/]+).*/, '$1') : '',
              page_type: pageType,
              has_pagination: !!(pageInfo.hasPaginator || pageInfo.hasPagination)
            },
            execution_summary: {
              total_steps: taskContext.steps ? taskContext.steps.length : 0,
              step_types: stepTypes,
              duration_ms: taskContext.durationMs || 0
            },
            evaluation: evaluation,
            access_count: 0,
            last_accessed: Date.now()
          };

          var experiences = await self._loadExperiences();
          experiences.push(experience);
          experiences = self._evictIfNeeded(experiences);
          await self._saveExperiences(experiences);

          console.log('[Experience] Stored experience:', experience.id, 'success:', evaluation.overall_success);
          resolve();
        } catch (e) {
          console.log('[Experience] Eval failed:', e.message);
          resolve();
        }
      })();
    });
  },

  findSimilar: function(instruction, pageInfo, limit) {
    var self = this;
    return new Promise(function(resolve) {
      (async function() {
        try {
          var experiences = await self._loadExperiences();
          if (!experiences || experiences.length === 0) {
            resolve([]);
            return;
          }

          var keywords = self._extractKeywords(instruction);
          var pageType = ExperienceEvaluator.extractPageType(pageInfo);

          var scored = experiences.map(function(exp) {
            var similarity = self._calculateSimilarity(exp, instruction, pageInfo);
            return { experience: exp, similarity: similarity };
          });

          scored.sort(function(a, b) { return b.similarity - a.similarity; });

          var filtered = scored.filter(function(item) {
            return item.similarity >= self.SIMILARITY_THRESHOLD;
          });

          var topItems = filtered.slice(0, limit || 3);

          topItems.forEach(function(item) {
            self._updateAccessStats(item.experience);
          });

          var experiencesToSave = experiences.map(function(exp) {
            var found = topItems.find(function(t) { return t.experience.id === exp.id; });
            return found ? found.experience : exp;
          });
          await self._saveExperiences(experiencesToSave);

          resolve(topItems);
        } catch (e) {
          console.log('[Experience] findSimilar failed:', e.message);
          resolve([]);
        }
      })();
    });
  },

  buildExperiencePrompt: function(similarExperiences) {
    if (!similarExperiences || similarExperiences.length === 0) {
      return '';
    }

    var lines = ['\n\n========== 参考经验 ==========\n'];

    similarExperiences.forEach(function(item) {
      var exp = item.experience;
      var ev = exp.evaluation || {};
      var successStr = ev.success ? '成功' : '失败';
      var scoreStr = ev.score != null ? ev.score + '/100' : 'N/A';

      lines.push('[' + (exp.task_signature ? exp.task_signature.intent_type : 'general') + '] ' + successStr + ' (评分: ' + scoreStr + ')');

      if (ev.root_cause) {
        lines.push('问题分析: ' + ev.root_cause);
      }

      if (ev.suggestions) {
        lines.push('改进建议: ' + ev.suggestions);
      }

      lines.push('-----------------------------------\n');
    });

    lines.push('========================================\n');

    return lines.join('\n');
  },

  _generateId: function() {
    return 'exp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  },

  _extractKeywords: function(text) {
    if (!text) return [];

    var chineseSeparators = `，。！？；：""''【】（）《》、·`;
    var normalized = text;
    chineseSeparators.split('').forEach(function(c) {
      normalized = normalized.split(c).join(' ');
    });

    var parts = normalized.split(/[\s,.\-_+=/<>[\]{}()!?@#$%^&*~\\|]+/).filter(Boolean);

    var stopWords = ['the', 'a', 'is', 'and', 'or', 'to', 'in', 'for', '的', '了', '在', '是', '和', '与', '有', '为', '就', '不', '也', '都', '把', '被', '让', '向', '到', '上', '下', '中'];

    var filtered = parts.filter(function(word) {
      var lower = word.toLowerCase();
      return word.length > 1 && stopWords.indexOf(lower) === -1;
    });

    var unique = [];
    var seen = {};
    filtered.forEach(function(word) {
      var key = word.toLowerCase();
      if (!seen[key]) {
        seen[key] = true;
        unique.push(word);
      }
    });

    return unique;
  },

  _classifyIntent: function(keywords) {
    if (!keywords || keywords.length === 0) return 'general';

    var text = keywords.join(' ').toLowerCase();

    if (text.match(/data_extraction|read|get|extract|show|找|提取|读|获取/)) {
      return 'data_extraction';
    }
    if (text.match(/navigation|open|go|visit|打开|前往|访问/)) {
      return 'navigation';
    }
    if (text.match(/form_fill|fill|type|input|填写|输入|表单/)) {
      return 'form_fill';
    }
    if (text.match(/media|play|watch|video|播放|看|视频/)) {
      return 'media';
    }
    if (text.match(/search|find|搜索|查找|搜/)) {
      return 'search';
    }
    if (text.match(/shopping|buy|price|shop|买|价格|购物/)) {
      return 'shopping';
    }

    return 'general';
  },

  _calculateSimilarity: function(exp, instruction, pageInfo) {
    var keywords = this._extractKeywords ?
      this._extractKeywords(instruction) : [];

    var expKeywords = exp.task_signature && exp.task_signature.keywords ? exp.task_signature.keywords : [];

    var set1 = new Set(keywords.map(function(w) { return w.toLowerCase(); }));
    var set2 = new Set(expKeywords.map(function(w) { return w.toLowerCase(); }));

    var intersection = 0;
    set1.forEach(function(w) {
      if (set2.has(w)) intersection++;
    });

    var union = set1.size + set2.size - intersection;
    var jaccard = union > 0 ? intersection / union : 0;
    var keywordScore = jaccard * 100;

    var pageContextScore = 0;
    if (exp.page_context && pageInfo) {
      var expDomain = exp.page_context.domain || '';
      var pageDomain = pageInfo.url ? pageInfo.url.replace(/^https?:\/\/([^/]+).*/, '$1') : '';

      if (expDomain && pageDomain && expDomain === pageDomain) {
        pageContextScore = 100;
      } else if (exp.page_context.page_type && pageInfo.site) {
        var pageType = ExperienceEvaluator.extractPageType(pageInfo);
        if (exp.page_context.page_type === pageType) {
          pageContextScore = 50;
        }
      }
    }

    var similarity = (keywordScore * 0.6) + (pageContextScore * 0.4);
    return Math.round(similarity);
  },

  _loadExperiences: function() {
    var self = this;
    return new Promise(function(resolve) {
      chrome.storage.local.get([self.STORAGE_KEY], function(result) {
        resolve(result[self.STORAGE_KEY] || []);
      });
    });
  },

  _saveExperiences: function(experiences) {
    var self = this;
    return new Promise(function(resolve) {
      var data = {};
      data[self.STORAGE_KEY] = experiences;
      chrome.storage.local.set(data, function() {
        resolve();
      });
    });
  },

  _evictIfNeeded: function(experiences) {
    var result = experiences.slice();

    while (result.length > this.MAX_EXPERIENCES) {
      result.sort(function(a, b) { return (b.last_accessed || 0) - (a.last_accessed || 0); });
      result = result.slice(0, this.MAX_EXPERIENCES);
    }

    while (JSON.stringify(result).length > this.MAX_STORAGE_SIZE && result.length > 0) {
      result.sort(function(a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
      result = result.slice(1);
    }

    return result;
  },

  _updateAccessStats: function(exp) {
    if (!exp) return;
    exp.access_count = (exp.access_count || 0) + 1;
    exp.last_accessed = Date.now();
  }
};

