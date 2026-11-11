const test = require('node:test');
const assert = require('node:assert');
const { PNG } = require('pngjs');
const jsQR = require('jsqr');
const VietQR = require('../vietqr.js');
const BANKS = require('../banks.js');
const qrcode = require('../vendor/qrcode.js');
const { QRPay } = require('vietnam-qr-pay');

// Known-good strings published in the vietnam-qr-pay README (independent implementation, MIT).
const KNOWN = [
  {
    in: { bin: '970416', account: '257678859' },
    out: '00020101021138530010A0000007270123000697041601092576788590208QRIBFTTA53037045802VN6304AE9F',
  },
  {
    in: { bin: '970416', account: '257678859', amount: '10000', note: 'Chuyen tien' },
    out: '00020101021238530010A0000007270123000697041601092576788590208QRIBFTTA53037045405100005802VN62150811Chuyen tien630453E6',
  },
  {
    in: { bin: '970416', account: '257678859', amount: 999999, note: 'Cam on nhe' },
    out: '00020101021238530010A0000007270123000697041601092576788590208QRIBFTTA530370454069999995802VN62140810Cam on nhe6304E786',
  },
];

test('matches published known-good VietQR strings', () => {
  for (const k of KNOWN) assert.strictEqual(VietQR.build(k.in), k.out);
});

test('CRC verifies on known strings and fails when a digit changes', () => {
  for (const k of KNOWN) {
    assert.ok(VietQR.verifyCrc(k.out));
    assert.ok(!VietQR.verifyCrc(k.out.replace('257678859', '257678858')));
  }
});

test('agrees with vietnam-qr-pay on random inputs', () => {
  const notes = ['TT HD 0001234', 'Thanh toan hoa don 12/11', 'CK cong ty ABC', ''];
  for (let i = 0; i < 200; i++) {
    const bank = BANKS[i % BANKS.length];
    const account = String(10 ** 9 + ((i * 7919) % 10 ** 9));
    const amount = i % 5 === 0 ? '' : String(1000 + i * 12345);
    const note = notes[i % notes.length];
    const ours = VietQR.build({ bin: bank.bin, account, amount, note });
    const theirs = QRPay.initVietQR({ bankBin: bank.bin, bankNumber: account, amount: amount || undefined, purpose: note || undefined }).build();
    assert.strictEqual(ours, theirs, `bank ${bank.short} amount ${amount} note "${note}"`);
  }
});

test('Vietnamese note is turned into plain ASCII', () => {
  assert.strictEqual(VietQR.cleanNote('Thanh toán hoá đơn số 12/11 – Công ty Đông Á!'), 'Thanh toan hoa don so 12/11 - Cong ty Dong A');
  assert.strictEqual(VietQR.cleanAmount('1.250.000 ₫'), '1250000');
});

test('rejects bad bank or account', () => {
  assert.throws(() => VietQR.build({ bin: '97041', account: '123' }));
  assert.throws(() => VietQR.build({ bin: '970416', account: '' }));
});

test('bank list has unique 6-digit BINs incl. the big four', () => {
  const bins = BANKS.map((b) => b.bin);
  assert.ok(bins.every((b) => /^\d{6}$/.test(b)));
  for (const [short, bin] of [['Vietcombank', '970436'], ['VietinBank', '970415'], ['BIDV', '970418'], ['Agribank', '970405']]) {
    assert.strictEqual(BANKS.find((b) => b.short === short).bin, bin);
  }
});

// Render with the same QR library the page uses, rasterise, decode with jsQR, parse fields back.
function renderToPng(text, scale = 6, margin = 4) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const size = (n + margin * 2) * scale;
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / scale) - margin;
      const my = Math.floor(y / scale) - margin;
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && qr.isDark(my, mx);
      const o = (y * size + x) * 4;
      png.data[o] = png.data[o + 1] = png.data[o + 2] = dark ? 0 : 255;
      png.data[o + 3] = 255;
    }
  }
  return png;
}

test('rendered QR decodes back to the same payload with correct fields', () => {
  const payload = VietQR.build({ bin: '970436', account: '0011001234567', amount: '1.250.000', note: 'TT HD 0001234 Cong ty ABC' });
  const png = renderToPng(payload);
  const hit = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.ok(hit, 'QR must decode');
  assert.strictEqual(hit.data, payload);
  assert.ok(VietQR.verifyCrc(hit.data));
  const f = VietQR.parse(hit.data);
  const m = VietQR.parse(f['38']);
  const b = VietQR.parse(m['01']);
  assert.deepStrictEqual(
    { guid: m['00'], bin: b['00'], account: b['01'], service: m['02'], currency: f['53'], amount: f['54'], country: f['58'], note: VietQR.parse(f['62'])['08'] },
    { guid: 'A000000727', bin: '970436', account: '0011001234567', service: 'QRIBFTTA', currency: '704', amount: '1250000', country: 'VN', note: 'TT HD 0001234 Cong ty ABC' },
  );
});
