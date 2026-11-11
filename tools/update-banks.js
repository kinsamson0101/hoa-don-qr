// Refresh banks.js from the public VietQR bank list. Usage: node tools/update-banks.js
const fs = require('fs');
const path = require('path');

(async () => {
  const res = await fetch('https://api.vietqr.io/v2/banks');
  const j = await res.json();
  if (j.code !== '00' || !Array.isArray(j.data)) throw new Error('Unexpected response: ' + JSON.stringify(j).slice(0, 200));
  const rows = j.data.filter((b) => /^\d{6}$/.test(b.bin)).map((b) => ({ bin: b.bin, short: b.shortName, code: b.code, name: b.name }));
  const day = new Date().toISOString().slice(0, 10);
  const body = JSON.stringify(rows, null, 2).replace(/\n/g, '\n  ');
  const out = `// Bank BIN list from https://api.vietqr.io/v2/banks, fetched ${day} (${rows.length} banks).
// Refresh: node tools/update-banks.js
(function (root) {
  var BANKS = ${body};
  if (typeof module === "object" && module.exports) module.exports = BANKS; else root.BANKS = BANKS;
})(this);
`;
  fs.writeFileSync(path.join(__dirname, '..', 'banks.js'), out);
  console.log(`banks.js: ${rows.length} banks`);
})().catch((e) => { console.error(e.message); process.exit(1); });
