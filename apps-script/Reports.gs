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
        { id: 'monthly_statement', name: 'Monthly Investment Statement' },
        { id: 'production', name: 'Production Report' },
        { id: 'financial', name: 'Financial Report' },
        { id: 'budget', name: 'Budget vs Actual' },
        { id: 'expense', name: 'Expense Report' },
        { id: 'revenue', name: 'Revenue Report' },
        { id: 'profit', name: 'Profit Distribution Report' },
        { id: 'inventory', name: 'Inventory Report' },
        { id: 'mortality', name: 'Mortality Report' },
        { id: 'feed', name: 'Feed Report' },
        { id: 'executive', name: 'Executive Summary' },
        { id: 'audit', name: 'Audit Report' }
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
      case 'weekly_section': data = this.weeklySectionReport(pid, period, body.week, body.section); break;
      case 'executive': data = this.executiveSummary(pid, period); break;
      case 'health': data = this.healthComplianceReport(pid, period); break;
      case 'capital_statement': data = this.capitalStatementReport(pid, period); break;
      case 'forecast': data = this.forecastReport(pid, period); break;
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
    // ISO week period 'YYYY-Www'
    if (/^\d{4}-W\d{2}$/.test(String(period))) {
      return rows.filter(function (r) {
        var d = Utils.dateKey(r[dateField]);
        return d !== '' && Utils.isoWeek(d) === period;
      });
    }
    return rows.filter(function (r) {
      var d = Utils.dateKey(r[dateField]);
      return d !== '' && d.indexOf(period) === 0;
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

    var budget = { totalBudget: 55120422 };
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
      note: 'Prepared monthly. Due by the 10th of the following month.'
    };
  },

  productionReport: function (pid, period) {
    var daily = this.filterPeriod(this.rows('DailyProduction', pid), period);
    daily.sort(function (a, b) { return new Date(a.Date) - new Date(b.Date); });
    var totalEggs = 0, totalMort = 0, totalFeed = 0;
    daily.forEach(function (r) {
      totalEggs += Utils.toNumber(r.EggsCollected);
      totalMort += Utils.toNumber(r.Mortality);
      var issued = Utils.toNumber(r.FeedIssuedKg);
      if (issued > 0) {
        totalFeed += issued;
      } else {
        totalFeed += Utils.toNumber(r.FeedBrandKg) + Utils.toNumber(r.FeedHendrixKg) +
          Utils.toNumber(r.FeedConcentrateKg) + Utils.toNumber(r.FeedLimePowderKg) +
          Utils.toNumber(r.FeedLimestoneKg) + Utils.toNumber(r.FeedLimeKg) +
          Utils.toNumber(r.FeedSoyaKg) + Utils.toNumber(r.FeedSunflowerKg) +
          Utils.toNumber(r.FeedBrokenKg) + Utils.toNumber(r.FeedMaizeKg) +
          Utils.toNumber(r.FeedOthersKg);
      }
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
    if (period) dists = dists.filter(function (r) { return Utils.dateKey(r.Month).indexOf(period) === 0; });
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

  healthComplianceReport: function (pid, period) {
    var sched = Operations.rows('VaccinationSchedule', pid);
    var events = this.rows('HealthEvents', pid);
    if (period) {
      sched = sched.filter(function (r) {
        return Utils.dateKey(r.PlannedDate).indexOf(period) === 0 || String(r.Status) === 'Completed';
      });
    }
    var today = Utils.dateKey(new Date());
    var lines = sched.map(function (s) {
      var planned = Utils.dateKey(s.PlannedDate);
      var done = String(s.Status) === 'Completed';
      var st = done ? 'Completed' : (planned !== '' && planned < today ? 'Overdue' : 'Pending');
      return {
        Week: s.Week, Vaccine: s.Vaccine, PlannedDate: planned,
        ActualDate: Utils.dateKey(s.ActualDate), Status: st, Notes: s.Notes || ''
      };
    });
    var inPeriod = function (d) { return Utils.dateKey(d).indexOf(period) === 0; };
    return {
      title: 'Health & Vaccination Compliance',
      period: period,
      scheduled: lines.length,
      completed: lines.filter(function (l) { return l.Status === 'Completed'; }).length,
      overdue: lines.filter(function (l) { return l.Status === 'Overdue'; }).length,
      treatments: period ? events.filter(function (e) { return inPeriod(e.Date); }).length : events.length,
      lines: lines
    };
  },

  capitalStatementReport: function (pid, period) {
    var all = this.rows('CapitalContributions', pid);
    var inPeriod = function (d) { return Utils.dateKey(d).indexOf(period) === 0; };
    var lines = period ? all.filter(function (r) { return inPeriod(r.Date); }) : all;
    var cum = all.reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0);
    var per = lines.reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0);
    var budget = 0;
    try {
      budget = this.rows('BudgetLines', pid).reduce(function (s, l) { return s + Utils.toNumber(l.BudgetTotal); }, 0);
    } catch (e) {}
    return {
      title: 'Capital Contribution Statement',
      period: period,
      received: per,
      cumulative: cum,
      budgetTotal: budget,
      outstanding: Math.max(0, budget - cum),
      lines: lines
    };
  },

  forecastReport: function (pid, period) {
    var days = 90;
    var f = Finance.forecast({ projectId: pid, days: days }).data || {};
    return {
      title: 'Forecast',
      period: period,
      horizonDays: f.horizonDays || days,
      projectedRevenue: f.projectedRevenue || 0,
      projectedExpenses: f.projectedExpenses || 0,
      projectedNetProfit: f.projectedNetProfit || 0,
      fundingRequired: f.fundingRequired || 0
    };
  },

  weeklySectionReport: function (pid, period, week, section) {
    week = Utils.toNumber(week) || 1;
    var from = '', to = '';
    var wm = String(period || '').match(/^(\d{4})-W(\d{2})$/);
    if (wm) {
      // ISO week -> Monday..Sunday range
      var wd = new Date(Date.UTC(Number(wm[1]), 0, 4));
      var fday = (wd.getUTCDay() + 6) % 7;
      wd.setUTCDate(wd.getUTCDate() - fday + 3 + (Number(wm[2]) - 1) * 7 - 3);
      var mon = new Date(wd.getTime());
      var sun = new Date(wd.getTime() + 6 * 86400000);
      var f = function (d) { return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };
      from = f(mon); to = f(sun);
    } else {
      var parts = String(period || '').split('-');
      var y = Number(parts[0]), m = Number(parts[1]);
      if (!y || !m) return { title: 'Weekly Section Report', period: period, note: 'Pick a month or week period.' };
      var dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      var pad = function (n) { return String(n).padStart(2, '0'); };
      from = y + '-' + pad(m) + '-' + pad(Math.min((week - 1) * 7 + 1, dim));
      to = y + '-' + pad(m) + '-' + pad(Math.min(week * 7, dim));
    }
    var inRange = function (d) { var k = Utils.dateKey(d); return k !== '' && k >= from && k <= to; };
    var daily = this.rows('DailyProduction', pid).filter(function (r) {
      if (!inRange(r.Date)) return false;
      if (section && section !== 'all' && String(r.Section || 'Combined') !== String(section)) return false;
      return true;
    });
    daily.sort(function (a, b) { return new Date(a.Date) - new Date(b.Date); });
    var sales = this.rows('Sales', pid).filter(function (r) { return inRange(r.Date); });
    var eggs = daily.reduce(function (s, r) { return s + Utils.toNumber(r.EggsCollected); }, 0);
    var mort = daily.reduce(function (s, r) { return s + Utils.toNumber(r.Mortality); }, 0);
    var feed = daily.reduce(function (s, r) { return s + Utils.toNumber(r.FeedIssuedKg); }, 0);
    var birds0 = daily.length ? Utils.toNumber(daily[0].OpeningBirds) : 0;
    var birds1 = daily.length ? Utils.toNumber(daily[daily.length - 1].ClosingBirds) : 0;
    var trays = daily.reduce(function (s, r) { return s + Utils.toNumber(r.EggsTrays); }, 0);
    var rev = sales.reduce(function (s, r) { return s + Utils.toNumber(r.TotalRevenue); }, 0);
    return {
      title: 'Weekly Section Report',
      period: period,
      week: week,
      section: section || 'all',
      weekStart: from,
      weekEnd: to,
      daysLogged: daily.length,
      openingBirds: birds0,
      closingBirds: birds1,
      eggsTrays: Math.round(trays * 10) / 10,
      totalMortality: mort,
      totalFeedKg: Math.round(feed * 10) / 10,
      productionPct: birds1 > 0 && eggs > 0 ? Math.round((eggs / daily.length / birds1) * 1000) / 10 : null,
      salesRevenue: rev,
      generatedAt: Utils.nowISO()
    };
  },

  executiveSummary: function (pid, period) {    var fin = Finance.financialSummary({ projectId: pid }).data;
    var prod = this.productionReport(pid, period);
    return {
      title: 'Executive Summary',
      period: period,
      financial: fin,
      production: { eggs: prod.totalEggs, mortality: prod.totalMortality, days: prod.days },
      healthNote: fin.commercialReached ? 'Commercial production active. Revenue allocation in force.' : 'Pre-commercial phase.'
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
      note: 'Prepared for audit review.',
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

    var body = '<div style="display:flex; align-items:center; gap:12px; border-bottom:2px solid #1a5c3e; padding-bottom:12px; margin-bottom:16px"><div style="width:42px;height:42px; background:#1a5c3e; color:#fff; border-radius:10px; display:grid; place-items:center; font-weight:800; font-size:16px">L</div><div><div style="font-weight:800; letter-spacing:-0.02em">LUK54 · Jalo Dream Farm</div><div style="font-size:11px; color:#64748b; letter-spacing:0.06em; text-transform:uppercase">Investment & Farm Operations · 2,500 Layers</div></div><div style="margin-left:auto; text-align:right; font-size:11px; color:#64748b">Period: ' + period + '<br/>Generated: ' + new Date().toISOString().slice(0, 10) + '</div></div>';
    body += '<h1 style="margin:12px 0 4px">' + (data.title || type) + '</h1>';
    body += '<div class="meta" style="display:none">RMUSANA · LUK54 Flock · Period: ' + period + ' · Generated: ' + new Date().toISOString().slice(0, 10) + '</div>';

    if (type === 'monthly_statement') {
      body += '<div class="kpi"><div class="l">Contributions (period)</div><div class="v">UGX ' + this.fmt(data.contributionsReceived) + '</div></div>';
      body += '<div class="kpi"><div class="l">Cumulative contributions</div><div class="v">UGX ' + this.fmt(data.cumulativeContributions) + '</div></div>';
      body += '<div class="kpi"><div class="l">Expenditures (period)</div><div class="v">UGX ' + this.fmt(data.expendituresIncurred) + '</div></div>';
      body += '<div class="kpi"><div class="l">Cumulative expenditures</div><div class="v">UGX ' + this.fmt(data.cumulativeExpenditures) + '</div></div>';
      body += '<div class="kpi"><div class="l">Outstanding funding</div><div class="v">UGX ' + this.fmt(data.outstandingFunding) + '</div></div>';
      body += '<h2>Production summary</h2><p>Days logged: ' + data.production.days + ' · Eggs: ' + this.fmt(data.production.eggs) + ' · Mortality: ' + this.fmt(data.production.mortality) + ' · Sales revenue: UGX ' + this.fmt(data.sales.revenue) + '</p>';
      body += '<h2>Capital contributions (period)</h2>' + this.tableHtml(['Date', 'Amount', 'Purpose', 'Reference'], data.capitalLines, function (r) {
        return [Utils.dateKey(r.Date), 'UGX ' + Reports.fmt(r.Amount), r.Purpose || '', r.Reference || ''];
      });
      body += '<h2>Expenditures (period)</h2>' + this.tableHtml(['Date', 'Category', 'Amount', 'Supplier'], data.expenseLines, function (r) {
        return [Utils.dateKey(r.Date), r.Category, 'UGX ' + Reports.fmt(r.Amount), r.Supplier || ''];
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
      body += '<h2>Revenue allocation (' + period + ')</h2>';
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
        var feed = Utils.toNumber(r.FeedIssuedKg);
        if (!feed) {
          feed = Utils.toNumber(r.FeedBrandKg) + Utils.toNumber(r.FeedHendrixKg) + Utils.toNumber(r.FeedConcentrateKg) + Utils.toNumber(r.FeedLimePowderKg) + Utils.toNumber(r.FeedLimestoneKg) + Utils.toNumber(r.FeedLimeKg) + Utils.toNumber(r.FeedSoyaKg) + Utils.toNumber(r.FeedSunflowerKg) + Utils.toNumber(r.FeedBrokenKg) + Utils.toNumber(r.FeedMaizeKg) + Utils.toNumber(r.FeedOthersKg);
        }
        return [Utils.dateKey(r.Date), r.ClosingBirds || r.OpeningBirds, r.Mortality, r.EggsCollected, feed];
      });
    } else if (type === 'budget') {
      var b = data.budget || {};
      body += '<div class="kpi"><div class="l">Budget</div><div class="v">UGX ' + this.fmt(b.totalBudget) + '</div></div>';
      body += '<div class="kpi"><div class="l">Actual</div><div class="v">UGX ' + this.fmt(b.totalActual) + '</div></div>';
      body += '<div class="kpi"><div class="l">Variance</div><div class="v">UGX ' + this.fmt(b.variance) + '</div></div>';
      body += this.tableHtml(['Category', 'Item', 'Budget', 'Actual'], b.lines || [], function (r) {
        return [r.Category, r.SubItem, 'UGX ' + Reports.fmt(r.BudgetTotal), 'UGX ' + Reports.fmt(r.ActualTotal)];
      });
    } else if (type === 'expense') {
      body += '<div class="kpi"><div class="l">Total expenses</div><div class="v">UGX ' + this.fmt(data.total) + '</div></div>';
      var cats = data.byCategory || {};
      body += '<h2>By category</h2>' + this.tableHtml(['Category', 'Amount'], Object.keys(cats), function (c) {
        return [c, 'UGX ' + Reports.fmt(cats[c])];
      });
      body += '<h2>Lines</h2>' + this.tableHtml(['Date', 'Category', 'Detail', 'Amount', 'Supplier'], data.lines, function (r) {
        return [Utils.dateKey(r.Date), r.Category, r.SubCategory || '', 'UGX ' + Reports.fmt(r.Amount), r.Supplier || ''];
      });
    } else if (type === 'revenue') {
      body += '<div class="kpi"><div class="l">Revenue</div><div class="v">UGX ' + this.fmt(data.total) + '</div></div>';
      body += '<div class="kpi"><div class="l">Sales</div><div class="v">' + (data.count || 0) + '</div></div>';
      body += '<h2>Lines</h2>' + this.tableHtml(['Date', 'Customer', 'Trays', 'Revenue', 'Payment'], data.lines, function (r) {
        return [Utils.dateKey(r.Date), r.Customer || '', r.QuantityTrays || '', 'UGX ' + Reports.fmt(r.TotalRevenue), r.PaymentStatus || ''];
      });
    } else if (type === 'profit') {
      body += '<div class="kpi"><div class="l">Paid</div><div class="v">UGX ' + this.fmt(data.paid) + '</div></div>';
      body += '<div class="kpi"><div class="l">Pending</div><div class="v">UGX ' + this.fmt(data.pending) + '</div></div>';
      body += '<h2>Distributions</h2>' + this.tableHtml(['Month', 'Amount', 'Status', 'Paid date', 'Reference'], data.lines, function (r) {
        return [Utils.dateKey(r.Month) || r.Month, 'UGX ' + Reports.fmt(r.Amount), r.Status || '', Utils.dateKey(r.PaidDate), r.Reference || ''];
      });
    } else if (type === 'inventory') {
      body += '<h2>Feed stock</h2>' + this.tableHtml(['Product', 'Stock (kg)', 'Unit cost'], data.feed, function (r) {
        return [r.Product, Reports.fmt(r.ClosingStock), 'UGX ' + Reports.fmt(r.UnitCost)];
      });
      body += '<h2>Items</h2>' + this.tableHtml(['Name', 'Quantity', 'Unit'], data.items, function (r) {
        return [r.Name, r.Quantity, r.Unit || ''];
      });
    } else if (type === 'mortality') {
      body += '<div class="kpi"><div class="l">Total losses</div><div class="v">' + this.fmt(data.total) + '</div></div>';
      body += '<h2>Lines</h2>' + this.tableHtml(['Date', 'Deaths', 'Opening', 'Rate %'], data.lines, function (r) {
        return [Utils.dateKey(r.Date), r.Mortality, r.OpeningBirds, r.Rate || ''];
      });
    } else if (type === 'feed') {
      body += '<div class="kpi"><div class="l">Purchases total</div><div class="v">UGX ' + this.fmt(data.purchaseTotal) + '</div></div>';
      body += '<h2>Purchases</h2>' + this.tableHtml(['Date', 'Product', 'Qty (kg)', 'Total'], data.purchases, function (r) {
        return [Utils.dateKey(r.Date), r.Product, Reports.fmt(r.QtyKg), 'UGX ' + Reports.fmt(r.TotalCost)];
      });
      body += '<h2>Stock</h2>' + this.tableHtml(['Product', 'Stock (kg)'], data.inventory, function (r) {
        return [r.Product, Reports.fmt(r.ClosingStock)];
      });
    } else if (type === 'audit') {
      body += '<div class="kpi"><div class="l">Capital lines</div><div class="v">' + (data.capital || []).length + '</div></div>';
      body += '<div class="kpi"><div class="l">Expense lines</div><div class="v">' + (data.expenses || []).length + '</div></div>';
      body += '<div class="kpi"><div class="l">Sales lines</div><div class="v">' + (data.sales || []).length + '</div></div>';
      body += '<div class="kpi"><div class="l">Production days</div><div class="v">' + (data.productionDays || 0) + '</div></div>';
      body += '<p>' + (data.note || '') + '</p>';
    } else if (type === 'weekly_section') {
      body += '<p class="u-text-sm u-text-secondary">Week ' + (data.week || '') +
        ' · Section ' + (data.section || 'all') + ' · ' + (data.weekStart || '') +
        ' – ' + (data.weekEnd || '') + '</p>' +
        '<div class="kpi-grid">' +
        '<div class="card kpi-card"><div class="kpi-label">Days logged</div><div class="kpi-value">' + (data.daysLogged || 0) + '</div></div>' +
        '<div class="card kpi-card"><div class="kpi-label">Birds start → end</div><div class="kpi-value">' + Reports.fmt(data.openingBirds) + ' → ' + Reports.fmt(data.closingBirds) + '</div></div>' +
        '<div class="card kpi-card"><div class="kpi-label">Eggs (trays)</div><div class="kpi-value">' + (data.eggsTrays || 0) + '</div></div>' +
        '<div class="card kpi-card"><div class="kpi-label">Mortality</div><div class="kpi-value">' + (data.totalMortality || 0) + '</div></div>' +
        '<div class="card kpi-card"><div class="kpi-label">Feed (kg)</div><div class="kpi-value">' + (data.totalFeedKg || 0) + '</div></div>' +
        '<div class="card kpi-card"><div class="kpi-label">Laying %</div><div class="kpi-value">' + (data.productionPct != null ? data.productionPct + '%' : '—') + '</div></div>' +
        '<div class="card kpi-card"><div class="kpi-label">Sales revenue</div><div class="kpi-value">UGX ' + Reports.fmt(data.salesRevenue) + '</div></div>' +
        '</div>';
    } else if (type === 'health') {
      body += '<div class="kpi"><div class="l">Scheduled</div><div class="v">' + (data.scheduled || 0) + '</div></div>';
      body += '<div class="kpi"><div class="l">Completed</div><div class="v">' + (data.completed || 0) + '</div></div>';
      body += '<div class="kpi"><div class="l">Overdue</div><div class="v">' + (data.overdue || 0) + '</div></div>';
      body += '<div class="kpi"><div class="l">Treatments logged</div><div class="v">' + (data.treatments || 0) + '</div></div>';
      body += '<h2>Schedule</h2>' + this.tableHtml(['Week', 'Vaccine', 'Planned', 'Actual', 'Status'], data.lines, function (r) {
        return [r.Week, r.Vaccine, r.PlannedDate || '', r.ActualDate || '', r.Status || ''];
      });
    } else if (type === 'capital_statement') {
      body += '<div class="kpi"><div class="l">Received (period)</div><div class="v">UGX ' + this.fmt(data.received) + '</div></div>';
      body += '<div class="kpi"><div class="l">Cumulative</div><div class="v">UGX ' + this.fmt(data.cumulative) + '</div></div>';
      body += '<div class="kpi"><div class="l">Outstanding</div><div class="v">UGX ' + this.fmt(data.outstanding) + '</div></div>';
      body += '<h2>Contributions</h2>' + this.tableHtml(['Date', 'Amount', 'Purpose', 'Reference'], data.lines, function (r) {
        return [Utils.dateKey(r.Date), 'UGX ' + Reports.fmt(r.Amount), r.Purpose || '', r.Reference || ''];
      });
    } else if (type === 'forecast') {
      body += '<div class="kpi"><div class="l">Horizon</div><div class="v">' + (data.horizonDays || 0) + ' days</div></div>';
      body += '<div class="kpi"><div class="l">Projected revenue</div><div class="v">UGX ' + this.fmt(data.projectedRevenue) + '</div></div>';
      body += '<div class="kpi"><div class="l">Projected expenses</div><div class="v">UGX ' + this.fmt(data.projectedExpenses) + '</div></div>';
      body += '<div class="kpi"><div class="l">Projected net</div><div class="v">UGX ' + this.fmt(data.projectedNetProfit) + '</div></div>';
      body += '<div class="kpi"><div class="l">Funding required</div><div class="v">UGX ' + this.fmt(data.fundingRequired) + '</div></div>';
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
