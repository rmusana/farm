/**
 * Dashboard API – KPIs, health score, insights, activity
 * All calculations derived from Sheets data when available.
 */
var Dashboard = {
  handle: function (body) {
    var action = (body.action || 'summary').toString();
    if (action === 'summary') return this.summary(body);
    if (action === 'insights') return this.insights(body);
    if (action === 'activity') return this.activity(body);
    return { success: false, error: 'Unknown dashboard action' };
  },

  summary: function (body) {
    var projectId = body.projectId || this.defaultProjectId();
    var data = this.computeSummary(projectId);
    return { success: true, data: data };
  },

  insights: function (body) {
    var projectId = body.projectId || this.defaultProjectId();
    var summary = this.computeSummary(projectId);
    var list = this.buildInsights(summary);
    return { success: true, data: list };
  },

  activity: function (body) {
    var projectId = body.projectId || this.defaultProjectId();
    return { success: true, data: this.recentActivity(projectId) };
  },

  defaultProjectId: function () {
    try {
      var sheet = getSheet('Projects');
      var rows = Utils.sheetToObjects(sheet);
      if (rows.length) return rows[0].ProjectID;
    } catch (e) {}
    return 'LUK54';
  },

  computeSummary: function (projectId) {
    var capital = this.sumColumn('CapitalContributions', 'Amount', projectId);
    var expenses = this.sumColumn('Expenses', 'Amount', projectId);
    var revenue = this.sumColumn('Sales', 'TotalRevenue', projectId);
    var production = this.latestProduction(projectId);
    var mortality = this.mortalityStats(projectId);
    var feed = this.feedStats(projectId);
    var budget = this.budgetStats(projectId);
    var alerts = this.openAlerts(projectId);
    var commercial = this.commercialStatus(projectId, production);

    // Clause 13 allocation (only after commercial production)
    var grossSales = revenue;
    var feedAllocation = 0;
    var grossProfit = 0;
    var operatingShare = 0;
    var netProfit = 0;
    if (commercial.reached) {
      feedAllocation = grossSales * 0.5;
      grossProfit = grossSales * 0.5;
      operatingShare = grossProfit * 0.25;
      netProfit = grossProfit - operatingShare;
    }

    var roi = capital > 0 ? (netProfit / capital) * 100 : 0;
    var capitalRecovery = capital > 0 ? (netProfit / capital) * 100 : 0;
    var cashPosition = capital - expenses + (commercial.reached ? netProfit : 0);
    var outstandingFunding = Math.max(0, (budget.totalBudget || 0) - capital);

    var healthScore = this.computeHealthScore({
      productionPercent: production.layingPercent,
      mortalityRate: mortality.rate,
      feedEfficiency: feed.efficiencyScore,
      budgetAdherence: budget.adherence,
      capitalRecovery: capitalRecovery,
      openCriticalAlerts: alerts.critical
    });

    return {
      projectId: projectId,
      healthScore: Math.round(healthScore),
      totalInvestment: capital,
      totalExpenses: expenses,
      revenue: grossSales,
      grossProfit: grossProfit,
      operatingShare: operatingShare,
      netProfit: netProfit,
      roi: Math.round(roi * 10) / 10,
      capitalRecovery: Math.round(capitalRecovery * 10) / 10,
      cashPosition: cashPosition,
      outstandingFunding: outstandingFunding,
      budgetSpent: budget.spent,
      budgetTotal: budget.totalBudget,
      budgetAdherence: budget.adherence,
      productionPercent: production.layingPercent,
      productionTargetMin: 88,
      productionTargetMax: 92,
      commercialReached: commercial.reached,
      daysToCommercial: commercial.daysTo,
      expectedCommercialWeek: 25,
      currentWeek: production.week,
      birdCount: production.birds,
      mortalityRate: mortality.rate,
      mortalityCount: mortality.count,
      feedDaysRemaining: feed.daysRemaining,
      feedEfficiency: feed.kgPerDozen,
      openAlerts: alerts.total,
      criticalAlerts: alerts.critical,
      eggTrend: production.trend,
      mortalityTrend: mortality.trend,
      generatedAt: new Date().toISOString()
    };
  },

  computeHealthScore: function (m) {
    // Weights from blueprint: Production 25%, Mortality 15%, Feed 15%, Budget 15%, Recovery 15%, Alerts 15%
    var prod = 50;
    if (m.productionPercent != null) {
      if (m.productionPercent >= 88) prod = 100;
      else if (m.productionPercent >= 85) prod = 85;
      else if (m.productionPercent >= 80) prod = 65;
      else if (m.productionPercent >= 70) prod = 40;
      else prod = 20;
    }

    var mort = 80;
    if (m.mortalityRate != null) {
      if (m.mortalityRate <= 1) mort = 100;
      else if (m.mortalityRate <= 2) mort = 80;
      else if (m.mortalityRate <= 4) mort = 50;
      else mort = 20;
    }

    var feed = m.feedEfficiency != null ? Math.min(100, Math.max(0, m.feedEfficiency)) : 70;
    var budget = m.budgetAdherence != null ? Math.min(100, Math.max(0, m.budgetAdherence)) : 70;
    var recovery = m.capitalRecovery != null ? Math.min(100, Math.max(0, m.capitalRecovery)) : 0;
    if (m.capitalRecovery > 100) recovery = 100;

    var alertScore = 100;
    if (m.openCriticalAlerts > 0) alertScore = Math.max(0, 100 - m.openCriticalAlerts * 25);
    else if (m.openCriticalAlerts === 0) alertScore = 100;

    return (
      prod * 0.25 +
      mort * 0.15 +
      feed * 0.15 +
      budget * 0.15 +
      recovery * 0.15 +
      alertScore * 0.15
    );
  },

  buildInsights: function (s) {
    var insights = [];

    if (s.healthScore >= 80) {
      insights.push({ severity: 'positive', text: 'Investment health is strong at ' + s.healthScore + '/100. Operations and financials are aligned with targets.' });
    } else if (s.healthScore >= 60) {
      insights.push({ severity: 'caution', text: 'Investment health is moderate (' + s.healthScore + '/100). Review production and budget variances.' });
    } else {
      insights.push({ severity: 'critical', text: 'Investment health is weak (' + s.healthScore + '/100). Immediate review of production, mortality and funding is recommended.' });
    }

    if (s.commercialReached) {
      insights.push({ severity: 'positive', text: 'Commercial production has been reached. Clause 13 revenue allocation is active.' });
    } else if (s.daysToCommercial != null && s.daysToCommercial > 0) {
      insights.push({ severity: 'info', text: 'Commercial production is expected in approximately ' + s.daysToCommercial + ' days (Week ' + s.expectedCommercialWeek + ').' });
    } else if (s.currentWeek != null) {
      insights.push({ severity: 'info', text: 'Flock is in week ' + s.currentWeek + '. Commercial production target is week ' + s.expectedCommercialWeek + ' or 85% laying capacity.' });
    }

    if (s.productionPercent != null) {
      if (s.productionPercent < 80) {
        insights.push({ severity: 'critical', text: 'Production is at ' + s.productionPercent + '%, below the 80% off-lay threshold. Joint review required if sustained for 4 weeks.' });
      } else if (s.productionPercent < 88) {
        insights.push({ severity: 'caution', text: 'Production is at ' + s.productionPercent + '%, below the contractual target band of 88–92%.' });
      } else {
        insights.push({ severity: 'positive', text: 'Production is at ' + s.productionPercent + '%, within the expected 88–92% target band.' });
      }
    }

    if (s.feedDaysRemaining != null) {
      if (s.feedDaysRemaining < 5) {
        insights.push({ severity: 'critical', text: 'Current feed inventory will last approximately ' + s.feedDaysRemaining + ' days. Reorder immediately.' });
      } else if (s.feedDaysRemaining < 14) {
        insights.push({ severity: 'caution', text: 'Feed inventory covers about ' + s.feedDaysRemaining + ' days. Plan the next purchase.' });
      } else {
        insights.push({ severity: 'info', text: 'Feed inventory is sufficient for approximately ' + s.feedDaysRemaining + ' days.' });
      }
    }

    if (s.mortalityRate != null && s.mortalityRate > 2) {
      insights.push({ severity: 'caution', text: 'Mortality rate is ' + s.mortalityRate + '%. Investigate causes and biosecurity.' });
    } else if (s.mortalityRate != null) {
      insights.push({ severity: 'positive', text: 'Mortality remains within acceptable thresholds (' + s.mortalityRate + '%).' });
    }

    if (s.outstandingFunding > 0) {
      insights.push({ severity: 'caution', text: 'Outstanding funding requirement is UGX ' + Math.round(s.outstandingFunding).toLocaleString() + '.' });
    }

    if (s.roi != null && s.commercialReached) {
      insights.push({ severity: s.roi >= 0 ? 'positive' : 'caution', text: 'ROI stands at ' + s.roi + '% based on net profit attributable to the Investment Partner.' });
    }

    if (s.criticalAlerts > 0) {
      insights.push({ severity: 'critical', text: s.criticalAlerts + ' critical alert(s) require immediate attention.' });
    }

    if (insights.length === 0) {
      insights.push({ severity: 'info', text: 'Awaiting operational data. Log daily production, feed and expenses to generate live intelligence.' });
    }

    return insights.slice(0, 8);
  },

  recentActivity: function (projectId) {
    var items = [];
    try {
      var daily = this.rowsForProject('DailyProduction', projectId).slice(-5).reverse();
      daily.forEach(function (r) {
        items.push({
          type: 'production',
          title: 'Daily production logged',
          detail: (r.EggsCollected || 0) + ' eggs · mortality ' + (r.Mortality || 0),
          date: r.Date,
          icon: 'clipboard-list'
        });
      });
    } catch (e) {}
    try {
      var caps = this.rowsForProject('CapitalContributions', projectId).slice(-3).reverse();
      caps.forEach(function (r) {
        items.push({
          type: 'capital',
          title: 'Capital contribution',
          detail: 'UGX ' + Number(r.Amount || 0).toLocaleString(),
          date: r.Date,
          icon: 'banknote'
        });
      });
    } catch (e) {}
    try {
      var sales = this.rowsForProject('Sales', projectId).slice(-3).reverse();
      sales.forEach(function (r) {
        items.push({
          type: 'sale',
          title: 'Egg sale',
          detail: 'UGX ' + Number(r.TotalRevenue || 0).toLocaleString(),
          date: r.Date,
          icon: 'shopping-cart'
        });
      });
    } catch (e) {}

    items.sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });
    return items.slice(0, 10);
  },

  /* ── data helpers ─────────────────────────────────────── */

  rowsForProject: function (sheetName, projectId) {
    try {
      var sheet = getSheet(sheetName);
      var rows = Utils.sheetToObjects(sheet);
      if (!projectId) return rows;
      return rows.filter(function (r) {
        return !r.ProjectID || String(r.ProjectID) === String(projectId);
      });
    } catch (e) {
      return [];
    }
  },

  sumColumn: function (sheetName, col, projectId) {
    var rows = this.rowsForProject(sheetName, projectId);
    var total = 0;
    rows.forEach(function (r) {
      total += Utils.toNumber(r[col]);
    });
    return total;
  },

  latestProduction: function (projectId) {
    var rows = this.rowsForProject('DailyProduction', projectId);
    if (!rows.length) {
      return { layingPercent: null, birds: null, week: null, trend: [] };
    }
    rows.sort(function (a, b) { return new Date(a.Date) - new Date(b.Date); });
    var last = rows[rows.length - 1];
    var birds = Utils.toNumber(last.ClosingBirds) || Utils.toNumber(last.OpeningBirds);
    var eggs = Utils.toNumber(last.EggsCollected);
    // Approximate laying %: eggs / birds (assuming ~1 egg/bird/day at peak)
    var layingPercent = birds > 0 ? Math.round((eggs / birds) * 1000) / 10 : null;

    var startDate = null;
    try {
      var projects = Utils.sheetToObjects(getSheet('Projects'));
      var p = projects.filter(function (x) { return String(x.ProjectID) === String(projectId); })[0];
      if (p && p.StartDate) startDate = new Date(p.StartDate);
    } catch (e) {}
    if (!startDate) startDate = new Date('2026-06-01');
    var week = Math.max(1, Math.ceil((new Date(last.Date) - startDate) / (7 * 24 * 3600 * 1000)));

    var trend = rows.slice(-30).map(function (r) {
      var b = Utils.toNumber(r.ClosingBirds) || Utils.toNumber(r.OpeningBirds) || 1;
      var e = Utils.toNumber(r.EggsCollected);
      return {
        date: r.Date,
        eggs: e,
        percent: Math.round((e / b) * 1000) / 10
      };
    });

    return { layingPercent: layingPercent, birds: birds, week: week, trend: trend };
  },

  mortalityStats: function (projectId) {
    var rows = this.rowsForProject('DailyProduction', projectId);
    if (!rows.length) return { rate: null, count: 0, trend: [] };
    var totalMort = 0;
    var peakBirds = 0;
    var trend = [];
    rows.forEach(function (r) {
      var m = Utils.toNumber(r.Mortality);
      totalMort += m;
      var b = Utils.toNumber(r.OpeningBirds) || Utils.toNumber(r.ClosingBirds);
      if (b > peakBirds) peakBirds = b;
      trend.push({ date: r.Date, count: m });
    });
    var rate = peakBirds > 0 ? Math.round((totalMort / peakBirds) * 1000) / 10 : null;
    return { rate: rate, count: totalMort, trend: trend.slice(-30) };
  },

  feedStats: function (projectId) {
    try {
      var inv = this.rowsForProject('FeedInventory', projectId);
      var totalStock = 0;
      inv.forEach(function (r) {
        totalStock += Utils.toNumber(r.ClosingStock);
      });
      var daily = this.rowsForProject('DailyProduction', projectId).slice(-7);
      var consumed = 0;
      daily.forEach(function (r) {
        consumed += Utils.toNumber(r.FeedBrandKg) + Utils.toNumber(r.FeedHendrixKg) +
          Utils.toNumber(r.FeedLimeKg) + Utils.toNumber(r.FeedSoyaKg) +
          Utils.toNumber(r.FeedSunflowerKg) + Utils.toNumber(r.FeedBrokenKg);
      });
      var avgDaily = daily.length ? consumed / daily.length : 0;
      var daysRemaining = avgDaily > 0 ? Math.round(totalStock / avgDaily) : null;

      var eggs = 0;
      daily.forEach(function (r) { eggs += Utils.toNumber(r.EggsCollected); });
      var kgPerDozen = eggs > 0 ? Math.round((consumed / (eggs / 12)) * 100) / 100 : null;
      // Efficiency score: lower kg/dozen is better; 1.5–2.0 typical range
      var efficiencyScore = 70;
      if (kgPerDozen != null) {
        if (kgPerDozen <= 1.6) efficiencyScore = 100;
        else if (kgPerDozen <= 1.9) efficiencyScore = 85;
        else if (kgPerDozen <= 2.2) efficiencyScore = 65;
        else efficiencyScore = 40;
      }

      return { daysRemaining: daysRemaining, kgPerDozen: kgPerDozen, efficiencyScore: efficiencyScore };
    } catch (e) {
      return { daysRemaining: null, kgPerDozen: null, efficiencyScore: null };
    }
  },

  budgetStats: function (projectId) {
    try {
      var lines = this.rowsForProject('BudgetLines', projectId);
      var totalBudget = 0;
      var spent = 0;
      lines.forEach(function (r) {
        totalBudget += Utils.toNumber(r.BudgetTotal);
        spent += Utils.toNumber(r.ActualTotal);
      });
      if (totalBudget === 0) {
        // Fallback from known budget totals (birds + brooder + feeds estimate)
        totalBudget = 13000000 + 4215000 + 35634172;
      }
      var adherence;
      if (spent === 0) adherence = 70;
      else if (totalBudget === 0) adherence = 70;
      else adherence = Math.min(100, Math.max(0, 100 - Math.abs((spent / totalBudget) - 0.5) * 100));
      return { totalBudget: totalBudget, spent: spent, adherence: Math.round(adherence) };
    } catch (e) {
      return { totalBudget: 52849172, spent: 0, adherence: 70 };
    }
  },

  openAlerts: function (projectId) {
    try {
      var rows = this.rowsForProject('Alerts', projectId).filter(function (r) {
        return r.Status === 'Open';
      });
      var critical = rows.filter(function (r) { return r.Priority === 'Critical'; }).length;
      return { total: rows.length, critical: critical };
    } catch (e) {
      return { total: 0, critical: 0 };
    }
  },

  commercialStatus: function (projectId, production) {
    var reached = false;
    var daysTo = null;
    try {
      var projects = Utils.sheetToObjects(getSheet('Projects'));
      var p = projects.filter(function (x) { return String(x.ProjectID) === String(projectId); })[0];
      if (p && p.CommercialProductionDate) {
        reached = true;
      }
    } catch (e) {}
    if (!reached && production.layingPercent != null && production.layingPercent >= 85) {
      reached = true;
    }
    if (!reached && production.week != null) {
      if (production.week >= 25) reached = true;
      else daysTo = (25 - production.week) * 7;
    }
    return { reached: reached, daysTo: daysTo };
  }
};
