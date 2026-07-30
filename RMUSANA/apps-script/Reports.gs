/**
 * Reports API – Monthly Investment Statement, Production, Financial, Budget, Audit, PDF, Email
 */
var Reports = {
  handle: function (body) {
    var action = (body.action || 'generate').toString();
    var type = (body.type || body.reportType || 'monthly_statement').toString();

    if (action === 'list') return this.listTypes();
    if (action === 'generate') return this.generate(body, type);
    if (action === 'email') return this.emailReport(body);
    if (action === 'history') return this.history(body);
    return { success: false, error: 'Unknown reports action' };
  },

  listTypes: function () {
    return {
      success: true,
      data: [
        { id: 'monthly_statement', name: 'Monthly Investment Statement', clause: 'Clause 10' },
        { id: 'production', name: 'Production Report', clause: null },
        { id: 'financial', name: 'Financial Report', clause: 'Clause 13' },
        { id: 'budget', name: 'Budget vs Actual', clause: null },
        { id: 'expense', name: 'Expense Report', clause: null },
        { id: 'revenue', name: 'Revenue Report', clause: null },
        { id: 'profit', name: 'Profit Distribution Report', clause: 'Clause 13(e)' },
        { id: 'inventory', name: 'Inventory Report', clause: null },
        { id: 'mortality', name: 'Mortality Report', clause: null },
        { id: 'feed', name: 'Feed Report', clause: null },
        { id: 'executive', name: 'Executive Summary', clause: null },
        { id: 'audit', name: 'Audit Report', clause: 'Clause 15' }
      ]
    };
  },

  projectId: function (body) {
    return body.projectId || 'LUK54';
  },

  generate: function (body, type) {
    var pid = this.projectId(body);
    var period = body.period || body.month || this.currentMonth();
    var data;

    switch (type) {
      case 'monthly_statement': data = this.monthlyStatement(pid, period); break;
      case 'production': data = this.productionReport(pid, period); break;
      case 'financial': data = this.financialReport(pid, period); break;
      case 'budget': data = this.budgetReport(pid); break;
      case 'expense': data = this.expenseReport(pid, period); break;
      case 'revenue': data = this.revenueReport(pid, period); break;
      case 'profit': data = this.profitReport(pid, period); break;
      case 'inventory': data = this.inventoryReport(pid); break;
      case 'mortality': data = this.mortalityReport(pid, period); break;
      case 'feed': data = this.feedReport(pid, period); break;
      case 'executive': data = this.executiveSummary(pid, period); break;
      case 'audit': data = this.auditReport(pid, period); break;
      default: return { success: false, error: 'Unknown report type: ' + type };
    }

    var html = this.renderHtml(type, data, period);
    var pdfId = null;
    try {
      pdfId = this.savePdf(pid, type, period, html);
    } catch (e) {
      // PDF optional if Drive not configured
    }

    this.recordHistory(pid, type, period, pdfId);

    return {
      success: true,
      data: {
        type: type,
        period: period,
        report: data,
        html: html,
        pdfDriveId: pdfId,
        generatedAt: Utils.nowISO()
      }
    };
  },

  currentMonth: function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  },

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

  filterPeriod: function (rows, period, dateField) {
    dateField = dateField || 'Date';
    if (!period) return rows;
    return rows.filter(function (r) {
      return String(r[dateField] || '').indexOf(period) === 0;
    });
  },

  /* ── Report builders ──────────────────────────────────── */

  monthlyStatement: function (pid, period) {
    var capital = this.rows('CapitalContributions', pid);
    var expenses = this.filterPeriod(this.rows('Expenses', pid), period);
    var daily = this.filterPeriod(this.rows('DailyProduction', pid), period);
    var sales = this.filterPeriod(this.rows('Sales', pid), period);
    var allCapital = capital;
    var periodCapital = this.filterPeriod(capital, period);

    var cumCapital = allCapital.reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0);
    var periodCap = periodCapital.reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0);
    var allExp = this.rows('Expenses', pid);
    var cumExp = allExp.reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0);
    var periodExp = expenses.reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0);

    var eggs = daily.reduce(function (s, r) { return s + Utils.toNumber(r.EggsCollected); }, 0);
    var mortality = daily.reduce(function (s, r) { return s + Utils.toNumber(r.Mortality); }, 0);
    var revenue = sales.reduce(function (s, r) { return s + Utils.toNumber(r.TotalRevenue); }, 0);

    var budget = { totalBudget: 52849172 };
    try {
      var lines = this.rows('BudgetLines', pid);
      budget.totalBudget = lines.reduce(function (s, l) { return s + Utils.toNumber(l.BudgetTotal); }, 0);
    } catch (e) {}

    return {
      title: 'Monthly Investment Statement',
      period: period,
      projectId: pid,
      contributionsReceived: periodCap,
      cumulativeContributions: cumCapital,
      expendituresIncurred: periodExp,
      cumulativeExpenditures: cumExp,
      outstandingFunding: Math.max(0, budget.totalBudget - cumCapital),
      production: { days: daily.length, eggs: eggs, mortality: mortality },
      sales: { count: sales.length, revenue: revenue },
      capitalLines: periodCapital,
      expenseLines: expenses,
      note: 'Prepared under Clause 10 of the Dedicated Flock Investment and Management Agreement. Due by the 10th of the following month.'
    };
  },

  productionReport: function (pid, period) {
    var daily = this.filterPeriod(this.rows('DailyProduction', pid), period);
    daily.sort(function (a, b) { return new Date(a.Date) - new Date(b.Date); });
    var totalEggs = 0, totalMort = 0, totalFeed = 0;
    daily.forEach(function (r) {
      totalEggs += Utils.toNumber(r.EggsCollected);
      totalMort += Utils.toNumber(r.Mortality);
      totalFeed += Utils.toNumber(r.FeedBrandKg) + Utils.toNumber(r.FeedHendrixKg) +
        Utils.toNumber(r.FeedLimeKg) + Utils.toNumber(r.FeedSoyaKg) +
        Utils.toNumber(r.FeedSunflowerKg) + Utils.toNumber(r.FeedBrokenKg);
    });
    return {
      title: 'Production Report',
      period: period,
      days: daily.length,
      totalEggs: totalEggs,
      totalMortality: totalMort,
      totalFeedKg: totalFeed,
      records: daily
    };
  },

  financialReport: function (pid, period) {
    var summary = Finance.financialSummary({ projectId: pid }).data;
    var allocation = Finance.computeAllocation({ projectId: pid, month: period }).data;
    return {
      title: 'Financial Report',
      period: period,
      summary: summary,
      allocation: allocation
    };
  },

  budgetReport: function (pid) {
    var status = Finance.budgetStatus({ projectId: pid }).data;
    return { title: 'Budget vs Actual Report', period: 'All time', budget: status };
  },

  expenseReport: function (pid, period) {
    var expenses = this.filterPeriod(this.rows('Expenses', pid), period);
    var byCat = {};
    expenses.forEach(function (r) {
      var c = r.Category || 'Other';
      byCat[c] = (byCat[c] || 0) + Utils.toNumber(r.Amount);
    });
    return {
      title: 'Expense Report',
      period: period,
      total: expenses.reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0),
      byCategory: byCat,
      lines: expenses
    };
  },

  revenueReport: function (pid, period) {
    var sales = this.filterPeriod(this.rows('Sales', pid), period);
    return {
      title: 'Revenue Report',
      period: period,
      total: sales.reduce(function (s, r) { return s + Utils.toNumber(r.TotalRevenue); }, 0),
      count: sales.length,
      lines: sales
    };
  },

  profitReport: function (pid, period) {
    var dists = this.rows('ProfitDistributions', pid);
    if (period) dists = dists.filter(function (r) { return String(r.Month).indexOf(period) === 0; });
    return {
      title: 'Profit Distribution Report',
      period: period,
      lines: dists,
      paid: dists.filter(function (d) { return d.Status === 'Paid'; }).reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0),
      pending: dists.filter(function (d) { return d.Status !== 'Paid'; }).reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0)
    };
  },

  inventoryReport: function (pid) {
    return {
      title: 'Inventory Report',
      period: 'Current',
      feed: this.rows('FeedInventory', pid),
      items: this.rows('Inventory', pid)
    };
  },

  mortalityReport: function (pid, period) {
    var daily = this.filterPeriod(this.rows('DailyProduction', pid), period);
    var lines = daily.filter(function (r) { return Utils.toNumber(r.Mortality) > 0; });
    return {
      title: 'Mortality Report',
      period: period,
      total: lines.reduce(function (s, r) { return s + Utils.toNumber(r.Mortality); }, 0),
      lines: lines
    };
  },

  feedReport: function (pid, period) {
    var purchases = this.filterPeriod(this.rows('FeedPurchases', pid), period);
    var inv = this.rows('FeedInventory', pid);
    return {
      title: 'Feed Report',
      period: period,
      purchases: purchases,
      inventory: inv,
      purchaseTotal: purchases.reduce(function (s, r) { return s + Utils.toNumber(r.TotalCost); }, 0)
    };
  },

  executiveSummary: function (pid, period) {
    var fin = Finance.financialSummary({ projectId: pid }).data;
    var prod = this.productionReport(pid, period);
    return {
      title: 'Executive Summary',
      period: period,
      financial: fin,
      production: { eggs: prod.totalEggs, mortality: prod.totalMortality, days: prod.days },
      healthNote: fin.commercialReached ? 'Commercial production active. Clause 13 allocation in force.' : 'Pre-commercial phase.'
    };
  },

  auditReport: function (pid, period) {
    var capital = this.filterPeriod(this.rows('CapitalContributions', pid), period);
    var expenses = this.filterPeriod(this.rows('Expenses', pid), period);
    var sales = this.filterPeriod(this.rows('Sales', pid), period);
    var daily = this.filterPeriod(this.rows('DailyProduction', pid), period);
    return {
      title: 'Audit Report',
      period: period,
      note: 'Prepared under Clause 15 (Audit Rights).',
      capital: capital,
      expenses: expenses,
      sales: sales,
      productionDays: daily.length
    };
  },

  /* ── HTML / PDF ───────────────────────────────────────── */

  renderHtml: function (type, data, period) {
    var css = 'body{font-family:Inter,system-ui,sans-serif;color:#0f172a;max-width:800px;margin:0 auto;padding:32px;font-size:14px;line-height:1.5}' +
      'h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}' +
      '.meta{color:#64748b;font-size:12px;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin:12px 0}' +
      'th,td{text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;font-size:13px}th{color:#475569;font-weight:600}' +
      '.kpi{display:inline-block;min-width:140px;margin:8px 16px 8px 0}.kpi .v{font-size:18px;font-weight:700}.kpi .l{font-size:11px;color:#64748b}' +
      '.foot{margin-top:32px;font-size:11px;color:#94a3b8}';

    var body = '<h1>' + (data.title || type) + '</h1>';
    body += '<div class="meta">RMUSANA · LUK54 Flock · Period: ' + period + ' · Generated: ' + new Date().toISOString().slice(0, 10) + '</div>';

    if (type === 'monthly_statement') {
      body += '<div class="kpi"><div class="l">Contributions (period)</div><div class="v">UGX ' + this.fmt(data.contributionsReceived) + '</div></div>';
      body += '<div class="kpi"><div class="l">Cumulative contributions</div><div class="v">UGX ' + this.fmt(data.cumulativeContributions) + '</div></div>';
      body += '<div class="kpi"><div class="l">Expenditures (period)</div><div class="v">UGX ' + this.fmt(data.expendituresIncurred) + '</div></div>';
      body += '<div class="kpi"><div class="l">Cumulative expenditures</div><div class="v">UGX ' + this.fmt(data.cumulativeExpenditures) + '</div></div>';
      body += '<div class="kpi"><div class="l">Outstanding funding</div><div class="v">UGX ' + this.fmt(data.outstandingFunding) + '</div></div>';
      body += '<h2>Production summary</h2><p>Days logged: ' + data.production.days + ' · Eggs: ' + this.fmt(data.production.eggs) + ' · Mortality: ' + this.fmt(data.production.mortality) + ' · Sales revenue: UGX ' + this.fmt(data.sales.revenue) + '</p>';
      body += '<h2>Capital contributions (period)</h2>' + this.tableHtml(['Date', 'Amount', 'Purpose', 'Reference'], data.capitalLines, function (r) {
        return [r.Date, 'UGX ' + Reports.fmt(r.Amount), r.Purpose || '', r.Reference || ''];
      });
      body += '<h2>Expenditures (period)</h2>' + this.tableHtml(['Date', 'Category', 'Amount', 'Supplier'], data.expenseLines, function (r) {
        return [r.Date, r.Category, 'UGX ' + Reports.fmt(r.Amount), r.Supplier || ''];
      });
      body += '<p class="foot">' + (data.note || '') + '</p>';
    } else if (type === 'executive') {
      var f = data.financial || {};
      body += '<div class="kpi"><div class="l">Investment</div><div class="v">UGX ' + this.fmt(f.totalInvestment) + '</div></div>';
      body += '<div class="kpi"><div class="l">Net profit</div><div class="v">UGX ' + this.fmt(f.netProfitToInvestor) + '</div></div>';
      body += '<div class="kpi"><div class="l">ROI</div><div class="v">' + (f.roi || 0) + '%</div></div>';
      body += '<div class="kpi"><div class="l">Eggs (period)</div><div class="v">' + this.fmt(data.production.eggs) + '</div></div>';
      body += '<p style="margin-top:16px">' + (data.healthNote || '') + '</p>';
    } else if (type === 'financial') {
      var s = data.summary || {};
      var a = data.allocation || {};
      body += '<h2>Summary</h2>';
      body += '<div class="kpi"><div class="l">Investment</div><div class="v">UGX ' + this.fmt(s.totalInvestment) + '</div></div>';
      body += '<div class="kpi"><div class="l">Expenses</div><div class="v">UGX ' + this.fmt(s.totalExpenses) + '</div></div>';
      body += '<div class="kpi"><div class="l">Revenue</div><div class="v">UGX ' + this.fmt(s.grossSalesRevenue) + '</div></div>';
      body += '<div class="kpi"><div class="l">Net profit</div><div class="v">UGX ' + this.fmt(s.netProfitToInvestor) + '</div></div>';
      body += '<h2>Clause 13 allocation (' + period + ')</h2>';
      body += '<p>Active: ' + (a.formulaActive ? 'Yes' : 'No') + '</p>';
      body += '<div class="kpi"><div class="l">Feed 50%</div><div class="v">UGX ' + this.fmt(a.feedAllocation) + '</div></div>';
      body += '<div class="kpi"><div class="l">Operator 25% GP</div><div class="v">UGX ' + this.fmt(a.operatingPartnerShare) + '</div></div>';
      body += '<div class="kpi"><div class="l">Investor net</div><div class="v">UGX ' + this.fmt(a.netProfitToInvestor) + '</div></div>';
    } else if (type === 'production') {
      body += '<div class="kpi"><div class="l">Days</div><div class="v">' + data.days + '</div></div>';
      body += '<div class="kpi"><div class="l">Eggs</div><div class="v">' + this.fmt(data.totalEggs) + '</div></div>';
      body += '<div class="kpi"><div class="l">Mortality</div><div class="v">' + this.fmt(data.totalMortality) + '</div></div>';
      body += '<div class="kpi"><div class="l">Feed (kg)</div><div class="v">' + this.fmt(data.totalFeedKg) + '</div></div>';
      body += '<h2>Daily records</h2>' + this.tableHtml(['Date', 'Birds', 'Mortality', 'Eggs', 'Feed kg'], data.records, function (r) {
        var feed = Utils.toNumber(r.FeedBrandKg) + Utils.toNumber(r.FeedHendrixKg) + Utils.toNumber(r.FeedLimeKg) + Utils.toNumber(r.FeedSoyaKg) + Utils.toNumber(r.FeedSunflowerKg) + Utils.toNumber(r.FeedBrokenKg);
        return [r.Date, r.ClosingBirds || r.OpeningBirds, r.Mortality, r.EggsCollected, feed];
      });
    } else if (type === 'budget') {
      var b = data.budget || {};
      body += '<div class="kpi"><div class="l">Budget</div><div class="v">UGX ' + this.fmt(b.totalBudget) + '</div></div>';
      body += '<div class="kpi"><div class="l">Actual</div><div class="v">UGX ' + this.fmt(b.totalActual) + '</div></div>';
      body += '<div class="kpi"><div class="l">Variance</div><div class="v">UGX ' + this.fmt(b.variance) + '</div></div>';
      body += this.tableHtml(['Category', 'Item', 'Budget', 'Actual'], b.lines || [], function (r) {
        return [r.Category, r.SubItem, 'UGX ' + Reports.fmt(r.BudgetTotal), 'UGX ' + Reports.fmt(r.ActualTotal)];
      });
    } else {
      body += '<pre style="white-space:pre-wrap;font-size:12px">' + JSON.stringify(data, null, 2) + '</pre>';
    }

    body += '<div class="foot">RMUSANA Poultry Management & Investment Platform · Confidential</div>';
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + body + '</body></html>';
  },

  tableHtml: function (headers, rows, mapFn) {
    if (!rows || !rows.length) return '<p style="color:#94a3b8">No records.</p>';
    var h = '<table><thead><tr>' + headers.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var cells = mapFn(r);
      h += '<tr>' + cells.map(function (c) { return '<td>' + (c != null ? c : '') + '</td>'; }).join('') + '</tr>';
    });
    return h + '</tbody></table>';
  },

  fmt: function (n) {
    n = Number(n) || 0;
    return n.toLocaleString('en-UG', { maximumFractionDigits: 0 });
  },

  savePdf: function (pid, type, period, html) {
    if (!DRIVE_ROOT_FOLDER_ID) return null;
    var blob = Utilities.newBlob(html, 'text/html', type + '_' + period + '.html');
    // Convert via Drive / Docs is complex; store HTML blob as file for download
    var folder = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
    var file = folder.createFile(blob);
    file.setName('RMUSANA_' + type + '_' + period + '_' + new Date().toISOString().slice(0, 10) + '.html');
    return file.getId();
  },

  recordHistory: function (pid, type, period, pdfId) {
    try {
      var sheet = getSheet('MonthlyInvestmentStatements');
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['StatementID', 'ProjectID', 'Month', 'Type', 'GeneratedDate', 'PDFDriveID', 'EmailSent', 'Status']);
      }
      sheet.appendRow([Utils.generateId('st'), pid, period, type, Utils.nowISO(), pdfId || '', false, 'Generated']);
    } catch (e) {}
  },

  history: function (body) {
    var rows = this.rows('MonthlyInvestmentStatements', this.projectId(body));
    rows.sort(function (a, b) { return new Date(b.GeneratedDate) - new Date(a.GeneratedDate); });
    return { success: true, data: rows };
  },

  emailReport: function (body) {
    var to = body.to || body.email;
    if (!to) return { success: false, error: 'Recipient email required' };
    var type = body.type || 'monthly_statement';
    var period = body.period || this.currentMonth();
    var gen = this.generate(body, type);
    if (!gen.success) return gen;

    var subject = 'RMUSANA · ' + (gen.data.report.title || type) + ' · ' + period;
    var htmlBody = gen.data.html;
    try {
      MailApp.sendEmail({
        to: to,
        subject: subject,
        htmlBody: htmlBody
      });
      return { success: true, message: 'Report emailed to ' + to };
    } catch (e) {
      return { success: false, error: 'Email failed: ' + e.message };
    }
  }
};
