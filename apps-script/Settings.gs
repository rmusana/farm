/**
 * Settings API – project, users, budget prefs, notifications, backup
 */
var Settings = {
  handle: function (body) {
    var action = (body.action || 'get').toString();
    // Admin-only destructive / user management
    if (action === 'userCreate' || action === 'userUpdate' || action === 'userDelete' ||
        action === 'restore' || action === 'backup') {
      if (!Auth.requireRole(body, ['Administrator'])) {
        return Auth.deny('Administrator access required');
      }
    }

    if (action === 'get') return this.getAll(body);
    if (action === 'update') return this.update(body);
    if (action === 'users') return this.listUsers(body);
    if (action === 'userCreate') return this.createUser(body);
    if (action === 'userUpdate') return this.updateUser(body);
    if (action === 'backup') return this.backup(body);
    if (action === 'restore') return this.restore(body);
    return { success: false, error: 'Unknown settings action' };
  },

  getAll: function (body) {
    var map = this.readMap();
    var defaults = this.defaults();
    Object.keys(defaults).forEach(function (k) {
      if (map[k] === undefined) map[k] = defaults[k];
    });
    return { success: true, data: map };
  },

  update: function (body) {
    var key = body.key;
    var value = body.value;
    if (!key && body.settings) {
      var self = this;
      Object.keys(body.settings).forEach(function (k) {
        self.writeKey(k, body.settings[k]);
      });
      return { success: true, data: this.readMap() };
    }
    if (!key) return { success: false, error: 'key required' };
    this.writeKey(key, value);
    return { success: true, data: this.readMap() };
  },

  defaults: function () {
    return {
      project_id: 'LUK54',
      project_name: 'LUK54 Dedicated Flock',
      start_date: '2026-06-01',
      planned_birds: 2500,
      commercial_week: 25,
      commercial_laying_pct: 85,
      production_target_min: 88,
      production_target_max: 92,
      off_lay_pct: 80,
      off_lay_weeks: 4,
      statement_due_day: 10,
      investor_name: 'Robert Musana / Moses Odong',
      investor_emails: 'robert@luk54.com,moses@luk54.com',
      investor_phone: '',
      manager_name: 'Jalo Dream Farm',
      manager_emails: 'joseph@jalodreamfarm.com',
      manager_phone: '',
      alert_emails: 'robert@luk54.com,moses@luk54.com',
      email_critical: true,
      email_digest: false,
      theme_default: 'light',
      currency: 'UGX'
    };
  },

  readMap: function () {
    try {
      var sheet = getSheet('Settings');
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['Key', 'Value']);
        return {};
      }
      var rows = Utils.sheetToObjects(sheet);
      var map = {};
      rows.forEach(function (r) {
        var v = r.Value;
        try { v = JSON.parse(v); } catch (e) {}
        map[r.Key] = v;
      });
      return map;
    } catch (e) {
      return {};
    }
  },

  writeKey: function (key, value) {
    var sheet = getSheet('Settings');
    if (sheet.getLastRow() === 0) sheet.appendRow(['Key', 'Value']);
    var data = sheet.getDataRange().getValues();
    var store = typeof value === 'object' ? JSON.stringify(value) : String(value);
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(key)) {
        sheet.getRange(i + 1, 2).setValue(store);
        return;
      }
    }
    sheet.appendRow([key, store]);
  },

  listUsers: function (body) {
    try {
      var sheet = getSheet('Users');
      var rows = Utils.sheetToObjects(sheet);
      var publicRows = rows.map(function (u) {
        return {
          UserID: u.UserID,
          Email: u.Email,
          Name: u.Name,
          Role: u.Role,
          Active: u.Active,
          LastLogin: u.LastLogin
        };
      });
      return { success: true, data: publicRows };
    } catch (e) {
      return { success: true, data: Auth.bootstrapUsers().map(function (u) {
        return { UserID: u.UserID, Email: u.Email, Name: u.Name, Role: u.Role, Active: true, LastLogin: '' };
      }) };
    }
  },

  createUser: function (body) {
    Utils.requireFields(body, ['email', 'name', 'role']);
    var sheet = getSheet('Users');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['UserID', 'Email', 'Name', 'Role', 'PasswordHash', 'Active', 'GoogleSub', 'LastLogin']);
    }
    var id = Utils.generateId('usr');
    var password = body.password || 'changeme';
    var hash = Auth.hashPassword(password, id);
    sheet.appendRow([id, body.email.toLowerCase(), body.name, body.role, hash, true, '', '']);
    return { success: true, data: { UserID: id, Email: body.email, Name: body.name, Role: body.role, Active: true } };
  },

  updateUser: function (body) {
    Utils.requireFields(body, ['userId']);
    var sheet = getSheet('Users');
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: false, error: 'Not found' };
    var headers = data[0];
    var idCol = headers.indexOf('UserID');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(body.userId)) {
        if (body.name != null && headers.indexOf('Name') >= 0) sheet.getRange(i + 1, headers.indexOf('Name') + 1).setValue(body.name);
        if (body.role != null && headers.indexOf('Role') >= 0) sheet.getRange(i + 1, headers.indexOf('Role') + 1).setValue(body.role);
        if (body.active != null && headers.indexOf('Active') >= 0) sheet.getRange(i + 1, headers.indexOf('Active') + 1).setValue(body.active);
        if (body.password && headers.indexOf('PasswordHash') >= 0) {
          sheet.getRange(i + 1, headers.indexOf('PasswordHash') + 1).setValue(Auth.hashPassword(body.password, body.userId));
        }
        return { success: true, message: 'User updated' };
      }
    }
    return { success: false, error: 'User not found' };
  },

  backup: function (body) {
    var sheets = ['Projects', 'Users', 'CapitalContributions', 'Expenses', 'DailyProduction', 'Sales',
      'FeedInventory', 'FeedPurchases', 'HealthEvents', 'VaccinationSchedule', 'Inventory',
      'BudgetLines', 'RevenueAllocation', 'ProfitDistributions', 'Alerts', 'Documents',
      'StaffNotes', 'FlockEvents', 'Settings', 'MonthlyInvestmentStatements'];
    var payload = { exportedAt: Utils.nowISO(), sheets: {} };
    sheets.forEach(function (name) {
      try {
        var sheet = getSheet(name);
        payload.sheets[name] = sheet.getDataRange().getValues();
      } catch (e) {
        payload.sheets[name] = [];
      }
    });
    // Store backup file on Drive if configured
    var fileId = null;
    try {
      if (DRIVE_ROOT_FOLDER_ID) {
        var folder = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
        var blob = Utilities.newBlob(JSON.stringify(payload), 'application/json', 'rmusana_backup_' + new Date().toISOString().slice(0, 10) + '.json');
        fileId = folder.createFile(blob).getId();
      }
    } catch (e) {}
    return { success: true, data: { fileId: fileId, exportedAt: payload.exportedAt, sheetCount: Object.keys(payload.sheets).length, payload: body.includeData ? payload : undefined } };
  },

  restore: function (body) {
    if (!body.payload || !body.payload.sheets) {
      return { success: false, error: 'payload.sheets required' };
    }
    var sheets = body.payload.sheets;
    Object.keys(sheets).forEach(function (name) {
      var values = sheets[name];
      if (!values || !values.length) return;
      var sheet = getSheet(name);
      sheet.clear();
      sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    });
    return { success: true, message: 'Restore complete' };
  }
};
