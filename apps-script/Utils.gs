/**
 * Shared utilities for Apps Script
 */
var Utils = {
  generateId: function (prefix) {
    var ts = new Date().getTime().toString(36);
    var rand = Math.random().toString(36).slice(2, 8);
    return (prefix || 'id') + '_' + ts + rand;
  },

  nowISO: function () {
    return new Date().toISOString();
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
    if (sheet.getLastRow() === 0 && headers) {
      sheet.appendRow(headers);
    }
    var hdrs = headers || sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var row = hdrs.map(function (h) {
      return obj[h] !== undefined ? obj[h] : '';
    });
    sheet.appendRow(row);
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
