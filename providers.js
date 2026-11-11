// AI providers for reading invoices. Every provider exposes:
//   listModels(key) -> Promise<[{id, label, created, pdf}]>   (vision-capable chat models, read live from the provider)
//   read(key, modelId, input) -> Promise<raw JSON text>       (input: {mime, data(base64), name, pages?: [{mime,data}]})
// No model ids are hard-coded: lists come from each provider's models endpoint.
(function (root) {
  'use strict';

  var FIELDS = ['bank', 'account', 'holder', 'amount', 'so_hd', 'ncc', 'mst', 'ngay'];
  var JSON_SCHEMA = {
    type: 'object',
    properties: FIELDS.reduce(function (o, k) { o[k] = { type: 'string' }; return o; }, {}),
    required: FIELDS,
    additionalProperties: false,
  };
  var GEMINI_SCHEMA = {
    type: 'OBJECT',
    properties: FIELDS.reduce(function (o, k) { o[k] = { type: 'STRING' }; return o; }, {}),
    required: FIELDS,
  };

  function httpError(status, body) {
    var msg = (body && body.error && (body.error.message || body.error)) || body && body.message || ('HTTP ' + status);
    var e = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    e.status = status;
    return e;
  }
  function getJson(url, opts) {
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) throw httpError(res.status, j);
        return j;
      });
    }, function () { var e = new Error('Mất kết nối mạng'); e.status = 0; throw e; });
  }
  function dataUrl(mime, data) { return 'data:' + mime + ';base64,' + data; }
  // Newest first: provider timestamp when given, else the version number inside the id.
  function versionKey(id) { var m = String(id).match(/(\d+(?:\.\d+)?)/g); return m ? m.map(Number) : [0]; }
  function byNewest(a, b) {
    if (a.created || b.created) return (b.created || 0) - (a.created || 0);
    var va = versionKey(a.id), vb = versionKey(b.id);
    for (var i = 0; i < Math.max(va.length, vb.length); i++) { var d = (vb[i] || 0) - (va[i] || 0); if (d) return d; }
    return a.id < b.id ? -1 : 1;
  }
  var NOT_CHAT = /(embed|tts|audio|realtime|transcribe|whisper|speech|moderation|imagen|image-gen|dall-e|gpt-image|veo|sora|search|aqa|robotics|computer-use|live|instruct|babbage|davinci)/i;

  // ---------- Google Gemini ----------
  var gemini = {
    id: 'gemini', name: 'Google Gemini', keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Có gói miễn phí. Khoá miễn phí: Google được dùng dữ liệu gửi lên để cải thiện sản phẩm.',
    listModels: function (key) {
      return getJson('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': key } }).then(function (j) {
        return (j.models || []).filter(function (m) {
          return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0 && !NOT_CHAT.test(m.name) && !/image|nano-banana|gemma/i.test(m.name);
        }).map(function (m) {
          return { id: m.name.replace(/^models\//, ''), label: m.displayName || m.name, pdf: true };
        });
      });
    },
    read: function (key, model, input, prompt) {
      return getJson('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ inline_data: { mime_type: input.mime, data: input.data } }, { text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA },
        }),
      }).then(function (j) {
        var c = j.candidates && j.candidates[0];
        return c && c.content && c.content.parts ? c.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
      });
    },
  };

  // ---------- Anthropic Claude ----------
  function claudeHeaders(key) {
    return {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2026-10-21',
      'anthropic-dangerous-direct-browser-access': 'true', // key stays in this browser only
    };
  }
  var claude = {
    id: 'claude', name: 'Anthropic Claude', keyHint: 'sk-ant-…', keyUrl: 'https://platform.claude.com/settings/keys',
    note: 'Trả phí theo lượt dùng (vài chục đồng mỗi hoá đơn với model nhỏ).',
    listModels: function (key) {
      return getJson('https://api.anthropic.com/v1/models?limit=1000', { headers: claudeHeaders(key) }).then(function (j) {
        return (j.data || []).filter(function (m) {
          var c = m.capabilities;
          return !c || !c.image_input || c.image_input.supported;
        }).map(function (m) {
          var c = m.capabilities || {};
          return {
            id: m.id, label: m.display_name || m.id, created: Date.parse(m.created_at) || 0,
            pdf: !c.pdf_input || c.pdf_input.supported !== false,
            structured: !!(c.structured_outputs && c.structured_outputs.supported),
          };
        });
      });
    },
    read: function (key, model, input, prompt, meta) {
      var block = input.mime === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.data } }
        : { type: 'image', source: { type: 'base64', media_type: input.mime, data: input.data } };
      var body = { model: model, max_tokens: 8000, messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }] };
      if (meta && meta.structured) body.output_config = { format: { type: 'json_schema', schema: JSON_SCHEMA } };
      return getJson('https://api.anthropic.com/v1/messages', { method: 'POST', headers: claudeHeaders(key), body: JSON.stringify(body) }).then(function (j) {
        if (j.stop_reason === 'refusal') throw new Error('Claude từ chối đọc file này.');
        return (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
      });
    },
  };

  // ---------- OpenAI-compatible (OpenAI, DeepSeek, OpenRouter) ----------
  function chatParts(input, prompt, pdfOk) {
    var parts = [{ type: 'text', text: prompt }];
    if (input.mime === 'application/pdf' && pdfOk) {
      parts.push({ type: 'file', file: { filename: input.name || 'hoa-don.pdf', file_data: dataUrl(input.mime, input.data) } });
    } else {
      (input.pages || [input]).forEach(function (p) { parts.push({ type: 'image_url', image_url: { url: dataUrl(p.mime, p.data) } }); });
    }
    return parts;
  }
  function openaiCompatible(cfg) {
    return {
      id: cfg.id, name: cfg.name, keyHint: cfg.keyHint, keyUrl: cfg.keyUrl, note: cfg.note,
      listModels: function (key) {
        var opts = cfg.listNeedsKey ? { headers: { Authorization: 'Bearer ' + key } } : {};
        return getJson(cfg.base + '/models', opts).then(function (j) { return cfg.mapModels(j.data || []); });
      },
      read: function (key, model, input, prompt, meta) {
        var pdfOk = !!(meta && meta.pdf);
        var body = { model: model, messages: [{ role: 'user', content: chatParts(input, prompt, pdfOk) }] };
        body.response_format = cfg.strictJson
          ? { type: 'json_schema', json_schema: { name: 'invoice', strict: true, schema: JSON_SCHEMA } }
          : { type: 'json_object' };
        var headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key };
        if (cfg.extraHeaders) Object.keys(cfg.extraHeaders).forEach(function (h) { headers[h] = cfg.extraHeaders[h]; });
        return getJson(cfg.base + '/chat/completions', { method: 'POST', headers: headers, body: JSON.stringify(body) }).then(function (j) {
          var m = j.choices && j.choices[0] && j.choices[0].message;
          if (!m) return '';
          return typeof m.content === 'string' ? m.content : (m.content || []).map(function (p) { return p.text || ''; }).join('');
        });
      },
      needsImages: cfg.needsImages,
    };
  }

  var openai = openaiCompatible({
    id: 'openai', name: 'OpenAI (ChatGPT)', keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys',
    note: 'Trả phí theo lượt dùng. Danh sách không ghi model nào đọc được ảnh: model không đọc được sẽ tự chuyển model khác.',
    base: 'https://api.openai.com/v1', listNeedsKey: true, strictJson: true,
    mapModels: function (data) {
      return data.filter(function (m) { return /^(gpt-|o\d|chatgpt)/i.test(m.id) && !NOT_CHAT.test(m.id) && !/(codex|oss|3\.5)/i.test(m.id); })
        .map(function (m) { return { id: m.id, label: m.id, created: (m.created || 0) * 1000, pdf: true }; });
    },
  });

  var deepseek = openaiCompatible({
    id: 'deepseek', name: 'DeepSeek', keyHint: 'sk-…', keyUrl: 'https://platform.deepseek.com/api_keys',
    note: 'Trả phí, rẻ. Chưa chắc mọi model DeepSeek đọc được ảnh: PDF được đổi sang ảnh trước khi gửi. Đọc lỗi thì dùng OpenRouter.',
    base: 'https://api.deepseek.com', listNeedsKey: true, strictJson: false, needsImages: true,
    mapModels: function (data) {
      return data.filter(function (m) { return !NOT_CHAT.test(m.id); }).map(function (m) { return { id: m.id, label: m.id, pdf: false }; });
    },
  });

  var openrouter = openaiCompatible({
    id: 'openrouter', name: 'OpenRouter (1 khoá dùng mọi hãng)', keyHint: 'sk-or-…', keyUrl: 'https://openrouter.ai/settings/keys',
    note: 'Một khoá gọi được Claude, GPT, Gemini, DeepSeek, Qwen, Grok… Có model miễn phí (đuôi :free).',
    base: 'https://openrouter.ai/api/v1', listNeedsKey: false, strictJson: true,
    extraHeaders: { 'X-Title': 'hoa-don-qr' },
    mapModels: function (data) {
      return data.filter(function (m) {
        var a = m.architecture || {};
        return (a.input_modalities || []).indexOf('image') >= 0 && (a.output_modalities || ['text']).indexOf('text') >= 0 && !/:batch$/.test(m.id);
      }).map(function (m) {
        var a = m.architecture || {};
        return {
          id: m.id, label: m.name || m.id, created: (m.created || 0) * 1000,
          pdf: (a.input_modalities || []).indexOf('file') >= 0,
          group: (m.name || m.id).split(':')[0].trim(),
        };
      });
    },
  });

  var PROVIDERS = [gemini, claude, openai, deepseek, openrouter];
  // Whole name parts only: "gemini" must not count as "mini".
  var FAST = /(^|[-_/.\s])(flash|haiku|mini|lite|fast|nano|small)(?=$|[-_.:\s\d])/i;
  var UNSTABLE = /(^|[-_/.\s])(preview|exp|experimental|beta|latest|alpha)(?=$|[-_.:\s\d])|:free$/i;

  // Default pick without a fixed id: newest stable fast-tier model, else newest stable, else newest.
  function pickDefault(models) {
    var sorted = models.slice().sort(byNewest);
    return sorted.find(function (m) { return FAST.test(m.id) && !UNSTABLE.test(m.id); }) ||
      sorted.find(function (m) { return !UNSTABLE.test(m.id); }) || sorted[0] || null;
  }

  var api = {
    list: PROVIDERS,
    get: function (id) { return PROVIDERS.find(function (p) { return p.id === id; }) || gemini; },
    sort: function (models) { return models.slice().sort(byNewest); },
    pickDefault: pickDefault,
    FAST: FAST, UNSTABLE: UNSTABLE,
  };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Providers = api;
})(this);
