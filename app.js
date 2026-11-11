/* global BANKS, VietQR, qrcode */
(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('hdqr.' + k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('hdqr.' + k, v); } catch (e) { /* private mode */ } },
  };

  // ---------- settings ----------
  var apiKey = $('#apiKey');
  var model = $('#model');
  var noteTpl = $('#noteTpl');
  apiKey.value = store.get('key', '');
  model.value = store.get('model', 'gemini-3.6-flash');
  noteTpl.value = store.get('tpl', noteTpl.value);
  function showKeyState() {
    var has = apiKey.value.trim().length > 0;
    $('#keyState').textContent = has ? 'AI đang bật' : 'chưa có khoá AI, gõ tay';
    $('#keyState').className = 'pill ' + (has ? 'on' : 'off');
  }
  apiKey.addEventListener('input', function () { store.set('key', apiKey.value.trim()); showKeyState(); });
  model.addEventListener('change', function () { store.set('model', model.value); });
  noteTpl.addEventListener('input', function () {
    store.set('tpl', noteTpl.value);
    cards.forEach(function (c) { if (!c.noteEdited) { c.fillNote(); c.render(); } });
  });
  showKeyState();
  if (!apiKey.value) $('#settings').open = true;

  // ---------- banks ----------
  function bankLabel(b) { return b.short + ' · ' + b.bin + ' · ' + b.name; }
  var dl = $('#bankList');
  BANKS.forEach(function (b) { var o = document.createElement('option'); o.value = bankLabel(b); dl.appendChild(o); });

  function fold(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
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
    'Bạn đọc hoá đơn / phiếu yêu cầu thanh toán của Việt Nam. Trả về JSON đúng schema.',
    'Lấy thông tin TÀI KHOẢN NHẬN TIỀN của BÊN BÁN (người bán, nhà cung cấp), không phải bên mua.',
    'bank: tên ngắn ngân hàng nhận, chọn đúng 1 tên trong danh sách: ' + BANKS.map(function (b) { return b.short; }).join(', ') + '.',
    'account: chỉ chữ số của số tài khoản. amount: tổng tiền phải thanh toán (đã gồm thuế), chỉ chữ số, đơn vị đồng.',
    'so_hd: số hoá đơn. ncc: tên ngắn bên bán, tối đa 3 từ, bỏ "Công ty TNHH/Cổ phần". mst: mã số thuế bên bán. ngay: ngày hoá đơn dd/mm/yyyy.',
    'Không thấy trường nào thì để chuỗi rỗng. Không đoán số tài khoản.',
  ].join('\n');
  var SCHEMA = {
    type: 'OBJECT',
    properties: {
      bank: { type: 'STRING' }, account: { type: 'STRING' }, holder: { type: 'STRING' }, amount: { type: 'STRING' },
      so_hd: { type: 'STRING' }, ncc: { type: 'STRING' }, mst: { type: 'STRING' }, ngay: { type: 'STRING' },
    },
    required: ['bank', 'account', 'holder', 'amount', 'so_hd', 'ncc', 'mst', 'ngay'],
  };

  function toBase64(file) {
    return new Promise(function (ok, bad) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1]); };
      r.onerror = function () { bad(r.error); };
      r.readAsDataURL(file);
    });
  }

  function readInvoice(file) {
    var key = apiKey.value.trim();
    return toBase64(file).then(function (data) {
      var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model.value) + ':generateContent';
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ inline_data: { mime_type: file.type || 'application/pdf', data: data } }, { text: PROMPT }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: SCHEMA },
        }),
      });
    }).then(function (res) {
      return res.json().then(function (j) {
        if (!res.ok) {
          var msg = (j.error && j.error.message) || ('HTTP ' + res.status);
          if (res.status === 429) msg = 'Hết lượt miễn phí trong phút này, đợi 1 phút rồi bấm Đọc lại. (' + msg + ')';
          if (res.status === 400 && /API key/i.test(msg)) msg = 'Khoá Gemini không đúng. Kiểm tra lại trong Cài đặt.';
          throw new Error(msg);
        }
        var text = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
        if (!text) throw new Error('AI không trả kết quả (có thể file không đọc được).');
        return JSON.parse(text);
      });
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
    $('.x', this.el).addEventListener('click', function () { self.el.remove(); cards.splice(cards.indexOf(self), 1); updateBulk(); });
    $('.dl', this.el).addEventListener('click', function () { self.download(); });
    var again = $('.again', this.el);
    again.hidden = !file;
    again.addEventListener('click', function () { queue = queue.then(function () { return self.read(); }); });
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
  Card.prototype.read = function () {
    var self = this;
    if (!apiKey.value.trim()) { this.status('Chưa có khoá AI: gõ tay các ô', 'warn'); return Promise.resolve(); }
    this.status('AI đang đọc…', 'busy');
    return readInvoice(this.file).then(function (d) {
      self.fill(d);
      self.status(self.payload ? 'Đã đọc · kiểm lại số TK và số tiền' : 'Đọc thiếu, gõ thêm', self.payload ? 'ok' : 'warn');
    }).catch(function (e) { self.status(e.message, 'bad'); });
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
  var queue = Promise.resolve();
  function addFiles(files) {
    Array.prototype.forEach.call(files, function (f) {
      if (!/^image\//.test(f.type) && f.type !== 'application/pdf') return;
      if (f.size > 20 * 1024 * 1024) { alert(f.name + ': file lớn hơn 20 MB, chụp lại nhẹ hơn.'); return; }
      var card = new Card(f);
      queue = queue.then(function () { return card.read(); }); // one at a time: free tier has a per-minute limit
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
