/**
 * AuditLog — append-only, farm-ready
 * Every money write logs who/when/what
 */
var Audit = {
  ensure: function() {
    var sheet = getSheet('AuditLog');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'ActorEmail', 'ActorRole', 'Action', 'Sheet', 'RecordID', 'Details']);
    }
  },
  log: function(action, sheetName, recordId, details, actor) {
    try {
      this.ensure();
      var sheet = getSheet('AuditLog');
      var email = actor && actor.Email ? actor.Email : (actor && actor.email ? actor.email : 'system');
      var role = actor && actor.Role ? actor.Role : (actor && actor.role ? actor.role : '');
      var line = [Utils.nowISO(), email, role, action, sheetName || '', recordId || '', details ? String(details).slice(0, 500) : '' ];
      // sanitize
      line = line.map(function(v){ return Utils.sanitizeCell(v); });
      sheet.appendRow(line);
    } catch (e) {}
  },
  withLock: function(fn) {
    var lock = LockService.getScriptLock();
    try {
      lock.tryLock(10000);
    } catch (e) {}
    try {
      return fn();
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
};
