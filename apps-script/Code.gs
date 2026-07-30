/**
 * RMUSANA – Google Apps Script entry point
 * Web App doGet / doPost router
 *
 * Deploy as Web App:
 *  - Execute as: Me
 *  - Who has access: Anyone (or domain)
 * Then set SPREADSHEET_ID and paste the Web App URL into window.RMUSANA_API_URL
 */

var SPREADSHEET_ID = ''; // Set after creating the Google Sheet
var DRIVE_ROOT_FOLDER_ID = ''; // Set after creating Drive folder

function doGet(e) {
  return jsonResponse({
    success: true,
    message: 'RMUSANA API is online',
    version: '1.0'
  });
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    // Extract Bearer token from header if present
    var token = null;
    if (e && e.parameter && e.parameter.token) {
      token = e.parameter.token;
    }
    // Apps Script does not expose custom headers easily on web apps;
    // frontend also sends token in body
    if (body.token) token = body.token;
    if (!token && body.Authorization) {
      token = String(body.Authorization).replace(/^Bearer\s+/i, '');
    }
    // Parse from request headers when available (some deployments)
    try {
      if (e && e.postData) {
        // no standard header map – rely on body
      }
    } catch (ignore) {}

    if (token) body.token = token;

    var module = (body.module || '').toString().toLowerCase();
    var path = (body.path || '').toString().toLowerCase();
    var result;

    if (module === 'auth' || path.indexOf('auth') >= 0) {
      result = Auth.handle(body);
    } else if (module === 'dashboard' || path.indexOf('dashboard') >= 0) {
      result = requireAuthThen(body, function () { return Dashboard.handle(body); });
    } else if (module === 'operations' || path.indexOf('operations') >= 0) {
      result = requireAuthThen(body, function () { return Operations.handle(body); });
    } else if (module === 'finance' || path.indexOf('finance') >= 0) {
      result = requireAuthThen(body, function () { return Finance.handle(body); });
    } else if (module === 'reports' || path.indexOf('reports') >= 0) {
      result = requireAuthThen(body, function () { return Reports.handle(body); });
    } else if (module === 'alerts' || path.indexOf('alerts') >= 0) {
      result = requireAuthThen(body, function () { return Alerts.handle(body); });
    } else if (module === 'documents' || module === 'drive' || path.indexOf('document') >= 0) {
      result = requireAuthThen(body, function () { return DriveModule.handle(body); });
    } else if (module === 'settings' || path.indexOf('settings') >= 0) {
      result = requireAuthThen(body, function () { return Settings.handle(body); });
    } else {
      result = { success: true, message: 'RMUSANA API ready', received: Object.keys(body) };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, error: err.message || String(err) });
  }
}

function requireAuthThen(body, fn) {
  var action = (body.action || '').toString();
  // Allow unauthenticated only for explicit public actions (none currently for these modules)
  var session = Auth.validateToken(body.token);
  if (!session) {
    return { success: false, error: 'Authentication required', status: 401 };
  }
  body._session = session;
  body._user = Auth.findUserById(session.userId);
  return fn();
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  if (!SPREADSHEET_ID) {
    throw new Error('SPREADSHEET_ID is not configured');
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(name) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

/**
 * One-time setup: create Users sheet and seed accounts.
 * Run from the Apps Script editor.
 */
function setupAuth() {
  return Auth.seedUsers();
}
