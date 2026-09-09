/**
 * Shared utilities for Apps Script — East Africa Time (Africa/Kampala)
 */
var Utils = {
  TZ: 'Africa/Kampala',

  generateId: function (prefix) {
    var ts = new Date().getTime().toString(36);
    var rand = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '_' + ts + rand;
  },

  /** Current moment as ISO-like string in EAT (for storage/sorting) */
  nowISO: function () {
    return Utilities.formatDate(new Date(), this.TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
  },

  /** Display date: 14 Aug 2026 */
  formatDate: function (val) {
    if (val === null || val === undefined || val === '') return '—';
    var d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) {
      // plain YYYY-MM-DD
      var s = String(val);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        d = new Date(s.slice(0, 10) + 'T12:00:00+03:00');
      } else {
        return s;
      }
    }
    if (isNaN(d.getTime())) return String(val);
    return Utilities.formatDate(d, this.TZ, 'd MMM yyyy');
  },

  /** Display date+time 24h: 14 Aug 2026 10:28 */
  formatDateTime: function (val) {
    if (val === null || val === undefined || val === '') return '—';
    var d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return Utilities.formatDate(d, this.TZ, 'd MMM yyyy HH:mm');
  },

  /** Date-only YYYY-MM-DD in EAT (for form defaults / filters) */
  todayEAT: function () {
    return Utilities.formatDate(new Date(), this.TZ, 'yyyy-MM-dd');
  },

  parseDate: function (val) {
    if (!val) return null;
    var d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  },

  toNumber: function (val) {
    var n = Number(val);
    return isNaN(n) ? 0 : n;
  },

  toNumberStrict: function (val, fieldName) {
    if (val === null || val === undefined || val === '') {
      throw new Error((fieldName || 'Value') + ' is required');
    }
    var n = Number(val);
    if (isNaN(n)) throw new Error((fieldName || 'Value') + ' must be a number');
    return n;
  },

  sanitizeCell: function (val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number' || typeof val === 'boolean') return val;
    if (val instanceof Date) return val;
    var s = String(val);
    if (/^[=+\-@]/.test(s)) return "'" + s;
    return s;
  },

  sanitizeObject: function (obj) {
    if (!obj || typeof obj !== 'object') return obj;
    var out = {};
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        out[k] = this.sanitizeCell(obj[k]);
      }
    }
    return out;
  },

  sheetToObjects: function (sheet) {
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    var headers = data[0];
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        obj[headers[j]] = data[i][j];
      }
      rows.push(obj);
    }
    return rows;
  },

  appendObject: function (sheet, obj, headers) {
    // Prefer explicit headers; otherwise read row 1 and drop trailing blanks
    var hdrs = headers;
    if (!hdrs || !hdrs.length) {
      if (sheet.getLastRow() === 0) {
        throw new Error('Cannot append: sheet has no headers');
      }
      var lastCol = Math.max(sheet.getLastColumn(), 1);
      hdrs = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      while (hdrs.length && (hdrs[hdrs.length - 1] === '' || hdrs[hdrs.length - 1] == null)) {
        hdrs.pop();
      }
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(hdrs);
    }
    var row = hdrs.map(function (h) {
      if (h === '' || h == null) return '';
      return obj[h] !== undefined && obj[h] !== null ? obj[h] : '';
    });
    var clean = [];
    for (var _i = 0; _i < row.length; _i++) clean.push(Utils.sanitizeCell(row[_i]));
    sheet.appendRow(clean);
  },

  requireFields: function (body, fields) {
    var missing = [];
    fields.forEach(function (f) {
      if (body[f] === undefined || body[f] === null || body[f] === '') {
        missing.push(f);
      }
    });
    if (missing.length) {
      throw new Error('Missing required fields: ' + missing.join(', '));
    }
  }
};
