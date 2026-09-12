/**
 * LUK54 – Google Apps Script entry point
 * Web App doGet / doPost router
 *
 * Deploy as Web App:
 *  - Execute as: Me
 *  - Who has access: Anyone
 * Then paste the Web App URL into window.RMUSANA_API_URL (js/config.js)
 */

var SPREADSHEET_ID = (function(){ try{ var v=PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'); return v || '1nWQTo151TCSdYtflQygdfyJ62V-OrBEm-Obm8tkOkME'; }catch(e){ return '1nWQTo151TCSdYtflQygdfyJ62V-OrBEm-Obm8tkOkME'; }})();
var DRIVE_ROOT_FOLDER_ID = (function(){ try{ var v=PropertiesService.getScriptProperties().getProperty('DRIVE_ROOT_FOLDER_ID'); return v || '1zyYdaZtBIJ3OX-8GK0cUJrwT2G6Sksb6'; }catch(e){ return '1zyYdaZtBIJ3OX-8GK0cUJrwT2G6Sksb6'; }})();

function doGet(e) {
  return jsonResponse({
    success: true,
    message: 'LUK54 API is online',
    version: '1.2'
  });
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    var token = null;
    if (e && e.parameter && e.parameter.token) {
      token = e.parameter.token;
    }
    if (body.token) token = body.token;
    if (!token && body.Authorization) {
      token = String(body.Authorization).replace(/^Bearer\s+/i, '');
    }
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
      result = { success: true, message: 'LUK54 API ready', received: Object.keys(body) };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, error: err.message || String(err) });
  }
}

function requireAuthThen(body, fn) {
  var session = Auth.validateToken(body.token);
  if (!session) {
    return { success: false, error: 'Authentication required', status: 401 };
  }
  body._session = session;
  body._user = Auth.findUserById(session.userId);
  if (!body._user || body._user.Active === false || body._user.Active === 'FALSE') {
    return { success: false, error: 'Account inactive or not found', status: 401 };
  }
  body._role = Auth.normalizeRole(body._user.Role || body._user.role);
  return fn();
}

/** Helper used by modules — returns deny object or null if allowed */
function requireRoles(body, roles) {
  if (!Auth.requireRole(body, roles)) {
    return Auth.deny('You do not have permission for this action');
  }
  return null;
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
 * Run from the Apps Script editor: setupAuth()
 */
function setupAuth() {
  return Auth.seedUsers();
}
function setupFarmTriggers() {
  try {
    ScriptApp.getProjectTriggers().forEach(function(t){
      if(t.getHandlerFunction()==='autoBackup' || t.getHandlerFunction()==='runAlertEngine') ScriptApp.deleteTrigger(t);
    });
  } catch(e){}
  ScriptApp.newTrigger('autoBackup').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('runAlertEngine').timeBased().everyHours(6).create();
  return { success:true, message:'Triggers: daily 02:00 backup + 6h alerts' };
}
function autoBackup(){ try{ var r=Settings.backup({}); Audit.log('AUTO_BACKUP','Drive', r.data? r.data.fileId:'', 'daily', null); }catch(e){} }
function runAlertEngine(){ try{ Alerts.runEngine({projectId:'LUK54'});}catch(e){} }
