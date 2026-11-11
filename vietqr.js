// VietQR (NAPAS 247 inter-bank transfer) payload builder, EMVCo Merchant-Presented QR format.
// Pure functions, no dependencies. Works in the browser (window.VietQR) and in Node (require).
(function (root) {
  'use strict';

  var NAPAS_GUID = 'A000000727';
  var SERVICE_ACCOUNT = 'QRIBFTTA'; // transfer to bank account
  var SERVICE_CARD = 'QRIBFTTC'; // transfer to card number

  function tlv(id, value) {
    var v = String(value);
    if (v.length > 99) throw new Error('Field ' + id + ' is longer than 99 characters');
    return id + (v.length < 10 ? '0' : '') + v.length + v;
  }

  // CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection, no xor-out.
  function crc16(str) {
    var crc = 0xffff;
    for (var i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (var b = 0; b < 8; b++) {
        crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }
    return ('0000' + crc.toString(16).toUpperCase()).slice(-4);
  }

  // Bank apps accept plain ASCII in the transfer note; strip Vietnamese marks and odd symbols.
  function cleanNote(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[–—]/g, '-')
      .replace(/[^A-Za-z0-9 .,\-_/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanAccount(text) {
    return String(text || '').replace(/[\s.\-]/g, '');
  }

  function cleanAmount(value) {
    if (value === null || value === undefined || value === '') return '';
    var digits = String(value).replace(/[^\d]/g, '');
    return digits.replace(/^0+/, '');
  }

  /**
   * Build a VietQR string.
   * Point of initiation: '11' (static, payer types the amount) without amount, '12' (dynamic) with amount,
   * matching bank-app and vietnam-qr-pay output.
   * @param {{bin:string, account:string, amount?:(string|number), note?:string, card?:boolean}} p
   * @returns {string}
   */
  function build(p) {
    var bin = String(p.bin || '');
    var account = cleanAccount(p.account);
    if (!/^\d{6}$/.test(bin)) throw new Error('Bank BIN must be 6 digits');
    if (!/^[A-Za-z0-9]{1,19}$/.test(account)) throw new Error('Account number must be 1-19 letters or digits');
    var amount = cleanAmount(p.amount);
    if (amount.length > 13) throw new Error('Amount is too large');
    var note = cleanNote(p.note);
    if (note.length > 50) note = note.slice(0, 50).trim();

    var beneficiary = tlv('00', bin) + tlv('01', account);
    var merchant = tlv('00', NAPAS_GUID) + tlv('01', beneficiary) + tlv('02', p.card ? SERVICE_CARD : SERVICE_ACCOUNT);

    var out = tlv('00', '01') + tlv('01', amount ? '12' : '11') + tlv('38', merchant) + tlv('53', '704');
    if (amount) out += tlv('54', amount);
    out += tlv('58', 'VN');
    if (note) out += tlv('62', tlv('08', note));
    out += '6304';
    return out + crc16(out);
  }

  // Parse a TLV string into {id: value}. Used by tests and to explain a code to the user.
  function parse(str) {
    var out = {};
    var i = 0;
    while (i < str.length) {
      var id = str.substr(i, 2);
      var len = parseInt(str.substr(i + 2, 2), 10);
      if (isNaN(len)) throw new Error('Bad length at ' + i);
      out[id] = str.substr(i + 4, len);
      i += 4 + len;
    }
    return out;
  }

  function verifyCrc(str) {
    return str.length > 8 && str.slice(-8, -4) === '6304' && crc16(str.slice(0, -4)) === str.slice(-4);
  }

  var api = { build: build, parse: parse, crc16: crc16, verifyCrc: verifyCrc, cleanNote: cleanNote, cleanAmount: cleanAmount };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VietQR = api;
})(this);
