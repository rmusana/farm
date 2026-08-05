/**
 * Operations API – Daily Log, Flock, Feed, Eggs, Sales, Health, Mortality, Inventory, Notes
 */
var Operations = {
  handle: function (body) {
    var action = (body.action || 'list').toString();
    var resource = (body.resource || 'daily').toString();

    if (resource === 'daily') {
      if (action === 'list') return this.listDaily(body);
      if (action === 'create') return this.createDaily(body);
      if (action === 'get') return this.getDaily(body);
    }
    if (resource === 'flock') {
      if (action === 'list') return this.listFlockEvents(body);
      if (action === 'create') return this.createFlockEvent(body);
      if (action === 'status') return this.flockStatus(body);
    }
    if (resource === 'feed') {
      if (action === 'list') return this.listFeedPurchases(body);
      if (action === 'purchase') return this.createFeedPurchase(body);
      if (action === 'inventory') return this.feedInventory(body);
      if (action === 'issue') return this.issueFeed(body);
    }
    if (resource === 'eggs' || resource === 'sales') {
      if (action === 'list') return this.listSales(body);
      if (action === 'create') return this.createSale(body);
    }
    if (resource === 'health') {
      if (action === 'list') return this.listHealth(body);
      if (action === 'create') return this.createHealth(body);
      if (action === 'schedule') return this.vaccinationSchedule(body);
    }
    if (resource === 'mortality') {
      if (action === 'list') return this.listMortality(body);
    }
    if (resource === 'inventory') {
      if (action === 'list') return this.listInventory(body);
      if (action === 'adjust') return this.adjustInventory(body);
    }
    if (resource === 'notes') {
      if (action === 'list') return this.listNotes(body);
      if (action === 'create') return this.createNote(body);
    }
    return { success: false, error: 'Unknown operations action/resource' };
  },

  projectId: function (body) {
    return body.projectId || 'LUK54';
  },

  /* ── Daily Production ─────────────────────────────────── */

  listDaily: function (body) {
    var pid = this.projectId(body);
    var rows = this.rows('DailyProduction', pid);
    rows.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });
    var limit = Utils.toNumber(body.limit) || 60;
    return { success: true, data: rows.slice(0, limit) };
  },

  getDaily: function (body) {
    var rows = this.rows('DailyProduction', this.projectId(body));
    var id = body.recordId || body.id;
    var found = rows.filter(function (r) { return r.RecordID === id; })[0];
    if (!found) return { success: false, error: 'Record not found' };
    return { success: true, data: found };
  },

  createDaily: function (body) {
    Utils.requireFields(body, ['date']);
    var pid = this.projectId(body);
    var sheet = getSheet('DailyProduction');
    this.ensureHeaders(sheet, [
      'RecordID', 'ProjectID', 'Date', 'OpeningBirds', 'Mortality', 'ClosingBirds',
      'EggsCollected', 'Breakages', 'FeedBrandKg', 'FeedHendrixKg', 'FeedLimeKg',
      'FeedSoyaKg', 'FeedSunflowerKg', 'FeedBrokenKg', 'Notes', 'DocumentIDs', 'CreatedBy', 'CreatedAt',
      'Section', 'EggsLost', 'FeedLimePowderKg', 'FeedLimestoneKg', 'FeedMaizeKg', 'FeedOthersKg', 'FeedConcentrateKg'
    ]);

    var opening = Utils.toNumber(body.openingBirds);
    var mortality = Utils.toNumber(body.mortality);
    var closing = body.closingBirds != null ? Utils.toNumber(body.closingBirds) : opening - mortality;
    if (closing < 0) throw new Error('Closing birds cannot be negative');

    var id = Utils.generateId('dp');
    var row = {
      RecordID: id,
      ProjectID: pid,
      Date: body.date,
      OpeningBirds: opening,
      Mortality: mortality,
      ClosingBirds: closing,
      EggsCollected: Utils.toNumber(body.eggsCollected),
      Breakages: Utils.toNumber(body.breakages),
      FeedBrandKg: Utils.toNumber(body.feedBrandKg),
      FeedHendrixKg: Utils.toNumber(body.feedHendrixKg || body.feedConcentrateKg),
      Section: body.section || 'Combined',
      EggsLost: Utils.toNumber(body.eggsLost),
      FeedLimePowderKg: Utils.toNumber(body.feedLimePowderKg),
      FeedLimestoneKg: Utils.toNumber(body.feedLimestoneKg),
      FeedMaizeKg: Utils.toNumber(body.feedMaizeKg),
      FeedOthersKg: Utils.toNumber(body.feedOthersKg),
      FeedConcentrateKg: Utils.toNumber(body.feedConcentrateKg || body.feedHendrixKg),
      FeedLimeKg: Utils.toNumber(body.feedLimeKg),
      FeedSoyaKg: Utils.toNumber(body.feedSoyaKg),
      FeedSunflowerKg: Utils.toNumber(body.feedSunflowerKg),
      FeedBrokenKg: Utils.toNumber(body.feedBrokenKg),
      Notes: body.notes || '',
      DocumentIDs: body.documentIds || '',
      CreatedBy: (body._user && body._user.Email) || body.createdBy || '',
      CreatedAt: Utils.nowISO()
    };

    Utils.appendObject(sheet, row);
    this.updateFeedInventoryFromIssue(pid, row);
    this.touchFlockCount(pid, closing);

    // Abnormal mortality alert threshold: >1% of opening in a day
    if (opening > 0 && mortality / opening > 0.01) {
      this.createAlert(pid, 'Critical', 'Abnormal mortality', mortality + ' birds lost on ' + body.date + ' (' + Math.round(mortality / opening * 1000) / 10 + '%)', 'Investigate causes and biosecurity', body.date);
    }

    return { success: true, data: row };
  },

  /* ── Flock ────────────────────────────────────────────── */

  listFlockEvents: function (body) {
    var rows = this.rows('FlockEvents', this.projectId(body));
    rows.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });
    return { success: true, data: rows };
  },

  createFlockEvent: function (body) {
    Utils.requireFields(body, ['date', 'eventType', 'quantity']);
    var pid = this.projectId(body);
    var sheet = getSheet('FlockEvents');
    this.ensureHeaders(sheet, ['EventID', 'ProjectID', 'Date', 'EventType', 'Quantity', 'AgeWeek', 'Notes', 'CreatedBy', 'CreatedAt']);
    var id = Utils.generateId('fe');
    var row = {
      EventID: id,
      ProjectID: pid,
      Date: body.date,
      EventType: body.eventType,
      Quantity: Utils.toNumber(body.quantity),
      AgeWeek: Utils.toNumber(body.ageWeek),
      Notes: body.notes || '',
      CreatedBy: (body._user && body._user.Email) || '',
      CreatedAt: Utils.nowISO()
    };
    Utils.appendObject(sheet, row);

    if (body.eventType === 'Stocking' || body.eventType === 'TransferIn') {
      this.adjustBirdCount(pid, Utils.toNumber(body.quantity));
    } else if (body.eventType === 'TransferOut' || body.eventType === 'OffLay') {
      this.adjustBirdCount(pid, -Utils.toNumber(body.quantity));
    }
    return { success: true, data: row };
  },

  flockStatus: function (body) {
    var pid = this.projectId(body);
    var birds = 2500;
    try {
      var projects = Utils.sheetToObjects(getSheet('Projects'));
      var p = projects.filter(function (x) { return String(x.ProjectID) === String(pid); })[0];
      if (p && p.CurrentBirds) birds = Utils.toNumber(p.CurrentBirds);
      else if (p && p.PlannedBirds) birds = Utils.toNumber(p.PlannedBirds);
    } catch (e) {}

    var daily = this.rows('DailyProduction', pid);
    daily.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });
    if (daily.length && daily[0].ClosingBirds != null) {
      birds = Utils.toNumber(daily[0].ClosingBirds);
    }

    var start = new Date('2026-06-01');
    try {
      var projects2 = Utils.sheetToObjects(getSheet('Projects'));
      var p2 = projects2.filter(function (x) { return String(x.ProjectID) === String(pid); })[0];
      if (p2 && p2.StartDate) start = new Date(p2.StartDate);
    } catch (e) {}
    var week = Math.max(1, Math.ceil((new Date() - start) / (7 * 86400000)));

    return {
      success: true,
      data: {
        projectId: pid,
        currentBirds: birds,
        plannedBirds: 2500,
        week: week,
        startDate: start.toISOString().slice(0, 10),
        lastProductionDate: daily.length ? daily[0].Date : null
      }
    };
  },

  /* ── Feed ─────────────────────────────────────────────── */

  listFeedPurchases: function (body) {
    var rows = this.rows('FeedPurchases', this.projectId(body));
    rows.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });
    return { success: true, data: rows };
  },

  createFeedPurchase: function (body) {
    Utils.requireFields(body, ['date', 'product', 'qtyKg', 'unitCost']);
    var pid = this.projectId(body);
    var sheet = getSheet('FeedPurchases');
    this.ensureHeaders(sheet, ['PurchaseID', 'ProjectID', 'Date', 'Product', 'QtyKg', 'UnitCost', 'TotalCost', 'Supplier', 'DocumentID', 'CreatedBy', 'CreatedAt']);
    var qty = Utils.toNumber(body.qtyKg);
    var unit = Utils.toNumber(body.unitCost);
    var id = Utils.generateId('fp');
    var row = {
      PurchaseID: id,
      ProjectID: pid,
      Date: body.date,
      Product: body.product,
      QtyKg: qty,
      UnitCost: unit,
      TotalCost: qty * unit,
      Supplier: body.supplier || '',
      DocumentID: body.documentId || '',
      CreatedBy: (body._user && body._user.Email) || '',
      CreatedAt: Utils.nowISO()
    };
    Utils.appendObject(sheet, row);
    this.adjustFeedStock(pid, body.product, qty, unit);
    return { success: true, data: row };
  },

  feedInventory: function (body) {
    var rows = this.rows('FeedInventory', this.projectId(body));
    if (!rows.length) {
      var products = ['Brand', 'Hendrix', 'Lime', 'Soya', 'Sunflower', 'Broken'];
      rows = products.map(function (p) {
        return { ProjectID: body.projectId || 'LUK54', Product: p, OpeningStock: 0, Purchases: 0, Consumption: 0, ClosingStock: 0, UnitCost: 0 };
      });
    }
    return { success: true, data: rows };
  },

  issueFeed: function (body) {
    // Feed issue is normally part of daily log; this allows standalone adjustment
    Utils.requireFields(body, ['product', 'qtyKg']);
    var pid = this.projectId(body);
    this.adjustFeedStock(pid, body.product, -Utils.toNumber(body.qtyKg), null);
    return { success: true, message: 'Feed issued' };
  },

  /* ── Sales / Eggs ─────────────────────────────────────── */

  listSales: function (body) {
    var rows = this.rows('Sales', this.projectId(body));
    rows.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });
    return { success: true, data: rows };
  },

  createSale: function (body) {
    // Accept trays (preferred) or legacy quantityEggs
    var trays = Utils.toNumber(body.quantityTrays);
    var qtyEggs = Utils.toNumber(body.quantityEggs);
    if (!trays && qtyEggs) trays = qtyEggs / 30;
    if (!qtyEggs && trays) qtyEggs = trays * 30;
    if (!body.date) return { success: false, error: 'date required' };
    if (!trays && !qtyEggs) return { success: false, error: 'quantityTrays or quantityEggs required' };
    if (body.unitPrice == null || body.unitPrice === '') return { success: false, error: 'unitPrice required' };

    var pid = this.projectId(body);
    var sheet = getSheet('Sales');
    // New columns appended; old columns kept for existing data
    this.ensureHeaders(sheet, [
      'SaleID', 'ProjectID', 'Date', 'Customer', 'QuantityEggs', 'UnitPrice', 'TotalRevenue',
      'PaymentStatus', 'PaymentRef', 'DocumentID', 'CreatedBy', 'CreatedAt',
      'QuantityTrays', 'SaleCategory', 'EggType', 'BreakageTraysSold', 'DamagedTraysSold', 'LostTrays', 'Notes'
    ]);
    var price = Utils.toNumber(body.unitPrice);
    // Revenue = trays × price/tray (if trays present), else eggs × price (legacy)
    var revenue = trays ? (trays * price) : (qtyEggs * price);
    var id = Utils.generateId('sl');
    var row = {
      SaleID: id,
      ProjectID: pid,
      Date: body.date,
      Customer: body.customer || '',
      QuantityEggs: qtyEggs,
      UnitPrice: price,
      TotalRevenue: revenue,
      PaymentStatus: body.paymentStatus || 'Cash',
      PaymentRef: body.paymentRef || '',
      DocumentID: body.documentId || '',
      CreatedBy: (body._user && body._user.Email) || '',
      CreatedAt: Utils.nowISO(),
      QuantityTrays: trays,
      SaleCategory: body.saleCategory || 'Eggs',
      EggType: body.eggType || '',
      BreakageTraysSold: Utils.toNumber(body.breakageTraysSold),
      DamagedTraysSold: Utils.toNumber(body.damagedTraysSold),
      LostTrays: Utils.toNumber(body.lostTrays),
      Notes: body.notes || ''
    };
    Utils.appendObject(sheet, row);
    return { success: true, data: row };
  },

  /* ── Health & Vaccination ─────────────────────────────── */

  listHealth: function (body) {
    var rows = this.rows('HealthEvents', this.projectId(body));
    rows.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });
    return { success: true, data: rows };
  },

  createHealth: function (body) {
    Utils.requireFields(body, ['date', 'type', 'product']);
    var pid = this.projectId(body);
    var sheet = getSheet('HealthEvents');
    this.ensureHeaders(sheet, ['EventID', 'ProjectID', 'Date', 'Type', 'Product', 'Week', 'Qty', 'Birds', 'NextDue', 'Notes', 'DocumentID', 'CreatedBy', 'CreatedAt']);
    var id = Utils.generateId('he');
    var row = {
      EventID: id,
      ProjectID: pid,
      Date: body.date,
      Type: body.type,
      Product: body.product,
      Week: Utils.toNumber(body.week),
      Qty: body.qty || '',
      Birds: Utils.toNumber(body.birds),
      NextDue: body.nextDue || '',
      Notes: body.notes || '',
      DocumentID: body.documentId || '',
      CreatedBy: (body._user && body._user.Email) || '',
      CreatedAt: Utils.nowISO()
    };
    Utils.appendObject(sheet, row);

    // Mark schedule item complete if week+vaccine match
    if (body.type === 'Vaccination' && body.week) {
      this.markScheduleDone(pid, body.week, body.product, body.date);
    }
    return { success: true, data: row };
  },

  vaccinationSchedule: function (body) {
    var pid = this.projectId(body);
    var sheet = getSheet('VaccinationSchedule');
    this.ensureHeaders(sheet, ['ScheduleID', 'ProjectID', 'Week', 'Vaccine', 'PlannedDate', 'ActualDate', 'Status', 'Notes']);
    var rows = this.rows('VaccinationSchedule', pid);
    if (!rows.length) {
      rows = this.seedVaccinationSchedule(pid);
    }
    return { success: true, data: rows };
  },

  seedVaccinationSchedule: function (pid) {
    var master = [
      { Week: 1, Vaccine: 'NEWCASTLE IB' },
      { Week: 2, Vaccine: 'GUMBOLO 1' },
      { Week: 3, Vaccine: 'GUMBOLO 2' },
      { Week: 4, Vaccine: 'NEWCASTLE PLAIN' },
      { Week: 6, Vaccine: 'FOWL POX' },
      { Week: 8, Vaccine: 'DEWORMING' },
      { Week: 10, Vaccine: 'DEBEAKING' },
      { Week: 12, Vaccine: 'FOWL TYPHOID' }
    ];
    var start = new Date('2026-06-01');
    try {
      var projects = Utils.sheetToObjects(getSheet('Projects'));
      var p = projects.filter(function (x) { return String(x.ProjectID) === String(pid); })[0];
      if (p && p.StartDate) start = new Date(p.StartDate);
    } catch (e) {}

    var sheet = getSheet('VaccinationSchedule');
    var out = [];
    master.forEach(function (m) {
      var planned = new Date(start.getTime() + (m.Week - 1) * 7 * 86400000);
      var row = {
        ScheduleID: Utils.generateId('vs'),
        ProjectID: pid,
        Week: m.Week,
        Vaccine: m.Vaccine,
        PlannedDate: planned.toISOString().slice(0, 10),
        ActualDate: '',
        Status: 'Pending',
        Notes: ''
      };
      Utils.appendObject(sheet, row);
      out.push(row);
    });
    // Monthly Newcastle Lasota note
    var lasota = {
      ScheduleID: Utils.generateId('vs'),
      ProjectID: pid,
      Week: 0,
      Vaccine: 'NEWCASTLE LASOTA (EVERY MONTH)',
      PlannedDate: '',
      ActualDate: '',
      Status: 'Recurring',
      Notes: 'Administer monthly after commercial production'
    };
    Utils.appendObject(sheet, lasota);
    out.push(lasota);
    return out;
  },

  markScheduleDone: function (pid, week, product, date) {
    try {
      var sheet = getSheet('VaccinationSchedule');
      var data = sheet.getDataRange().getValues();
      if (data.length < 2) return;
      var headers = data[0];
      var weekCol = headers.indexOf('Week');
      var vacCol = headers.indexOf('Vaccine');
      var actualCol = headers.indexOf('ActualDate');
      var statusCol = headers.indexOf('Status');
      var pidCol = headers.indexOf('ProjectID');
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][pidCol]) === String(pid) &&
            Number(data[i][weekCol]) === Number(week) &&
            String(data[i][vacCol]).toUpperCase().indexOf(String(product).toUpperCase().split(' ')[0]) >= 0) {
          if (actualCol >= 0) sheet.getRange(i + 1, actualCol + 1).setValue(date);
          if (statusCol >= 0) sheet.getRange(i + 1, statusCol + 1).setValue('Completed');
          break;
        }
      }
    } catch (e) {}
  },

  /* ── Mortality (derived from daily) ───────────────────── */

  listMortality: function (body) {
    var rows = this.rows('DailyProduction', this.projectId(body));
    var out = rows.filter(function (r) { return Utils.toNumber(r.Mortality) > 0; }).map(function (r) {
      return {
        Date: r.Date,
        Mortality: r.Mortality,
        OpeningBirds: r.OpeningBirds,
        ClosingBirds: r.ClosingBirds,
        Rate: r.OpeningBirds > 0 ? Math.round(Utils.toNumber(r.Mortality) / Utils.toNumber(r.OpeningBirds) * 1000) / 10 : 0,
        Notes: r.Notes,
        RecordID: r.RecordID
      };
    });
    out.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });
    return { success: true, data: out };
  },

  /* ── Inventory ────────────────────────────────────────── */

  listInventory: function (body) {
    var rows = this.rows('Inventory', this.projectId(body));
    return { success: true, data: rows };
  },

  adjustInventory: function (body) {
    Utils.requireFields(body, ['name', 'quantity', 'type']);
    var pid = this.projectId(body);
    var sheet = getSheet('Inventory');
    this.ensureHeaders(sheet, ['ItemID', 'ProjectID', 'Category', 'Name', 'Unit', 'Quantity', 'ReorderLevel', 'LastUpdated']);
    var rows = this.rows('Inventory', pid);
    var existing = rows.filter(function (r) { return r.Name === body.name; })[0];
    var qty = Utils.toNumber(body.quantity);
    if (body.type === 'Out') qty = -Math.abs(qty);
    else qty = Math.abs(qty);

    if (existing) {
      var data = sheet.getDataRange().getValues();
      var headers = data[0];
      var nameCol = headers.indexOf('Name');
      var qtyCol = headers.indexOf('Quantity');
      var updCol = headers.indexOf('LastUpdated');
      var pidCol = headers.indexOf('ProjectID');
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][nameCol]) === body.name && String(data[i][pidCol]) === String(pid)) {
          var newQty = Utils.toNumber(data[i][qtyCol]) + qty;
          sheet.getRange(i + 1, qtyCol + 1).setValue(newQty);
          if (updCol >= 0) sheet.getRange(i + 1, updCol + 1).setValue(Utils.nowISO());
          if (newQty <= Utils.toNumber(existing.ReorderLevel)) {
            this.createAlert(pid, 'High', 'Low inventory', body.name + ' is at or below reorder level (' + newQty + ')', 'Plan purchase', Utils.nowISO().slice(0, 10));
          }
          return { success: true, data: { name: body.name, quantity: newQty } };
        }
      }
    }

    var id = Utils.generateId('inv');
    var row = {
      ItemID: id,
      ProjectID: pid,
      Category: body.category || 'General',
      Name: body.name,
      Unit: body.unit || 'units',
      Quantity: Math.max(0, qty),
      ReorderLevel: Utils.toNumber(body.reorderLevel) || 0,
      LastUpdated: Utils.nowISO()
    };
    Utils.appendObject(sheet, row);
    return { success: true, data: row };
  },

  /* ── Notes ────────────────────────────────────────────── */

  listNotes: function (body) {
    var rows = this.rows('StaffNotes', this.projectId(body));
    rows.sort(function (a, b) { return new Date(b.Date || b.CreatedAt) - new Date(a.Date || a.CreatedAt); });
    return { success: true, data: rows };
  },

  createNote: function (body) {
    Utils.requireFields(body, ['content']);
    var pid = this.projectId(body);
    var sheet = getSheet('StaffNotes');
    this.ensureHeaders(sheet, ['NoteID', 'ProjectID', 'Date', 'Content', 'Category', 'CreatedBy', 'CreatedAt']);
    var id = Utils.generateId('sn');
    var row = {
      NoteID: id,
      ProjectID: pid,
      Date: body.date || Utils.nowISO().slice(0, 10),
      Content: body.content,
      Category: body.category || 'General',
      CreatedBy: (body._user && body._user.Email) || '',
      CreatedAt: Utils.nowISO()
    };
    Utils.appendObject(sheet, row);
    return { success: true, data: row };
  },

  /* ── helpers ──────────────────────────────────────────── */

  rows: function (sheetName, projectId) {
    try {
      var sheet = getSheet(sheetName);
      var all = Utils.sheetToObjects(sheet);
      if (!projectId) return all;
      return all.filter(function (r) {
        return !r.ProjectID || String(r.ProjectID) === String(projectId);
      });
    } catch (e) {
      return [];
    }
  },

  ensureHeaders: function (sheet, headers) {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      return;
    }
    // Append any missing columns without disturbing existing data
    var existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var missing = [];
    headers.forEach(function (h) {
      if (existing.indexOf(h) === -1) missing.push(h);
    });
    if (missing.length) {
      var start = sheet.getLastColumn() + 1;
      sheet.getRange(1, start, 1, start + missing.length - 1).setValues([missing]);
    }
  },

  adjustFeedStock: function (pid, product, deltaQty, unitCost) {
    var sheet = getSheet('FeedInventory');
    this.ensureHeaders(sheet, ['ItemID', 'ProjectID', 'Product', 'OpeningStock', 'Purchases', 'Consumption', 'ClosingStock', 'UnitCost', 'LastUpdated']);
    var rows = this.rows('FeedInventory', pid);
    var existing = rows.filter(function (r) { return r.Product === product; })[0];
    if (existing) {
      var data = sheet.getDataRange().getValues();
      var headers = data[0];
      var prodCol = headers.indexOf('Product');
      var closeCol = headers.indexOf('ClosingStock');
      var purchCol = headers.indexOf('Purchases');
      var consCol = headers.indexOf('Consumption');
      var costCol = headers.indexOf('UnitCost');
      var updCol = headers.indexOf('LastUpdated');
      var pidCol = headers.indexOf('ProjectID');
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][prodCol]) === product && String(data[i][pidCol]) === String(pid)) {
          var closing = Utils.toNumber(data[i][closeCol]) + deltaQty;
          sheet.getRange(i + 1, closeCol + 1).setValue(closing);
          if (deltaQty > 0 && purchCol >= 0) {
            sheet.getRange(i + 1, purchCol + 1).setValue(Utils.toNumber(data[i][purchCol]) + deltaQty);
          } else if (deltaQty < 0 && consCol >= 0) {
            sheet.getRange(i + 1, consCol + 1).setValue(Utils.toNumber(data[i][consCol]) + Math.abs(deltaQty));
          }
          if (unitCost != null && costCol >= 0) sheet.getRange(i + 1, costCol + 1).setValue(unitCost);
          if (updCol >= 0) sheet.getRange(i + 1, updCol + 1).setValue(Utils.nowISO());
          if (closing < 50) {
            this.createAlert(pid, 'High', 'Low feed stock', product + ' stock is ' + closing + ' kg', 'Schedule feed purchase', Utils.nowISO().slice(0, 10));
          }
          return;
        }
      }
    }
    var id = Utils.generateId('fi');
    Utils.appendObject(sheet, {
      ItemID: id,
      ProjectID: pid,
      Product: product,
      OpeningStock: 0,
      Purchases: deltaQty > 0 ? deltaQty : 0,
      Consumption: deltaQty < 0 ? Math.abs(deltaQty) : 0,
      ClosingStock: Math.max(0, deltaQty),
      UnitCost: unitCost || 0,
      LastUpdated: Utils.nowISO()
    });
  },

  updateFeedInventoryFromIssue: function (pid, dailyRow) {
    var map = {
      Brand: dailyRow.FeedBrandKg,
      Concentrate: dailyRow.FeedConcentrateKg || dailyRow.FeedHendrixKg,
      Hendrix: dailyRow.FeedHendrixKg, // legacy alias
      'Lime powder': dailyRow.FeedLimePowderKg,
      Limestone: dailyRow.FeedLimestoneKg,
      Lime: dailyRow.FeedLimeKg,
      Soya: dailyRow.FeedSoyaKg,
      Sunflower: dailyRow.FeedSunflowerKg,
      Broken: dailyRow.FeedBrokenKg,
      Maize: dailyRow.FeedMaizeKg,
      Others: dailyRow.FeedOthersKg
    };
    var self = this;
    Object.keys(map).forEach(function (p) {
      var q = Utils.toNumber(map[p]);
      if (q > 0) self.adjustFeedStock(pid, p, -q, null);
    });
  },

  touchFlockCount: function (pid, closing) {
    try {
      var sheet = getSheet('Projects');
      var data = sheet.getDataRange().getValues();
      if (data.length < 2) return;
      var headers = data[0];
      var idCol = headers.indexOf('ProjectID');
      var curCol = headers.indexOf('CurrentBirds');
      if (idCol < 0 || curCol < 0) return;
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) === String(pid)) {
          sheet.getRange(i + 1, curCol + 1).setValue(closing);
          break;
        }
      }
    } catch (e) {}
  },

  adjustBirdCount: function (pid, delta) {
    try {
      var status = this.flockStatus({ projectId: pid });
      var next = (status.data.currentBirds || 0) + delta;
      this.touchFlockCount(pid, Math.max(0, next));
    } catch (e) {}
  },

  createAlert: function (pid, priority, title, reason, action, deadline) {
    try {
      var sheet = getSheet('Alerts');
      this.ensureHeaders(sheet, ['AlertID', 'ProjectID', 'Type', 'Priority', 'Title', 'Reason', 'SuggestedAction', 'Deadline', 'Status', 'CreatedAt', 'ResolvedAt', 'ResolvedBy']);
      Utils.appendObject(sheet, {
        AlertID: Utils.generateId('al'),
        ProjectID: pid,
        Type: 'Operations',
        Priority: priority,
        Title: title,
        Reason: reason,
        SuggestedAction: action,
        Deadline: deadline || '',
        Status: 'Open',
        CreatedAt: Utils.nowISO(),
        ResolvedAt: '',
        ResolvedBy: ''
      });
    } catch (e) {}
  }
};
