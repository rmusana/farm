/**
 * Finance API – Capital, Expenses, Budget, Allocation, Profit, ROI, Forecast
 */
var Finance = {
  handle: function (body) {
    var action = (body.action || 'list').toString();
    var resource = (body.resource || 'capital').toString();

    var writeActions = { create: 1, seed: 1, finalize: 1, markPaid: 1, delete: 1, update: 1 };
    if (writeActions[action]) {
      // Capital / allocation / profit: Investment Partner or Admin
      if (resource === 'capital' || resource === 'allocation' || resource === 'profit') {
        if (!Auth.requireRole(body, ['Administrator', 'Investor'])) {
          return Auth.deny('Investment Partner or Administrator access required');
        }
      } else if (resource === 'expenses') {
        // Expenses: day-to-day operational spend — Operating Partner/Admin only (Investor views)
        if (action === 'list') {
          if (!Auth.requireRole(body, ['Administrator', 'Investor', 'OperationsManager', 'OperatingPartner'])) return Auth.deny('Forbidden');
        } else {
          if (!Auth.requireRole(body, ['Administrator', 'OperationsManager', 'OperatingPartner'])) return Auth.deny('Operating Partner or Administrator required');
        }
      } else {
        if (!Auth.requireRole(body, ['Administrator', 'Investor', 'OperationsManager', 'OperatingPartner'])) {
          return Auth.deny('Forbidden');
        }
      }
    }

    if (resource === 'capital') {
      if (action === 'list') return this.listCapital(body);
      if (action === 'create') return this.createCapital(body);
      if (action === 'delete') return this.deleteById(body, 'CapitalContributions', 'ContributionID');
    }
    if (resource === 'expenses') {
      if (action === 'list') return this.listExpenses(body);
      if (action === 'create') return this.createExpense(body);
      if (action === 'delete') return this.deleteById(body, 'Expenses', 'ExpenseID');
    }
    if (resource === 'budget') {
      if (action === 'status') return this.budgetStatus(body);
      if (action === 'seed') return this.seedBudget(body);
    }
    if (resource === 'allocation') {
      if (action === 'compute') return this.computeAllocation(body);
      if (action === 'list') return this.listAllocations(body);
      if (action === 'finalize') return this.finalizeAllocation(body);
    }
    if (resource === 'profit') {
      if (action === 'list') return this.listDistributions(body);
      if (action === 'create') return this.createDistribution(body);
      if (action === 'markPaid') return this.markPaid(body);
    }
    if (resource === 'summary') {
      return this.financialSummary(body);
    }
    if (resource === 'forecast') {
      return this.forecast(body);
    }
    if (resource === 'cashflow') {
      return this.cashflow(body);
    }
    return { success: false, error: 'Unknown finance action/resource' };
  },

  projectId: function (body) {
    return body.projectId || 'LUK54';
  },

  /* ── Capital ──────────────────────────────────────────── */

  listCapital: function (body) {
    var rows = this.rows('CapitalContributions', this.projectId(body));
    rows.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });
    var total = rows.reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0);
    return { success: true, data: rows, total: total };
  },

  createCapital: function (body) {
    Utils.requireFields(body, ['date', 'amount']);
    var pid = this.projectId(body);
    var sheet = getSheet('CapitalContributions');
    this.ensureHeaders(sheet, ['ContributionID', 'ProjectID', 'Date', 'Amount', 'Purpose', 'Reference', 'DocumentID', 'CreatedBy', 'CreatedAt']);
    var id = Utils.generateId('cc');
    var row = {
      ContributionID: id,
      ProjectID: pid,
      Date: body.date,
      Amount: Utils.toNumber(body.amount),
      Purpose: body.purpose || 'General',
      Reference: body.reference || '',
      DocumentID: body.documentId || '',
      CreatedBy: (body._user && body._user.Email) || '',
      CreatedAt: Utils.nowISO()
    };
    Utils.appendObject(sheet, row);
    return { success: true, data: row };
  },

  /* ── Expenses ─────────────────────────────────────────── */

  listExpenses: function (body) {
    var rows = this.rows('Expenses', this.projectId(body));
    rows.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });
    var total = rows.reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0);
    return { success: true, data: rows, total: total };
  },

  createExpense: function (body) {
    Utils.requireFields(body, ['date', 'category', 'amount']);
    var pid = this.projectId(body);
    var sheet = getSheet('Expenses');
    this.ensureHeaders(sheet, ['ExpenseID', 'ProjectID', 'Date', 'Category', 'SubCategory', 'Amount', 'Supplier', 'BudgetLineID', 'DocumentID', 'Notes', 'CreatedBy', 'CreatedAt']);
    var id = Utils.generateId('ex');
    var row = {
      ExpenseID: id,
      ProjectID: pid,
      Date: body.date,
      Category: body.category,
      SubCategory: body.subCategory || '',
      Amount: Utils.toNumber(body.amount),
      Supplier: body.supplier || '',
      BudgetLineID: body.budgetLineId || '',
      DocumentID: body.documentId || '',
      Notes: body.notes || '',
      CreatedBy: (body._user && body._user.Email) || '',
      CreatedAt: Utils.nowISO()
    };
    Utils.appendObject(sheet, row);
    this.updateBudgetActual(pid, body.category, body.subCategory, Utils.toNumber(body.amount));
    return { success: true, data: row };
  },

  /* ── Budget ───────────────────────────────────────────── */

  budgetStatus: function (body) {
    var pid = this.projectId(body);
    var lines = this.rows('BudgetLines', pid);
    if (!lines.length) {
      lines = this.seedBudget({ projectId: pid }).data || [];
    }
    var totalBudget = 0;
    var totalActual = 0;
    lines.forEach(function (l) {
      totalBudget += Utils.toNumber(l.BudgetTotal);
      totalActual += Utils.toNumber(l.ActualTotal);
    });
    return {
      success: true,
      data: {
        lines: lines,
        totalBudget: totalBudget,
        totalActual: totalActual,
        variance: totalActual - totalBudget,
        variancePct: totalBudget > 0 ? Math.round((totalActual - totalBudget) / totalBudget * 1000) / 10 : 0
      }
    };
  },

  seedBudget: function (body) {
    var pid = this.projectId(body);
    var sheet = getSheet('BudgetLines');
    this.ensureHeaders(sheet, ['LineID', 'ProjectID', 'Category', 'SubItem', 'BudgetQty', 'BudgetUnitCost', 'BudgetTotal', 'ActualTotal', 'Variance']);
    var existing = this.rows('BudgetLines', pid);
    if (existing.length) return { success: true, data: existing, message: 'Budget already seeded' };

    // From Rough Budget for 2,500 layer birds
    var lines = [
      { Category: 'Booking', SubItem: '2,500 Birds', BudgetQty: 2500, BudgetUnitCost: 5200, BudgetTotal: 13000000 },
      { Category: 'Brooder', SubItem: 'Black Polythene', BudgetQty: 1, BudgetUnitCost: 70000, BudgetTotal: 70000 },
      { Category: 'Brooder', SubItem: 'White Polythene', BudgetQty: 1, BudgetUnitCost: 150000, BudgetTotal: 150000 },
      { Category: 'Brooder', SubItem: 'Charcoal', BudgetQty: 30, BudgetUnitCost: 70000, BudgetTotal: 2100000 },
      { Category: 'Brooder', SubItem: 'Charcoal Bricketts', BudgetQty: 600, BudgetUnitCost: 1500, BudgetTotal: 900000 },
      { Category: 'Brooder', SubItem: 'Brooding Paper', BudgetQty: 10, BudgetUnitCost: 7000, BudgetTotal: 70000 },
      { Category: 'Brooder', SubItem: 'Drinkers', BudgetQty: 24, BudgetUnitCost: 5000, BudgetTotal: 120000 },
      { Category: 'Brooder', SubItem: 'Boards', BudgetQty: 15, BudgetUnitCost: 7000, BudgetTotal: 105000 },
      { Category: 'Brooder', SubItem: 'Liquid Soap', BudgetQty: 1, BudgetUnitCost: 50000, BudgetTotal: 50000 },
      { Category: 'Brooder', SubItem: 'Coffee Husks', BudgetQty: 40, BudgetUnitCost: 10000, BudgetTotal: 400000 },
      { Category: 'Brooder', SubItem: 'Trays', BudgetQty: 2, BudgetUnitCost: 50000, BudgetTotal: 100000 },
      { Category: 'Brooder', SubItem: 'Petrol', BudgetQty: 30, BudgetUnitCost: 5000, BudgetTotal: 150000 },
      { Category: 'Feeds', SubItem: 'Brand (baseline batch)', BudgetQty: 550, BudgetUnitCost: 1000, BudgetTotal: 550000 },
      { Category: 'Feeds', SubItem: 'Hendrix', BudgetQty: 50, BudgetUnitCost: 4800, BudgetTotal: 240000 },
      { Category: 'Feeds', SubItem: 'Lime', BudgetQty: 125, BudgetUnitCost: 370, BudgetTotal: 46250 },
      { Category: 'Feeds', SubItem: 'Soya', BudgetQty: 90, BudgetUnitCost: 2600, BudgetTotal: 234000 },
      { Category: 'Feeds', SubItem: 'Sunflower', BudgetQty: 70, BudgetUnitCost: 1300, BudgetTotal: 91000 },
      { Category: 'Feeds', SubItem: 'Broken', BudgetQty: 175, BudgetUnitCost: 1200, BudgetTotal: 210000 },
      { Category: 'Feeds', SubItem: 'Estimated 6-month feed (27,538 kg)', BudgetQty: 27538, BudgetUnitCost: 1294, BudgetTotal: 35634172 },
      { Category: 'Medication', SubItem: 'Common meds (monthly stock)', BudgetQty: 1, BudgetUnitCost: 500000, BudgetTotal: 500000 },
      { Category: 'Vaccination', SubItem: 'Schedule vaccines', BudgetQty: 1, BudgetUnitCost: 400000, BudgetTotal: 400000 }
    ];

    var out = [];
    var self = this;
    lines.forEach(function (l) {
      var row = {
        LineID: Utils.generateId('bl'),
        ProjectID: pid,
        Category: l.Category,
        SubItem: l.SubItem,
        BudgetQty: l.BudgetQty,
        BudgetUnitCost: l.BudgetUnitCost,
        BudgetTotal: l.BudgetTotal,
        ActualTotal: 0,
        Variance: -l.BudgetTotal
      };
      Utils.appendObject(sheet, row);
      out.push(row);
    });
    return { success: true, data: out };
  },

  updateBudgetActual: function (pid, category, subItem, amount) {
    try {
      var sheet = getSheet('BudgetLines');
      var data = sheet.getDataRange().getValues();
      if (data.length < 2) return;
      var headers = data[0];
      var catCol = headers.indexOf('Category');
      var subCol = headers.indexOf('SubItem');
      var actCol = headers.indexOf('ActualTotal');
      var budCol = headers.indexOf('BudgetTotal');
      var varCol = headers.indexOf('Variance');
      var pidCol = headers.indexOf('ProjectID');
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][pidCol]) === String(pid) &&
            String(data[i][catCol]) === String(category) &&
            (!subItem || String(data[i][subCol]).indexOf(String(subItem)) >= 0)) {
          var actual = Utils.toNumber(data[i][actCol]) + amount;
          sheet.getRange(i + 1, actCol + 1).setValue(actual);
          if (varCol >= 0) sheet.getRange(i + 1, varCol + 1).setValue(actual - Utils.toNumber(data[i][budCol]));
          return;
        }
      }
      // Fallback: match category only
      for (var j = 1; j < data.length; j++) {
        if (String(data[j][pidCol]) === String(pid) && String(data[j][catCol]) === String(category)) {
          var actual2 = Utils.toNumber(data[j][actCol]) + amount;
          sheet.getRange(j + 1, actCol + 1).setValue(actual2);
          if (varCol >= 0) sheet.getRange(j + 1, varCol + 1).setValue(actual2 - Utils.toNumber(data[j][budCol]));
          return;
        }
      }
    } catch (e) {}
  },

  /* ── Revenue Allocation ─────────────────────── */

  computeAllocation: function (body) {
    var pid = this.projectId(body);
    var month = body.month; // YYYY-MM
    if (!month) {
      var now = new Date();
      month = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }

    var commercial = this.isCommercial(pid);
    var sales = this.rows('Sales', pid).filter(function (r) {
      var d = String(r.Date || '');
      return d.indexOf(month) === 0;
    });
    var grossSales = sales.reduce(function (s, r) { return s + Utils.toNumber(r.TotalRevenue); }, 0);

    var feedAllocation = 0;
    var grossProfit = 0;
    var operatingShare = 0;
    var netProfit = 0;

    if (commercial) {
      // 50% Gross Sales → feed
      // remaining 50% = Gross Profit
      // 25% of Gross Profit → Operating Partner
      // balance → Investment Partner
      feedAllocation = grossSales * 0.5;
      grossProfit = grossSales * 0.5;
      operatingShare = grossProfit * 0.25;
      netProfit = grossProfit - operatingShare;
    }

    return {
      success: true,
      data: {
        month: month,
        commercialReached: commercial,
        grossSalesRevenue: grossSales,
        feedAllocation: feedAllocation,
        grossProfit: grossProfit,
        operatingPartnerShare: operatingShare,
        netProfitToInvestor: netProfit,
        formulaActive: commercial
      }
    };
  },

  listAllocations: function (body) {
    var rows = this.rows('RevenueAllocation', this.projectId(body));
    rows.sort(function (a, b) { return String(b.Month).localeCompare(String(a.Month)); });
    return { success: true, data: rows };
  },

  finalizeAllocation: function (body) {
    Utils.requireFields(body, ['month']);
    var pid = this.projectId(body);
    var computed = this.computeAllocation(body).data;
    if (!computed.commercialReached) {
      return { success: false, error: 'Commercial production not reached — allocation not active' };
    }

    var sheet = getSheet('RevenueAllocation');
    this.ensureHeaders(sheet, ['AllocationID', 'ProjectID', 'Month', 'GrossSalesRevenue', 'FeedAllocation50pct', 'GrossProfit', 'OperatingPartner25pct', 'NetProfitToInvestor', 'Status', 'PaidDate']);

    // Upsert by month
    var existing = this.rows('RevenueAllocation', pid).filter(function (r) { return r.Month === body.month; })[0];
    if (existing) {
      return { success: true, data: existing, message: 'Allocation already finalized for month' };
    }

    var id = Utils.generateId('ra');
    var row = {
      AllocationID: id,
      ProjectID: pid,
      Month: body.month,
      GrossSalesRevenue: computed.grossSalesRevenue,
      FeedAllocation50pct: computed.feedAllocation,
      GrossProfit: computed.grossProfit,
      OperatingPartner25pct: computed.operatingPartnerShare,
      NetProfitToInvestor: computed.netProfitToInvestor,
      Status: 'Finalized',
      PaidDate: ''
    };
    Utils.appendObject(sheet, row);
    return { success: true, data: row };
  },

  /* ── Profit Distribution ──────────────────────────────── */

  listDistributions: function (body) {
    var rows = this.rows('ProfitDistributions', this.projectId(body));
    rows.sort(function (a, b) { return String(b.Month).localeCompare(String(a.Month)); });
    return { success: true, data: rows };
  },

  createDistribution: function (body) {
    Utils.requireFields(body, ['month', 'amount']);
    var pid = this.projectId(body);
    var sheet = getSheet('ProfitDistributions');
    this.ensureHeaders(sheet, ['DistributionID', 'ProjectID', 'Month', 'Amount', 'PaidDate', 'Reference', 'DocumentID', 'Status']);
    var id = Utils.generateId('pd');
    var row = {
      DistributionID: id,
      ProjectID: pid,
      Month: body.month,
      Amount: Utils.toNumber(body.amount),
      PaidDate: body.paidDate || '',
      Reference: body.reference || '',
      DocumentID: body.documentId || '',
      Status: body.paidDate ? 'Paid' : 'Pending'
    };
    Utils.appendObject(sheet, row);
    return { success: true, data: row };
  },

  markPaid: function (body) {
    Utils.requireFields(body, ['distributionId']);
    var sheet = getSheet('ProfitDistributions');
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: false, error: 'Not found' };
    var headers = data[0];
    var idCol = headers.indexOf('DistributionID');
    var statusCol = headers.indexOf('Status');
    var paidCol = headers.indexOf('PaidDate');
    var refCol = headers.indexOf('Reference');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(body.distributionId)) {
        if (statusCol >= 0) sheet.getRange(i + 1, statusCol + 1).setValue('Paid');
        if (paidCol >= 0) sheet.getRange(i + 1, paidCol + 1).setValue(body.paidDate || Utils.nowISO().slice(0, 10));
        if (refCol >= 0 && body.reference) sheet.getRange(i + 1, refCol + 1).setValue(body.reference);
        return { success: true, message: 'Marked paid' };
      }
    }
    return { success: false, error: 'Distribution not found' };
  },

  /* ── Summary / ROI / Cash ─────────────────────────────── */

  financialSummary: function (body) {
    var pid = this.projectId(body);
    var capital = this.rows('CapitalContributions', pid).reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0);
    var expenses = this.rows('Expenses', pid).reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0);
    var revenue = this.rows('Sales', pid).reduce(function (s, r) { return s + Utils.toNumber(r.TotalRevenue); }, 0);
    var commercial = this.isCommercial(pid);

    var feedAllocation = 0, grossProfit = 0, operatingShare = 0, netProfit = 0;
    if (commercial) {
      feedAllocation = revenue * 0.5;
      grossProfit = revenue * 0.5;
      operatingShare = grossProfit * 0.25;
      netProfit = grossProfit - operatingShare;
    }

    var distributions = this.rows('ProfitDistributions', pid);
    var paidOut = distributions.filter(function (d) { return d.Status === 'Paid'; })
      .reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0);
    var pending = distributions.filter(function (d) { return d.Status !== 'Paid'; })
      .reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0);

    var roi = capital > 0 ? Math.round((netProfit / capital) * 1000) / 10 : 0;
    var capitalRecovery = capital > 0 ? Math.round((netProfit / capital) * 1000) / 10 : 0;
    var cashPosition = capital - expenses + (commercial ? netProfit : 0);

    var budget = this.budgetStatus(body).data;
    var outstandingFunding = Math.max(0, (budget.totalBudget || 0) - capital);

    return {
      success: true,
      data: {
        totalInvestment: capital,
        totalExpenses: expenses,
        grossSalesRevenue: revenue,
        commercialReached: commercial,
        feedAllocation: feedAllocation,
        grossProfit: grossProfit,
        operatingPartnerShare: operatingShare,
        netProfitToInvestor: netProfit,
        profitPaidOut: paidOut,
        profitPending: pending,
        roi: roi,
        capitalRecovery: capitalRecovery,
        cashPosition: cashPosition,
        outstandingFunding: outstandingFunding,
        budgetTotal: budget.totalBudget,
        budgetActual: budget.totalActual,
        budgetVariance: budget.variance
      }
    };
  },

  cashflow: function (body) {
    var pid = this.projectId(body);
    var capital = this.rows('CapitalContributions', pid);
    var expenses = this.rows('Expenses', pid);
    var sales = this.rows('Sales', pid);
    var events = [];

    capital.forEach(function (r) {
      events.push({ date: r.Date, type: 'in', category: 'Capital', amount: Utils.toNumber(r.Amount), label: r.Purpose || 'Contribution' });
    });
    expenses.forEach(function (r) {
      events.push({ date: r.Date, type: 'out', category: r.Category, amount: Utils.toNumber(r.Amount), label: r.SubCategory || r.Category });
    });
    sales.forEach(function (r) {
      events.push({ date: r.Date, type: 'in', category: 'Sales', amount: Utils.toNumber(r.TotalRevenue), label: r.Customer || 'Egg sale' });
    });

    events.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var running = 0;
    events.forEach(function (e) {
      running += e.type === 'in' ? e.amount : -e.amount;
      e.balance = running;
    });

    return { success: true, data: events };
  },

  forecast: function (body) {
    var pid = this.projectId(body);
    var summary = this.financialSummary(body).data;
    var days = Utils.toNumber(body.days) || 30;

    // Simple projection from recent sales and expenses
    var sales = this.rows('Sales', pid);
    var expenses = this.rows('Expenses', pid);
    var now = new Date();
    var cutoff = new Date(now.getTime() - 30 * 86400000);

    var recentSales = sales.filter(function (r) { return new Date(r.Date) >= cutoff; })
      .reduce(function (s, r) { return s + Utils.toNumber(r.TotalRevenue); }, 0);
    var recentExp = expenses.filter(function (r) { return new Date(r.Date) >= cutoff; })
      .reduce(function (s, r) { return s + Utils.toNumber(r.Amount); }, 0);

    var dailySales = recentSales / 30;
    var dailyExp = recentExp / 30;

    var projectedRevenue = dailySales * days;
    var projectedExpenses = dailyExp * days;
    var projectedNet = 0;
    if (summary.commercialReached) {
      var gp = projectedRevenue * 0.5;
      projectedNet = gp - gp * 0.25;
    }

    var fundingNeed = Math.max(0, projectedExpenses - summary.cashPosition - projectedNet);

    var projectedCash = summary.commercialReached
      ? Math.round(summary.cashPosition - projectedExpenses + projectedNet)
      : Math.round(summary.cashPosition - projectedExpenses + projectedRevenue);
    return {
      success: true,
      data: {
        horizonDays: days,
        projectedRevenue: Math.round(projectedRevenue),
        projectedExpenses: Math.round(projectedExpenses),
        projectedNetProfit: Math.round(projectedNet),
        projectedCash: projectedCash,
        fundingRequired: Math.round(fundingNeed),
        basedOnDays: 30,
        commercialReached: summary.commercialReached
      }
    };
  },

  /* ── helpers ──────────────────────────────────────────── */

  isCommercial: function (pid) {
    try {
      var projects = Utils.sheetToObjects(getSheet('Projects'));
      var p = projects.filter(function (x) { return String(x.ProjectID) === String(pid); })[0];
      if (p && p.CommercialProductionDate) return true;
    } catch (e) {}
    // Check production records for >= 85%
    try {
      var daily = this.rows('DailyProduction', pid);
      if (!daily.length) return false;
      daily.sort(function (a, b) { return new Date(b.Date) - new Date(a.Date); });
      var last = daily[0];
      var birds = Utils.toNumber(last.ClosingBirds) || Utils.toNumber(last.OpeningBirds);
      var eggs = Utils.toNumber(last.EggsCollected);
      if (birds > 0 && (eggs / birds) * 100 >= 85) return true;
      // Week 25+
      var start = new Date('2026-06-01');
      var week = Math.ceil((new Date(last.Date) - start) / (7 * 86400000));
      if (week >= 25) return true;
    } catch (e) {}
    return false;
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

  ensureHeaders: function (sheet, headers) {
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  },

  deleteById: function (body, sheetName, idColumn) {
    var id = body.id || body.recordId || body.contributionId || body.expenseId;
    if (!id) return { success: false, error: 'id required' };
    var sheet = getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: false, error: 'Not found' };
    var headers = data[0];
    var idCol = headers.indexOf(idColumn);
    if (idCol < 0) {
      // try common alternates
      var alts = ['ID', 'Id', 'RecordID'];
      for (var a = 0; a < alts.length; a++) {
        idCol = headers.indexOf(alts[a]);
        if (idCol >= 0) break;
      }
    }
    if (idCol < 0) return { success: false, error: 'ID column not found' };
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(id)) {
        sheet.deleteRow(i + 1);
        return { success: true, data: { deleted: id } };
      }
    }
    return { success: false, error: 'Not found' };
  }
};
