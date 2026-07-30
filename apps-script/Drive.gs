/**
 * Drive / Documents API – upload, list, link, preview metadata
 */
var DriveModule = {
  handle: function (body) {
    var action = (body.action || 'list').toString();
    if (action === 'list') return this.list(body);
    if (action === 'upload') return this.upload(body);
    if (action === 'get') return this.get(body);
    if (action === 'delete') return this.remove(body);
    if (action === 'link') return this.link(body);
    return { success: false, error: 'Unknown documents action' };
  },

  projectId: function (body) {
    return body.projectId || 'LUK54';
  },

  list: function (body) {
    var pid = this.projectId(body);
    var rows = this.rows(pid);
    if (body.parentType) {
      rows = rows.filter(function (r) { return r.ParentType === body.parentType; });
    }
    if (body.parentId) {
      rows = rows.filter(function (r) { return String(r.ParentID) === String(body.parentId); });
    }
    if (body.category) {
      rows = rows.filter(function (r) {
        return String(r.ParentType || '').toLowerCase() === String(body.category).toLowerCase() ||
          String(r.FileName || '').toLowerCase().indexOf(String(body.category).toLowerCase()) >= 0;
      });
    }
    rows.sort(function (a, b) { return new Date(b.UploadedAt) - new Date(a.UploadedAt); });
    return { success: true, data: rows };
  },

  get: function (body) {
    Utils.requireFields(body, ['documentId']);
    var rows = this.rows(this.projectId(body));
    var found = rows.filter(function (r) { return r.DocumentID === body.documentId; })[0];
    if (!found) return { success: false, error: 'Document not found' };

    var url = null;
    try {
      if (found.DriveFileID) {
        var file = DriveApp.getFileById(found.DriveFileID);
        url = file.getUrl();
      }
    } catch (e) {}

    return { success: true, data: Object.assign({}, found, { url: url }) };
  },

  /**
   * Upload: body must include fileName, mimeType, contentBase64 (or driveFileId if already uploaded)
   */
  upload: function (body) {
    Utils.requireFields(body, ['fileName']);
    var pid = this.projectId(body);
    var driveFileId = body.driveFileId || null;

    if (!driveFileId && body.contentBase64) {
      driveFileId = this.saveToDrive(pid, body.fileName, body.mimeType || 'application/octet-stream', body.contentBase64, body.parentType);
    }

    var sheet = getSheet('Documents');
    this.ensureHeaders(sheet);
    var id = Utils.generateId('doc');
    var row = {
      DocumentID: id,
      ProjectID: pid,
      ParentType: body.parentType || 'General',
      ParentID: body.parentId || '',
      FileName: body.fileName,
      DriveFileID: driveFileId || '',
      MimeType: body.mimeType || '',
      UploadedBy: (body._user && body._user.Email) || body.uploadedBy || '',
      UploadedAt: Utils.nowISO()
    };
    Utils.appendObject(sheet, row);
    return { success: true, data: row };
  },

  link: function (body) {
    Utils.requireFields(body, ['documentId', 'parentType', 'parentId']);
    var sheet = getSheet('Documents');
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: false, error: 'Not found' };
    var headers = data[0];
    var idCol = headers.indexOf('DocumentID');
    var typeCol = headers.indexOf('ParentType');
    var parentCol = headers.indexOf('ParentID');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(body.documentId)) {
        if (typeCol >= 0) sheet.getRange(i + 1, typeCol + 1).setValue(body.parentType);
        if (parentCol >= 0) sheet.getRange(i + 1, parentCol + 1).setValue(body.parentId);
        return { success: true, message: 'Linked' };
      }
    }
    return { success: false, error: 'Document not found' };
  },

  remove: function (body) {
    Utils.requireFields(body, ['documentId']);
    var sheet = getSheet('Documents');
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: false, error: 'Not found' };
    var headers = data[0];
    var idCol = headers.indexOf('DocumentID');
    var driveCol = headers.indexOf('DriveFileID');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(body.documentId)) {
        var driveId = driveCol >= 0 ? data[i][driveCol] : null;
        sheet.deleteRow(i + 1);
        if (driveId) {
          try { DriveApp.getFileById(driveId).setTrashed(true); } catch (e) {}
        }
        return { success: true, message: 'Deleted' };
      }
    }
    return { success: false, error: 'Document not found' };
  },

  saveToDrive: function (pid, fileName, mimeType, contentBase64, parentType) {
    if (!DRIVE_ROOT_FOLDER_ID) {
      throw new Error('DRIVE_ROOT_FOLDER_ID is not configured');
    }
    var root = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
    var projectFolder = this.getOrCreateFolder(root, pid);
    var year = String(new Date().getFullYear());
    var month = String(new Date().getMonth() + 1).padStart(2, '0');
    var yearFolder = this.getOrCreateFolder(projectFolder, year);
    var monthFolder = this.getOrCreateFolder(yearFolder, month);
    var typeFolder = this.getOrCreateFolder(monthFolder, parentType || 'General');

    var bytes = Utilities.base64Decode(contentBase64);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = typeFolder.createFile(blob);
    return file.getId();
  },

  getOrCreateFolder: function (parent, name) {
    var folders = parent.getFoldersByName(name);
    if (folders.hasNext()) return folders.next();
    return parent.createFolder(name);
  },

  rows: function (pid) {
    try {
      var sheet = getSheet('Documents');
      var all = Utils.sheetToObjects(sheet);
      if (!pid) return all;
      return all.filter(function (r) {
        return !r.ProjectID || String(r.ProjectID) === String(pid);
      });
    } catch (e) {
      return [];
    }
  },

  ensureHeaders: function (sheet) {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['DocumentID', 'ProjectID', 'ParentType', 'ParentID', 'FileName', 'DriveFileID', 'MimeType', 'UploadedBy', 'UploadedAt']);
    }
  }
};
