/**
 * Auth module – credential login, Google ID token verification, sessions
 * Users are stored in the Users sheet of the project spreadsheet.
 *
 * Users sheet columns:
 * UserID | Email | Name | Role | PasswordHash | Active | GoogleSub | LastLogin
 *
 * Roles: Investor | Administrator | OperationsManager (Operating Partner) | Viewer
 */
var Auth = {
  handle: function (body) {
    var action = (body.action || 'me').toString();
    if (action === 'me') return this.me(body);
    if (action === 'login') return this.login(body);
    if (action === 'changePassword') return this.changePassword(body);
    if (action === 'google') return this.googleLogin(body);
    if (action === 'logout') return this.logout(body);
    return { success: false, error: 'Unknown auth action' };
  },

  me: function (body) {
    var token = this.extractToken(body);
    if (!token) return { success: false, error: 'Not authenticated' };
    var session = this.validateToken(token);
    if (!session) return { success: false, error: 'Session expired or invalid' };
    var user = this.findUserById(session.userId);
    if (!user || user.Active === false || user.Active === 'FALSE') {
      return { success: false, error: 'User inactive or not found' };
    }
    return {
      success: true,
      data: this.publicUser(user)
    };
  },

  login: function (body) {
    var email = (body.email || '').toString().trim().toLowerCase();
    var password = (body.password || '').toString();
    if (!email || !password) {
      return { success: false, error: 'Email and password are required' };
    }
    // rate limit: 5 attempts per 15min per email
    var cache = CacheService.getScriptCache();
    var key = 'login_try_' + email;
    var tries = Number(cache.get(key) || 0);
    if (tries >= 5) return { success: false, error: 'Too many attempts. Try again in 15 minutes.' };

    var user = this.findUserByEmail(email);
    if (!user) {
      return { success: false, error: 'Invalid email or password' };
    }
    if (user.Active === false || user.Active === 'FALSE') {
      return { success: false, error: 'Account is disabled' };
    }

    var hash = this.hashPassword(password, user.UserID);
    if (hash !== String(user.PasswordHash || '')) {
      if (String(user.PasswordHash || '') !== password) {
        cache.put(key, String(tries+1), 900);
        return { success: false, error: 'Invalid email or password' };
      }
    }
    cache.remove(key);
    this.touchLastLogin(user.UserID);
    var token = this.createToken(user.UserID);
    return {
      success: true,
      data: {
        user: this.publicUser(user),
        token: token
      }
    };
  },

  googleLogin: function (body) {
    var credential = body.credential;
    if (!credential) {
      return { success: false, error: 'Missing Google credential' };
    }

    var payload = this.verifyGoogleIdToken(credential);
    if (!payload || !payload.email) {
      return { success: false, error: 'Invalid Google token' };
    }

    var email = String(payload.email).toLowerCase();
    var user = this.findUserByEmail(email);

    if (!user) {
      // Optionally match by GoogleSub
      user = this.findUserByGoogleSub(payload.sub);
    }

    if (!user) {
      return { success: false, error: 'No authorised account for this Google identity' };
    }
    if (user.Active === false || user.Active === 'FALSE') {
      return { success: false, error: 'Account is disabled' };
    }

    if (!user.GoogleSub && payload.sub) {
      this.setGoogleSub(user.UserID, payload.sub);
    }

    this.touchLastLogin(user.UserID);
    var token = this.createToken(user.UserID);
    return {
      success: true,
      data: {
        user: this.publicUser(user),
        token: token
      }
    };
  },

  logout: function (body) {
    var token = this.extractToken(body);
    if (token) this.revokeToken(token);
    return { success: true, message: 'Logged out' };
  },

  /* ── helpers ─────────────────────────────────────────── */

  extractToken: function (body) {
    if (body && body.token) return body.token;
    // Authorization header is not directly available in doPost the same way;
    // frontend also sends token in body when needed. Check Cache/Properties.
    return null;
  },

  getTokenFromRequest: function (e) {
    // Called from Code.gs if header parsing is added
    return null;
  },

  createToken: function (userId) {
    var token = Utilities.getUuid() + '.' + Utilities.base64EncodeWebSafe(userId + ':' + new Date().getTime());
    var cache = CacheService.getScriptCache();
    cache.put('sess_' + token, userId, 21600); // 6 hours
    return token;
  },

  validateToken: function (token) {
    if (!token) return null;
    var cache = CacheService.getScriptCache();
    var userId = cache.get('sess_' + token);
    if (!userId) return null;
    return { userId: userId };
  },

  revokeToken: function (token) {
    CacheService.getScriptCache().remove('sess_' + token);
  },


  changePassword: function (body) {
    var token = this.extractToken(body);
    var session = token ? this.validateToken(token) : null;
    var user = body._user || (session ? this.findUserById(session.userId) : null);
    if (!user) return { success: false, error: 'Not authenticated' };
    var current = (body.currentPassword || '').toString();
    var next = (body.newPassword || '').toString();
    if (!current || !next) return { success: false, error: 'Current and new password required' };
    if (next.length < 6) return { success: false, error: 'New password must be at least 6 characters' };
    var expectedHash = this.hashPassword(current, user.UserID);
    var stored = String(user.PasswordHash || '');
    var ok = (stored === expectedHash) || (stored === current); // hashed or legacy plain
    if (!ok) return { success: false, error: 'Current password is incorrect' };
    var sheet = getSheet('Users');
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: false, error: 'Users sheet empty. Run setupAuth first.' };
    var headers = data[0];
    var idCol = headers.indexOf('UserID');
    var hashCol = headers.indexOf('PasswordHash');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(user.UserID)) {
        sheet.getRange(i + 1, hashCol + 1).setValue(this.hashPassword(next, user.UserID));
        return { success: true, message: 'Password updated' };
      }
    }
    return { success: false, error: 'User not found in Users sheet. Run setupAuth first.' };
  },
  hashPassword: function (password, salt) {
    var raw = password + ':' + (salt || 'rmusana');
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
    return Utilities.base64Encode(digest);
  },

  publicUser: function (user) {
    return {
      id: user.UserID,
      email: user.Email,
      name: user.Name,
      role: user.Role
    };
  },

  findUserByEmail: function (email) {
    var rows = this.getUsers();
    email = email.toLowerCase();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].Email || '').toLowerCase() === email) return rows[i];
    }
    return null;
  },

  normalizeRole: function (role) {
    if (!role) return 'Viewer';
    var r = String(role).trim();
    var lower = r.toLowerCase();
    if (lower === 'administrator' || lower === 'admin') return 'Administrator';
    if (lower === 'investor' || lower.indexOf('invest') >= 0) return 'Investor';
    if (lower === 'operationsmanager' || lower === 'operatingpartner' || lower.indexOf('operat') >= 0) return 'OperationsManager';
    if (lower === 'viewer') return 'Viewer';
    return r;
  },

  /**
   * Returns true if body._user has one of the allowed roles.
   * allowed: array of role strings e.g. ['Administrator']
   */
  requireRole: function (body, allowed) {
    var user = body._user;
    if (!user) return false;
    var role = this.normalizeRole(user.Role || user.role);
    for (var i = 0; i < allowed.length; i++) {
      if (this.normalizeRole(allowed[i]) === role) return true;
    }
    return false;
  },

  deny: function (msg) {
    return { success: false, error: msg || 'Forbidden', status: 403 };
  },

  findUserById: function (id) {
    var rows = this.getUsers();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].UserID) === String(id)) return rows[i];
    }
    return null;
  },

  findUserByGoogleSub: function (sub) {
    if (!sub) return null;
    var rows = this.getUsers();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].GoogleSub || '') === String(sub)) return rows[i];
    }
    return null;
  },

  getUsers: function () {
    try {
      var sheet = getSheet('Users');
      return Utils.sheetToObjects(sheet);
    } catch (e) {
      // Bootstrap users if sheet empty / spreadsheet not ready
      return this.bootstrapUsers();
    }
  },

  bootstrapUsers: function () {
    return [
      { UserID: 'usr_robert', Email: 'robert@luk54.com', Name: 'Investment Partner', Role: 'Investor', PasswordHash: 'investor2026', Active: true, GoogleSub: '', LastLogin: '' },
      { UserID: 'usr_moses', Email: 'moses@luk54.com', Name: 'Investment Partner', Role: 'Investor', PasswordHash: 'investor2026', Active: true, GoogleSub: '', LastLogin: '' },
      { UserID: 'usr_joseph', Email: 'joseph@jalodreamfarm.com', Name: 'Operating Partner', Role: 'OperationsManager', PasswordHash: 'ops2026', Active: true, GoogleSub: '', LastLogin: '' },
      { UserID: 'usr_admin', Email: 'admin@rmusana.com', Name: 'Administrator', Role: 'Administrator', PasswordHash: 'admin2026', Active: true, GoogleSub: '', LastLogin: '' }
    ];
  },

  touchLastLogin: function (userId) {
    try {
      var sheet = getSheet('Users');
      var data = sheet.getDataRange().getValues();
      if (data.length < 2) return;
      var headers = data[0];
      var idCol = headers.indexOf('UserID');
      var loginCol = headers.indexOf('LastLogin');
      if (idCol < 0 || loginCol < 0) return;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(userId)) {
          sheet.getRange(i + 1, loginCol + 1).setValue(new Date().toISOString());
          break;
        }
      }
    } catch (e) { /* ignore */ }
  },

  setGoogleSub: function (userId, sub) {
    try {
      var sheet = getSheet('Users');
      var data = sheet.getDataRange().getValues();
      if (data.length < 2) return;
      var headers = data[0];
      var idCol = headers.indexOf('UserID');
      var subCol = headers.indexOf('GoogleSub');
      if (idCol < 0 || subCol < 0) return;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(userId)) {
          sheet.getRange(i + 1, subCol + 1).setValue(sub);
          break;
        }
      }
    } catch (e) { /* ignore */ }
  },

  /**
   * Verify Google ID token via tokeninfo endpoint.
   * For production, prefer full JWT verification with Google certs.
   */
  verifyGoogleIdToken: function (credential) {
    try {
      var url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential);
      var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) return null;
      var data = JSON.parse(resp.getContentText());
      if (!data.email_verified && data.email_verified !== 'true') return null;
      return data;
    } catch (e) {
      return null;
    }
  },

  /**
   * Seed Users sheet with bootstrap accounts (call once from setup).
   */
  seedUsers: function () {
    var sheet = getSheet('Users');
    sheet.clear();
    var headers = ['UserID', 'Email', 'Name', 'Role', 'PasswordHash', 'Active', 'GoogleSub', 'LastLogin'];
    sheet.appendRow(headers);
    var users = this.bootstrapUsers();
    users.forEach(function (u) {
      // Store SHA-256 hash for production
      var hash = Auth.hashPassword(u.PasswordHash, u.UserID);
      sheet.appendRow([u.UserID, u.Email, u.Name, u.Role, hash, true, '', '']);
    });
    return { success: true, count: users.length };
  }
};
