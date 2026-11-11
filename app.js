/* global BANKS, VietQR, qrcode, Providers */
(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('hdqr.' + k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('hdqr.' + k, v); } catch (e) { /* private mode */ } },
  };

  // ---------- settings ----------
  var providerSel = $('#provider');
  var apiKey = $('#apiKey');
  var model = $('#model');
  var noteTpl = $('#noteTpl');
  var modelMeta = {}; // id -> {pdf, structured} from the provider's model list
  var modelList = [];

  // one-time move of the v1 single Gemini key
  if (store.get('key', '') && !store.get('key.gemini', '')) store.set('key.gemini', store.get('key', ''));

  Providers.list.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; providerSel.appendChild(o); });
  providerSel.value = store.get('provider', 'gemini');
  noteTpl.value = store.get('tpl', noteTpl.value);

  function provider() { return Providers.get(providerSel.value); }
  function shortName() { return provider().name.split(' (')[0]; }
  function showKeyState() {
    var has = apiKey.value.trim().length > 0;
    $('#keyState').textContent = has ? 'AI: ' + shortName() + (model.value ? ' · ' + model.value : '') : 'chưa có khoá AI, gõ tay';
    $('#keyState').className = 'pill ' + (has ? 'on' : 'off');
  }
  function fillModelSelect(models, keep) {
    modelList = Providers.sort(models);
    modelMeta = {};
    model.innerHTML = '';
    var groups = {};
    modelList.forEach(function (m) {
      modelMeta[m.id] = m;
      var o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.label === m.id ? m.id : m.label + ' · ' + m.id;
      var parent = model;
      if (m.group) {
        if (!groups[m.group]) { groups[m.group] = document.createElement('optgroup'); groups[m.group].label = m.group; model.appendChild(groups[m.group]); }
        parent = groups[m.group];
      }
      parent.appendChild(o);
    });
    var pick = keep && modelMeta[keep] ? keep : (Providers.pickDefault(modelList) || {}).id;
    if (pick) model.value = pick;
    store.set('model.' + provider().id, model.value);
    $('#modelNote').textContent = modelList.length
      ? modelList.length + ' model đọc được ảnh, lấy trực tiếp từ ' + shortName() + '. Đã chọn sẵn model mới và nhanh; đổi tuỳ ý. Model bận thì tool tự thử model khác.'
      : 'Hãng không trả model nào đọc được ảnh.';
    showKeyState();
  }
  function loadModels(force) {
    var p = provider();
    var key = apiKey.value.trim();
    var cacheKey = 'models.' + p.id;
    var saved = store.get('model.' + p.id, '');
    if (!force) {
      try {
        var c = JSON.parse(store.get(cacheKey, 'null'));
        if (c && Date.now() - c.at < 24 * 3600 * 1000 && c.models.length) { fillModelSelect(c.models, saved); return Promise.resolve(); }
      } catch (e) { /* ignore bad cache */ }
    }
    if (!key) { model.innerHTML = '<option value="">Dán khoá để tải danh sách model</option>'; showKeyState(); return Promise.resolve(); }
    model.innerHTML = '<option value="">Đang tải danh sách model…</option>';
    return p.listModels(key).then(function (models) {
      store.set(cacheKey, JSON.stringify({ at: Date.now(), models: models }));
      fillModelSelect(models, saved);
    }).catch(function (e) {
      modelList = [];
      model.innerHTML = '<option value="">Không tải được danh sách model</option>';
      $('#modelNote').textContent = (e.status === 401 || e.status === 403 || e.status === 400) ? 'Khoá không đúng hoặc chưa có quyền. Kiểm tra lại khoá.' : 'Lỗi tải danh sách: ' + e.message;
      showKeyState();
    });
  }
  function showProvider() {
    var p = provider();
    apiKey.value = store.get('key.' + p.id, '');
    apiKey.placeholder = 'Dán khoá ' + p.keyHint;
    $('#keyLink').href = p.keyUrl;
    $('#keyLink').textContent = p.keyUrl.replace(/^https:\/\//, '');
    $('#providerNote').textContent = p.note;
    return loadModels(false);
  }
  var keyTimer = null;
  providerSel.addEventListener('change', function () { store.set('provider', providerSel.value); showProvider(); });
  apiKey.addEventListener('input', function () {
    store.set('key.' + provider().id, apiKey.value.trim());
    showKeyState();
    clearTimeout(keyTimer);
    keyTimer = setTimeout(function () { loadModels(true); }, 600);
  });
  model.addEventListener('change', function () { store.set('model.' + provider().id, model.value); showKeyState(); });
  $('#reloadModels').addEventListener('click', function () { loadModels(true); });
  noteTpl.addEventListener('input', function () {
    store.set('tpl', noteTpl.value);
    cards.forEach(function (c) { if (!c.noteEdited) { c.fillNote(); c.render(); } });
  });
  showProvider();
  if (!apiKey.value) $('#settings').open = true;

  // ---------- banks ----------
  function bankLabel(b) { return b.short + ' · ' + b.bin + ' · ' + b.name; }
  var dl = $('#bankList');
  BANKS.forEach(function (b) { var o = document.createElement('option'); o.value = bankLabel(b); dl.appendChild(o); });

  function fold(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D')
      .toLowerCase().replace(/ngan hang|thuong mai|co phan|tmcp|tnhh mtv|bank|chi nhanh.*$/g, ' ').replace(/[^a-z0-9]/g, '');
  }
  function findBank(text) {
    if (!text) return null;
    var bin = String(text).match(/\b(\d{6})\b/);
    if (bin) { var byBin = BANKS.find(function (b) { return b.bin === bin[1]; }); if (byBin) return byBin; }
    var f = fold(text);
    if (!f) return null;
    var exact = BANKS.find(function (b) { return fold(b.short) === f || fold(b.code) === f; });
    if (exact) return exact;
    return BANKS.find(function (b) { return f.indexOf(fold(b.short)) >= 0 && fold(b.short).length >= 3; }) ||
      BANKS.find(function (b) { return fold(b.name).indexOf(f) >= 0 || f.indexOf(fold(b.name)) >= 0; }) || null;
  }

  // ---------- AI ----------
  var PROMPT = [
    'Bạn đọc hoá đơn / phiếu yêu cầu thanh toán của Việt Nam. Chỉ trả về 1 object JSON, không giải thích.',
    'Các khoá: bank, account, holder, amount, so_hd, ncc, mst, ngay (đều là chuỗi).',
    'Lấy thông tin TÀI KHOẢN NHẬN TIỀN của BÊN BÁN (người bán, nhà cung cấp), không phải bên mua.',
    'bank: tên ngắn ngân hàng nhận, chọn đúng 1 tên trong danh sách: ' + BANKS.map(function (b) { return b.short; }).join(', ') + '.',
    'account: chỉ chữ số của số tài khoản. holder: tên chủ tài khoản. amount: tổng tiền phải thanh toán (đã gồm thuế), chỉ chữ số, đơn vị đồng.',
    'so_hd: số hoá đơn. ncc: tên ngắn bên bán, tối đa 3 từ, bỏ "Công ty TNHH/Cổ phần". mst: mã số thuế bên bán. ngay: ngày hoá đơn dd/mm/yyyy.',
    'Không thấy trường nào thì để chuỗi rỗng. Không đoán số tài khoản: mã khách hàng, số điện thoại, mã số thuế không phải số tài khoản.',
  ].join('\n');

  function toBase64(file) {
    return new Promise(function (ok, bad) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1]); };
      r.onerror = function () { bad(r.error); };
      r.readAsDataURL(file);
    });
  }

  // PDF -> JPEG pages, for models that only take images. pdf.js is loaded on first use.
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  var pdfjsReady = null;
  function loadPdfjs() {
    if (!pdfjsReady) {
      pdfjsReady = new Promise(function (ok, bad) {
        var s = document.createElement('script');
        s.src = PDFJS + 'pdf.min.js';
        s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
        s.onerror = function () { pdfjsReady = null; bad(new Error('Không tải được bộ đọc PDF')); };
        document.head.appendChild(s);
      });
    }
    return pdfjsReady;
  }
  // Phone photos are 3000-4000 px and several MB; the AI reads an invoice just as well at 1600 px, and the
  // upload (base64 = +33%) is what users wait on over mobile data. Small files pass through untouched.
  var MAX_SIDE = 1600;
  function shrinkImage(file) {
    if (!/^image\/(png|jpeg|webp|bmp)$/.test(file.type) || !window.createImageBitmap) return toBase64(file).then(function (d) { return { mime: file.type, data: d }; });
    return createImageBitmap(file).then(function (bmp) {
      var k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      if (k === 1 && file.size <= 1024 * 1024) { bmp.close(); return toBase64(file).then(function (d) { return { mime: file.type, data: d }; }); }
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); // PNG transparency -> white, not black
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      // Photos shrink most as JPEG; screenshots and scans with flat colours can be smaller as PNG.
      var jpg = c.toDataURL('image/jpeg', 0.85).split(',')[1];
      var png = file.type === 'image/png' ? c.toDataURL('image/png').split(',')[1] : null;
      return png && png.length < jpg.length ? { mime: 'image/png', data: png } : { mime: 'image/jpeg', data: jpg };
    }).catch(function () { return toBase64(file).then(function (d) { return { mime: file.type, data: d }; }); });
  }
  function pdfToImages(base64, maxPages) {
    return loadPdfjs().then(function (lib) {
      var bytes = Uint8Array.from(atob(base64), function (c) { return c.charCodeAt(0); });
      return lib.getDocument({ data: bytes }).promise.then(function (doc) {
        var n = Math.min(doc.numPages, maxPages);
        var jobs = [];
        for (var i = 1; i <= n; i++) {
          jobs.push(doc.getPage(i).then(function (page) {
            var base = page.getViewport({ scale: 1 });
            var vp = page.getViewport({ scale: Math.min(3, MAX_SIDE / Math.max(base.width, base.height)) });
            var c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
            return page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () {
              return { mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] };
            });
          }));
        }
        return Promise.all(jobs);
      });
    });
  }

  function parseJson(text) {
    var t = String(text || '').trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\x60\x60\x60\s*$/, '');
    try { return JSON.parse(t); } catch (e) {
      var m = t.match(/\{[\s\S]*\}/);
      if (m) { try { return JSON.parse(m[0]); } catch (e2) { /* fall through */ } }
      throw new Error('AI trả lời không đúng dạng. Bấm Đọc lại hoặc chọn model khác.');
    }
  }

  var RETRY = { 0: 1, 408: 1, 429: 1, 500: 1, 502: 1, 503: 1, 504: 1, 529: 1 };
  function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }

  // Try plan: chosen model twice, then up to 2 other stable models of the same provider, same speed tier first.
  function plan(chosen) {
    var tier = Providers.FAST.test(chosen);
    var others = Providers.sort(modelList).filter(function (m) { return m.id !== chosen && !Providers.UNSTABLE.test(m.id); });
    others.sort(function (a, b) { return (Providers.FAST.test(b.id) === tier) - (Providers.FAST.test(a.id) === tier); });
    return [chosen, chosen].concat(others.slice(0, 2).map(function (m) { return m.id; }));
  }

  var TOTAL_MS = 120000; // one card never waits longer than this, whatever the retries
  function readInvoice(file, onStep, signal) {
    var p = provider();
    var name = shortName();
    var key = apiKey.value.trim();
    var chosen = model.value;
    if (!chosen) return Promise.reject(new Error('Chưa chọn model. Mở Cài đặt, bấm Tải lại danh sách.'));
    var steps = plan(chosen);
    var started = Date.now();
    var isPdf = (file.type || 'application/pdf') === 'application/pdf';
    return (isPdf ? toBase64(file).then(function (d) { return { mime: 'application/pdf', data: d }; }) : shrinkImage(file)).then(function (img) {
      var input = { mime: img.mime, data: img.data, name: file.name };
      var i = 0;
      var last = null;
      function prepare(m) {
        var meta = modelMeta[m] || {};
        var needImg = input.mime === 'application/pdf' && (p.needsImages || meta.pdf === false);
        if (!needImg || input.pages) return Promise.resolve();
        onStep('Đang đổi PDF sang ảnh…');
        return pdfToImages(input.data, 3).then(function (pages) { input.pages = pages; });
      }
      function next() {
        if (signal && signal.aborted) { var c = new Error('Đã huỷ'); c.status = 'cancelled'; throw c; }
        var left = TOTAL_MS - (Date.now() - started);
        if (i < steps.length && left < 5000) i = steps.length;
        if (i >= steps.length) {
          if (last && last.status === 'timeout') throw new Error(name + ' không trả lời (đã chờ ' + Math.round((Date.now() - started) / 1000) + ' giây). Bấm Đọc lại, hoặc chọn model "flash/mini" khác trong Cài đặt.');
          if (last && last.status === 429) throw new Error('Hết lượt dùng của khoá ở mọi model đã thử. Đợi 1–2 phút rồi bấm Đọc lại.');
          if (last && last.kind === 'input') throw new Error('Các model đã thử không đọc được loại file này. Chọn model khác hoặc hãng khác (OpenRouter, Gemini).');
          throw new Error('Máy chủ AI đang quá tải. Đợi vài phút rồi bấm Đọc lại, hoặc chọn hãng khác.');
        }
        var m = steps[i];
        if (i > 0) onStep('AI bận, thử lại' + (m !== chosen ? ' bằng ' + m : '') + '…');
        var pause = i === 0 ? 0 : i === 1 ? 2000 : 1500;
        i++;
        return wait(pause).then(function () { return prepare(m); }).then(function () {
          return p.read(key, m, input, PROMPT, Object.assign({ timeoutMs: Math.min(45000, left) }, modelMeta[m] || {}), signal);
        }).then(function (text) {
          if (!text) throw new Error('AI không đọc được file này. Thử ảnh rõ hơn, hoặc gõ tay.');
          var out = parseJson(text);
          out._model = m;
          return out;
        }, function (e) {
          var s = e.status;
          if (s === undefined || s === 'cancelled') throw e;
          if (s === 'timeout') {
            last = e;
            while (i < steps.length && steps[i] === m) i++; // a model that hung once will likely hang again
            return next();
          }
          if (s === 401 || (s === 400 && /api.?key|auth/i.test(e.message))) throw new Error('Khoá ' + name + ' không đúng. Kiểm tra lại trong Cài đặt.');
          if (s === 402) throw new Error('Tài khoản ' + name + ' hết tiền. Nạp thêm hoặc chọn hãng khác.');
          if (s === 403) throw new Error('Khoá không có quyền dùng model này. Chọn model khác trong Cài đặt.');
          if (RETRY[s] !== undefined) { last = e; return next(); }
          if (s === 404 || (s === 400 && /image|vision|file|pdf|modalit|document|content type|not support/i.test(e.message))) {
            last = { status: s, kind: 'input' };
            while (i < steps.length && steps[i] === m) i++; // same model will fail the same way
            return next();
          }
          throw new Error('Lỗi từ ' + name + ': ' + e.message);
        });
      }
      return next();
    });
  }

  // ---------- cards ----------
  var cards = [];
  var list = $('#list');

  function fmtMoney(digits) { return digits ? Number(digits).toLocaleString('vi-VN') + ' đ' : 'người chuyển tự nhập'; }
  function ddmmyy(s) { var m = String(s || '').match(/(\d{1,2})\D(\d{1,2})\D(\d{2,4})/); return m ? ('0' + m[1]).slice(-2) + ('0' + m[2]).slice(-2) + m[3].slice(-2) : ''; }

  function Card(file) {
    var self = this;
    this.file = file;
    this.noteEdited = false;
    this.el = $('#cardTpl').content.firstElementChild.cloneNode(true);
    this.form = $('form', this.el);
    this.canvas = $('canvas', this.el);
    this.payload = '';
    $('.fname', this.el).textContent = file ? file.name : 'Nhập tay';
    var pv = $('.preview', this.el);
    if (file && /^image\//.test(file.type)) {
      var img = new Image(); img.alt = file.name; img.src = URL.createObjectURL(file); pv.appendChild(img);
    } else if (file) {
      pv.innerHTML = '<div class="pdf">PDF</div>';
    } else {
      pv.hidden = true;
    }
    this.form.addEventListener('input', function (e) {
      if (e.target.name === 'note') self.noteEdited = true;
      else if (!self.noteEdited) self.fillNote();
      self.render();
    });
    this.form.addEventListener('submit', function (e) { e.preventDefault(); });
    $('.x', this.el).addEventListener('click', function () { if (self.ctl) self.ctl.abort(); self.ctl = null; self.el.remove(); cards.splice(cards.indexOf(self), 1); updateBulk(); });
    $('.dl', this.el).addEventListener('click', function () { self.download(); });
    var again = $('.again', this.el);
    again.hidden = !file;
    again.addEventListener('click', function () { self.read(); });
    $('.cp', this.el).addEventListener('click', function (e) {
      if (!self.payload) return;
      var b = e.target;
      (navigator.clipboard ? navigator.clipboard.writeText(self.payload) : Promise.reject()).then(function () {
        b.textContent = 'Đã copy'; setTimeout(function () { b.textContent = 'Copy mã'; }, 1500);
      }).catch(function () { window.prompt('Copy mã này:', self.payload); });
    });
    list.prepend(this.el);
    cards.push(this);
    this.fillNote();
    this.render();
  }
  Card.prototype.val = function (n) { return this.form.elements[n].value.trim(); };
  Card.prototype.set = function (n, v) { this.form.elements[n].value = v == null ? '' : String(v); };
  Card.prototype.fillNote = function () {
    var self = this;
    var note = noteTpl.value.replace(/\{(so_hd|ncc|mst|ngay)\}/g, function (_, k) { return k === 'ngay' ? ddmmyy(self.val('ngay')) : self.val(k); });
    this.set('note', VietQR.cleanNote(note));
  };
  Card.prototype.status = function (text, kind) { var s = $('.status', this.el); s.textContent = text; s.className = 'status ' + (kind || ''); };
  Card.prototype.fill = function (d) {
    var bank = findBank(d.bank) || findBank(d.bank_raw);
    this.set('bank', bank ? bankLabel(bank) : (d.bank || ''));
    this.set('account', String(d.account || '').replace(/\D/g, ''));
    this.set('holder', d.holder);
    this.set('amount', VietQR.cleanAmount(d.amount));
    ['so_hd', 'ncc', 'mst', 'ngay'].forEach(function (k) { this.set(k, d[k]); }, this);
    this.noteEdited = false;
    this.fillNote();
    this.render();
  };
  Card.prototype.data = function () {
    var bank = findBank(this.val('bank'));
    return { bank: bank, account: this.val('account'), holder: this.val('holder'), amount: VietQR.cleanAmount(this.val('amount')), note: VietQR.cleanNote(this.val('note')) };
  };
  Card.prototype.render = function () {
    var d = this.data();
    var err = $('.err', this.el);
    var ctx = this.canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.payload = '';
    this.el.classList.remove('ready');
    if (!d.bank) { err.textContent = 'Chọn ngân hàng nhận.'; return; }
    if (!d.account) { err.textContent = 'Nhập số tài khoản.'; return; }
    try { this.payload = VietQR.build({ bin: d.bank.bin, account: d.account, amount: d.amount, note: d.note }); } catch (e) { err.textContent = e.message; return; }
    err.textContent = d.amount ? '' : 'Chưa có số tiền: người chuyển sẽ tự nhập.';
    this.el.classList.add('ready');
    drawQr(ctx, this.payload, [
      d.bank.short + ' · ' + d.account,
      d.holder ? d.holder.toUpperCase() : '',
      fmtMoney(d.amount),
      d.note,
    ]);
  };
  Card.prototype.download = function () {
    if (!this.payload) return;
    var d = this.data();
    var a = document.createElement('a');
    a.href = this.canvas.toDataURL('image/png');
    a.download = 'QR-' + (this.val('so_hd') || d.account).replace(/[^\w-]+/g, '_') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
  };
  // Each card owns its read: an AbortController (Đọc lại cancels the old call) and a seconds counter, so the
  // user always sees that something is moving and for how long.
  Card.prototype.read = function () {
    var self = this;
    if (this.ctl) this.ctl.abort();
    if (!apiKey.value.trim()) { this.status('Chưa có khoá AI: gõ tay các ô', 'warn'); return Promise.resolve(); }
    var ctl = this.ctl = new AbortController();
    var t0 = Date.now();
    var step = 'Chờ lượt đọc…';
    function secs() { return Math.round((Date.now() - t0) / 1000); }
    function tick() { if (self.ctl === ctl) self.status(step + ' ' + secs() + ' giây', 'busy'); }
    tick();
    var timer = setInterval(tick, 1000);
    return slot(function () {
      if (ctl.signal.aborted) return null;
      step = 'AI đang đọc…'; tick();
      return readInvoice(this.file, function (t) { step = t; tick(); }, ctl.signal);
    }.bind(this)).then(function (d) {
      if (!d || self.ctl !== ctl) return;
      self.fill(d);
      var via = ' · đọc xong trong ' + secs() + ' giây bằng ' + d._model;
      if (self.payload) self.status('Đã đọc · kiểm lại số TK và số tiền' + via, 'ok');
      else if (!self.val('account')) self.status('Đã đọc · hoá đơn không ghi số tài khoản bên bán, gõ tay nếu biết' + via, 'warn');
      else self.status('Đọc thiếu, gõ thêm' + via, 'warn');
    }).catch(function (e) {
      if (self.ctl !== ctl || e.status === 'cancelled') return;
      self.status(e.message, 'bad');
    }).then(function () { clearInterval(timer); if (self.ctl === ctl) self.ctl = null; });
  };

  function drawQr(ctx, text, lines) {
    var qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount();
    var W = ctx.canvas.width;
    var quiet = 4;
    var cell = Math.floor(W / (n + quiet * 2));
    var off = Math.floor((W - cell * n) / 2);
    ctx.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
    ctx.textAlign = 'center';
    var y = W + 6;
    lines.forEach(function (t, i) {
      if (!t) return;
      ctx.font = (i === 2 ? 'bold 22px' : i === 0 ? 'bold 16px' : '15px') + ' "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = i === 2 ? '#0b6e4f' : '#111';
      ctx.fillText(t.length > 42 ? t.slice(0, 41) + '…' : t, W / 2, y + 16);
      y += i === 2 ? 30 : 24;
    });
  }

  // ---------- intake ----------
  // At most 2 reads at once (free tiers allow ~10 requests a minute); each card runs on its own, so one slow
  // or hung call no longer holds up every other card the way the old single chain did.
  var PARALLEL = 2, running = 0, waiting = [];
  function slot(job) {
    return new Promise(function (ok, bad) {
      waiting.push(function () {
        running++;
        Promise.resolve().then(job).then(ok, bad).then(function () { running--; pump(); });
      });
      pump();
    });
  }
  function pump() { while (running < PARALLEL && waiting.length) waiting.shift()(); }
  function addFiles(files) {
    Array.prototype.forEach.call(files, function (f) {
      if (!/^image\//.test(f.type) && f.type !== 'application/pdf') return;
      if (f.size > 20 * 1024 * 1024) { alert(f.name + ': file lớn hơn 20 MB, chụp lại nhẹ hơn.'); return; }
      new Card(f).read();
    });
    updateBulk();
  }
  function updateBulk() { $('#downloadAll').hidden = cards.length < 2; }

  var drop = $('#drop');
  $('#file').addEventListener('change', function (e) { addFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });
  document.addEventListener('paste', function (e) { if (e.clipboardData && e.clipboardData.files.length) addFiles(e.clipboardData.files); });
  $('#addManual').addEventListener('click', function () { new Card(null); updateBulk(); });
  $('#downloadAll').addEventListener('click', function () {
    cards.forEach(function (c, i) { setTimeout(function () { c.download(); }, i * 400); });
  });

  window.HDQR = { cards: cards, findBank: findBank }; // for tests
})();
