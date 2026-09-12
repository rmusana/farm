/**
 * Alerts API – engine, rules, list, resolve, email notifications
 */
var Alerts = {
  handle: function (body) {
    var action = (body.action || 'list').toString();
    if (action === 'list') return this.list(body);
    if (action === 'resolve') return this.resolve(body);
    if (action === 'acknowledge') return this.acknowledge(body);
    if (action === 'run') return this.runEngine(body);
    if (action === 'create') return this.create(body);
    return { success: false, error: 'Unknown alerts action' };
  },

  projectId: function (body) {
    return body.projectId || 'LUK54';
  },

  list: function (body) {
    var pid = this.projectId(body);
    try { this.runEngine(body); } catch (e) {}
    var rows = this.rows(pid);
    var status = body.status;
    if (status && status !== 'all') {
      rows = rows.filter(function (r) { return r.Status === status; });
    } else if (!status) {
      rows = rows.filter(function (r) { return r.Status === 'Open' || r.Status === 'Acknowledged'; });
    }
    // Role-based filtering: Investor sees finance/reporting/production, Ops sees operational
    var role = body._user ? Auth.normalizeRole(body._user.Role || body._user.role) : 'Viewer';
    if (role === 'Investor') {
      var allowed = { Finance: 1, Reporting: 1, Production: 1 };
      rows = rows.filter(function (r) { return allowed[r.Type]; });
    } else if (role === 'OperationsManager') {
      var allowedOps = { Inventory: 1, Vaccination: 1, Mortality: 1, Production: 1, Operations: 1, System: 1 };
      rows = rows.filter(function (r) { return allowedOps[r.Type]; });
    }
    rows.sort(function (a, b) {
      var order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      var pa = order[a.Priority] != null ? order[a.Priority] : 9;
      var pb = order[b.Priority] != null ? order[b.Priority] : 9;
      if (pa !== pb) return pa - pb;
      return new Date(b.CreatedAt) - new Date(a.CreatedAt);
    });
    return { success: true, data: rows };
  },

  resolve: function (body) {
    Utils.requireFields(body, ['alertId']);
    return this.updateStatus(body.alertId, 'Resolved', body._user);
  },

  acknowledge: function (body) {
    Utils.requireFields(body, ['alertId']);
    return this.updateStatus(body.alertId, 'Acknowledged', body._user);
  },

  updateStatus: function (alertId, status, user) {
    var sheet = getSheet('Alerts');
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: false, error: 'Alert not found' };
    var headers = data[0];
    var idCol = headers.indexOf('AlertID');
    var statusCol = headers.indexOf('Status');
    var resolvedCol = headers.indexOf('ResolvedAt');
    var byCol = headers.indexOf('ResolvedBy');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(alertId)) {
        if (statusCol >= 0) sheet.getRange(i + 1, statusCol + 1).setValue(status);
        if (status === 'Resolved') {
          if (resolvedCol >= 0) sheet.getRange(i + 1, resolvedCol + 1).setValue(Utils.nowISO());
          if (byCol >= 0) sheet.getRange(i + 1, byCol + 1).setValue((user && user.Email) || '');
        }
        return { success: true, message: 'Alert ' + status.toLowerCase() };
      }
    }
    return { success: false, error: 'Alert not found' };
  },

  create: function (body) {
    return this.createAlert(
      this.projectId(body),
      body.priority || 'Medium',
      body.title || 'Alert',
      body.reason || '',
      body.suggestedAction || '',
      body.deadline || '',
      body.type || 'Manual'
    );
  },

  createAlert: function (pid, priority, title, reason, action, deadline, type) {
    var sheet = getSheet('Alerts');
    this.ensureHeaders(sheet);
    // Dedupe: skip if open alert with same title exists in last 7 days
    var existing = this.rows(pid).filter(function (r) {
      return r.Status === 'Open' && r.Title === title;
    });
    if (existing.length) {
      return { success: true, data: existing[0], deduped: true };
    }

    var id = Utils.generateId('al');
    var row = {
      AlertID: id,
      ProjectID: pid,
      Type: type || 'System',
      Priority: priority,
      Title: title,
      Reason: reason,
      SuggestedAction: action,
      Deadline: deadline || '',
      Status: 'Open',
      CreatedAt: Utils.nowISO(),
      ResolvedAt: '',
      ResolvedBy: ''
    };
    Utils.appendObject(sheet, row);

    // Email on Critical
    if (priority === 'Critical') {
      try { this.notifyEmail(row); } catch (e) {}
    }
    return { success: true, data: row };
  },

  /* ── Engine: evaluate all rules ───────────────────────── */

  runEngine: function (body) {
    var pid = this.projectId(body);
    var created = [];

    created = created.concat(this.ruleVaccinationDue(pid));
    created = created.concat(this.ruleLowFeed(pid));
    created = created.concat(this.ruleLowInventory(pid));
    created = created.concat(this.ruleAbnormalMortality(pid));
    created = created.concat(this.ruleLowProduction(pid));
    created = created.concat(this.ruleMissingDaily(pid));
    created = created.concat(this.ruleFundingRequired(pid));
    created = created.concat(this.ruleStatementDue(pid));
    created = created.concat(this.ruleCommercialApproaching(pid));

    return { success: true, data: { evaluated: true, created: created.length, alerts: created } };
  },

  ruleVaccinationDue: function (pid) {
    var out = [];
    try {
      var schedule = this.sheetRows('VaccinationSchedule', pid);
      var today = new Date();
      schedule.forEach(function (s) {
        if (s.Status === 'Completed' || s.Status === 'Recurring') return;
        if (!s.PlannedDate) return;
        var planned = new Date(s.PlannedDate);
        var days = Math.ceil((planned - today) / 86400000);
        if (days <= 3 && days >= -7) {
          var priority = days < 0 ? 'High' : (days <= 1 ? 'High' : 'Medium');
          var res = Alerts.createAlert(
            pid, priority,
            'Vaccination due: ' + s.Vaccine,
            'Scheduled for week ' + s.Week + ' on ' + s.PlannedDate + (days < 0 ? ' (overdue)' : ' (in ' + days + ' day(s))'),
            'Log vaccination under Health & Vaccination',
            s.PlannedDate,
            'Vaccination'
          );
          if (res.data && !res.deduped) out.push(res.data);
        }
      });
    } catch (e) {}
    return out;
  },

  ruleLowFeed: function (pid) {
    var out = [];
    try {
      var inv = this.sheetRows('FeedInventory', pid);
      var daily = this.sheetRows('DailyProduction', pid).slice(-7);
      var consumed = 0;
      daily.forEach(function (r) {
        consumed += Utils.toNumber(r.FeedBrandKg) + Utils.toNumber(r.FeedHendrixKg) +
          Utils.toNumber(r.FeedLimeKg) + Utils.toNumber(r.FeedSoyaKg) +
          Utils.toNumber(r.FeedSunflowerKg) + Utils.toNumber(r.FeedBrokenKg);
      });
      var avgDaily = daily.length ? consumed / daily.length : 0;
      inv.forEach(function (item) {
        var stock = Utils.toNumber(item.ClosingStock);
        var days = avgDaily > 0 ? stock / avgDaily : 999;
        if (stock > 0 && days < 5) {
          var res = Alerts.createAlert(
            pid, 'Critical',
            'Low feed stock: ' + item.Product,
            item.Product + ' has ~' + Math.round(days) + ' days remaining (' + stock + ' kg)',
            'Record a feed purchase immediately',
            Utils.nowISO().slice(0, 10),
            'Inventory'
          );
          if (res.data && !res.deduped) out.push(res.data);
        } else if (stock > 0 && days < 14) {
          var res2 = Alerts.createAlert(
            pid, 'High',
            'Feed reorder soon: ' + item.Product,
            item.Product + ' covers about ' + Math.round(days) + ' days',
            'Plan feed purchase within the week',
            '',
            'Inventory'
          );
          if (res2.data && !res2.deduped) out.push(res2.data);
        }
      });
    } catch (e) {}
    return out;
  },

  ruleLowInventory: function (pid) {
    var out = [];
    try {
      var items = this.sheetRows('Inventory', pid);
      items.forEach(function (item) {
        var qty = Utils.toNumber(item.Quantity);
        var reorder = Utils.toNumber(item.ReorderLevel);
        if (reorder > 0 && qty <= reorder) {
          var res = Alerts.createAlert(
            pid, 'High',
            'Low inventory: ' + item.Name,
            item.Name + ' is at ' + qty + ' ' + (item.Unit || '') + ' (reorder level ' + reorder + ')',
            'Adjust or purchase stock',
            '',
            'Inventory'
          );
          if (res.data && !res.deduped) out.push(res.data);
        }
      });
    } catch (e) {}
    return out;
  },

  ruleAbnormalMortality: function (pid) {
    var out = [];
    try {
      var daily = this.sheetRows('DailyProduction', pid);
      daily.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });
      var recent = daily.slice(0, 2);
      var criticalDays = 0;
      recent.forEach(function (r) {
        var opening = Utils.toNumber(r.OpeningBirds);
        var mort = Utils.toNumber(r.Mortality);
        if (opening > 0 && mort / opening > 0.01) criticalDays++;
      });
      if (criticalDays >= 1) {
        var r0 = recent[0];
        var res = Alerts.createAlert(
          pid, 'Critical',
          'Abnormal mortality',
          (r0.Mortality || 0) + ' birds lost on ' + r0.Date +
            (Utils.toNumber(r0.OpeningBirds) > 0
              ? ' (' + Math.round(Utils.toNumber(r0.Mortality) / Utils.toNumber(r0.OpeningBirds) * 1000) / 10 + '%)'
              : ''),
          'Investigate causes, review biosecurity, notify Investment Partner',
          r0.Date,
          'Mortality'
        );
        if (res.data && !res.deduped) out.push(res.data);
      }
    } catch (e) {}
    return out;
  },

  ruleLowProduction: function (pid) {
    var out = [];
    try {
      var daily = this.sheetRows('DailyProduction', pid);
      daily.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });
      var lowStreak = 0;
      for (var i = 0; i < Math.min(28, daily.length); i++) {
        var r = daily[i];
        var birds = Utils.toNumber(r.ClosingBirds) || Utils.toNumber(r.OpeningBirds);
        var eggs = Utils.toNumber(r.EggsCollected);
        var pct = birds > 0 ? (eggs / birds) * 100 : 100;
        if (pct < 80) lowStreak++;
        else break;
      }
      // Approximate weeks
      var lowWeeks = Math.floor(lowStreak / 7);
      if (lowWeeks >= 4) {
        var res = Alerts.createAlert(
          pid, 'Critical',
          'Production below off-lay threshold',
          'Production has been below 80% for approximately ' + lowWeeks + ' consecutive weeks',
          'Joint review recommended — production has been below threshold',
          '',
          'Production'
        );
        if (res.data && !res.deduped) out.push(res.data);
      } else if (lowStreak >= 7) {
        var res2 = Alerts.createAlert(
          pid, 'High',
          'Production below target',
          'Laying rate has been below 80% for ' + lowStreak + ' consecutive days',
          'Review flock health, feed and environment',
          '',
          'Production'
        );
        if (res2.data && !res2.deduped) out.push(res2.data);
      }
    } catch (e) {}
    return out;
  },

  ruleMissingDaily: function (pid) {
    var out = [];
    try {
      var daily = this.sheetRows('DailyProduction', pid);
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      var yStr = yesterday.toISOString().slice(0, 10);
      var found = daily.some(function (r) { return String(r.Date).indexOf(yStr) === 0; });
      // Only alert if flock has started (any production exists)
      if (daily.length > 0 && !found) {
        var res = Alerts.createAlert(
          pid, 'Medium',
          'Missing daily production entry',
          'No production log found for ' + yStr,
          'Complete the Daily Log for yesterday',
          yStr,
          'Operations'
        );
        if (res.data && !res.deduped) out.push(res.data);
      }
    } catch (e) {}
    return out;
  },

  ruleFundingRequired: function (pid) {
    var out = [];
    try {
      var summary = Finance.financialSummary({ projectId: pid }).data;
      if (summary.outstandingFunding > 1000000) {
        var res = Alerts.createAlert(
          pid, 'High',
          'Funding required',
          'Outstanding funding requirement is UGX ' + Math.round(summary.outstandingFunding).toLocaleString(),
          'Review capital plan with Investment Partner',
          '',
          'Finance'
        );
        if (res.data && !res.deduped) out.push(res.data);
      }
      var forecast = Finance.forecast({ projectId: pid, days: 14 }).data;
      if (forecast.fundingRequired > 500000) {
        var res2 = Alerts.createAlert(
          pid, 'High',
          'Funding may be required within 2 weeks',
          'Projected shortfall of UGX ' + Math.round(forecast.fundingRequired).toLocaleString() + ' over 14 days',
          'Plan capital contribution',
          '',
          'Finance'
        );
        if (res2.data && !res2.deduped) out.push(res2.data);
      }
    } catch (e) {}
    return out;
  },

  ruleStatementDue: function (pid) {
    var out = [];
    try {
      var today = new Date();
      var day = today.getDate();
      // Statement due by 10th of following month for previous month
      if (day >= 1 && day <= 10) {
        var prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        var period = prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');
        var history = this.sheetRows('MonthlyInvestmentStatements', pid);
        var done = history.some(function (h) {
          return h.Month === period && (h.Type === 'monthly_statement' || !h.Type);
        });
        if (!done) {
          var priority = day >= 10 ? 'Critical' : (day >= 8 ? 'High' : 'Medium');
          var res = Alerts.createAlert(
            pid, priority,
            day >= 10 ? 'Monthly statement overdue' : 'Monthly statement due',
            'Investment Statement for ' + period + (day >= 10 ? ' is overdue' : ' is due by the 10th'),
            'Generate and send Monthly Investment Statement from Reports',
            today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-10',
            'Reporting'
          );
          if (res.data && !res.deduped) out.push(res.data);
        }
      }
    } catch (e) {}
    return out;
  },

  ruleCommercialApproaching: function (pid) {
    var out = [];
    try {
      var projects = this.sheetRows('Projects', pid);
      var p = projects[0];
      if (p && p.CommercialProductionDate) return out;
      var start = new Date((p && p.StartDate) || '2026-06-01');
      var week = Math.ceil((new Date() - start) / (7 * 86400000));
      if (week >= 22 && week < 25) {
        var res = Alerts.createAlert(
          pid, 'Medium',
          'Commercial production approaching',
          'Flock is in week ' + week + '. Commercial production expected at week 25 or 85% laying',
          'Monitor production percentage daily',
          '',
          'Production'
        );
        if (res.data && !res.deduped) out.push(res.data);
      }
    } catch (e) {}
    return out;
  },

  notifyEmail: function (alert) {
    // Send to configured investor emails – read from Settings or hardcoded bootstrap
    var recipients = ['robert@luk54.com', 'moses@luk54.com'];
    try {
      var settings = Utils.sheetToObjects(getSheet('Settings'));
      var emailRow = settings.filter(function (s) { return s.Key === 'alert_emails'; })[0];
      if (emailRow && emailRow.Value) {
        recipients = String(emailRow.Value).split(',').map(function (s) { return s.trim(); });
      }
    } catch (e) {}

    var subject = '[RMUSANA ' + alert.Priority + '] ' + alert.Title;
    var body = '<p><strong>' + alert.Title + '</strong></p>' +
      '<p>' + alert.Reason + '</p>' +
      '<p><em>Suggested action:</em> ' + alert.SuggestedAction + '</p>' +
      (alert.Deadline ? '<p>Deadline: ' + alert.Deadline + '</p>' : '') +
      '<p style="color:#64748b;font-size:12px">RMUSANA Alert Engine · LUK54 Flock</p>';

    recipients.forEach(function (to) {
      if (!to) return;
      try {
        MailApp.sendEmail({ to: to, subject: subject, htmlBody: body });
      } catch (e) {}
    });
  },

  rows: function (pid) {
    return this.sheetRows('Alerts', pid);
  },

  sheetRows: function (name, pid) {
    try {
      var sheet = getSheet(name);
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
      sheet.appendRow(['AlertID', 'ProjectID', 'Type', 'Priority', 'Title', 'Reason', 'SuggestedAction', 'Deadline', 'Status', 'CreatedAt', 'ResolvedAt', 'ResolvedBy']);
    }
  }
};
