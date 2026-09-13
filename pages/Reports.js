/**
 * Reports module – generate, preview, print/PDF, email
 */
import { formatUGX, formatNumber } from '../components/KPI.js';
import { toastSuccess, toastError } from '../components/Toast.js';
import { canApprove } from '../js/auth.js';
import api from '../js/api.js';

const REPORT_GROUPS = [
  { id: 'close', label: 'Month close', hint: 'Start here at month end' },
  { id: 'money', label: 'Money', hint: 'Capital, spending and profit' },
  { id: 'production', label: 'Production', hint: 'Birds, eggs, feed and health' },
  { id: 'overviews', label: 'Overviews', hint: 'One-page and audit packs' }
];

const REPORT_TYPES = [
  { id: 'monthly_statement', group: 'close', name: 'Monthly Investment Statement', desc: 'The investor statement for one month', shows: 'Contributions · spending · production · sales', icon: 'file-text', empty: { text: 'No records in this period yet. Log daily production, expenses and capital first.', nav: 'operations', label: 'Go to Operations' } },
  { id: 'profit', group: 'close', name: 'Profit Distribution', desc: 'Investor profit payments', shows: 'Distributions by month: paid vs pending', icon: 'banknote', empty: { text: 'No distributions recorded. Finalize the monthly allocation under Finance first.', nav: 'finance', label: 'Go to Finance' } },
  { id: 'financial', group: 'money', name: 'Financial Report', desc: 'Revenue allocation and P&L', shows: 'Investment · allocation splits · net profit', icon: 'landmark' },
  { id: 'capital_statement', group: 'money', name: 'Capital Statement', desc: 'Contributions received and outstanding', shows: 'Every contribution + cumulative and outstanding', icon: 'piggy-bank', empty: { text: 'No contributions in this period. Record one under Finance → Capital.', nav: 'finance', label: 'Go to Finance' } },
  { id: 'expense', group: 'money', name: 'Expense Report', desc: 'Expenditures by category', shows: 'Totals by category + every line', icon: 'receipt', empty: { text: 'No expenses in this period. Record spending under Finance → Expenses or Operations.', nav: 'finance', label: 'Go to Finance' } },
  { id: 'revenue', group: 'money', name: 'Revenue Report', desc: 'Egg sales and revenue', shows: 'Every sale: customer, trays, revenue, payment', icon: 'shopping-cart', empty: { text: 'No sales in this period. Record sales under Operations → Sales.', nav: 'operations', label: 'Go to Operations' } },
  { id: 'budget', group: 'money', name: 'Capital vs Disbursed', desc: 'Capital contributed vs amounts spent', shows: 'Budget vs actual per line', icon: 'calculator' },
  { id: 'forecast', group: 'money', name: 'Forecast', desc: '90-day revenue, cost and funding outlook', shows: 'Projected revenue, costs and funding need', icon: 'trending-up' },
  { id: 'production', group: 'production', name: 'Production Report', desc: 'Eggs, mortality, feed by day', shows: 'Day-by-day eggs, losses and feed', icon: 'egg', empty: { text: 'No production logged in this period. Use Operations → Log Day.', nav: 'operations', label: 'Go to Operations' } },
  { id: 'weekly_section', group: 'production', name: 'Weekly Section Report', desc: 'One batch, one week of the month', shows: 'Birds, eggs, feed and sales for a single batch-week', icon: 'calendar-days', needsBatch: true },
  { id: 'mortality', group: 'production', name: 'Mortality Report', desc: 'Losses and rates', shows: 'Losses day by day with rates', icon: 'activity', empty: { text: 'No mortality in this period — good news. Losses appear here automatically from daily logs.', nav: 'operations', label: 'Go to Operations' } },
  { id: 'feed', group: 'production', name: 'Feed Report', desc: 'Purchases and consumption', shows: 'Purchases, stock and weekly mixes', icon: 'wheat', empty: { text: 'No feed purchases in this period. Record them under Operations → Feed.', nav: 'operations', label: 'Go to Operations' } },
  { id: 'health', group: 'production', name: 'Health & Vaccination', desc: 'Schedule compliance and treatments', shows: 'Planned vs completed vaccinations', icon: 'syringe' },
  { id: 'inventory', group: 'production', name: 'Inventory Report', desc: 'Feed and stock levels', shows: 'Feed stock and store items on hand', icon: 'package' },
  { id: 'executive', group: 'overviews', name: 'Executive Summary', desc: 'One-page investor overview', shows: 'Money + production on a single page', icon: 'layout-dashboard' },
  { id: 'audit', group: 'overviews', name: 'Audit Report', desc: 'Transaction package for review', shows: 'Every line item behind the numbers', icon: 'shield-check' }
];

function reportMeta(id) {
  return REPORT_TYPES.find((t) => t.id === id) || { id, name: id, desc: '', shows: '' };
}

function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function isoWeekInput(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fday = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
  const week = 1 + Math.round((t - firstThu) / 604800000);
  return t.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

function localGenerate(type, period) {
  const read = (k) => {
    try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; }
  };
  const capital = read('rmusana_fin_capital');
  const expenses = read('rmusana_fin_expenses');
  const daily = read('rmusana_ops_daily');
  const sales = read('rmusana_ops_sales');
  const feedInv = read('rmusana_ops_feedInv');
  const feedPurch = read('rmusana_ops_feed');
  const invItems = read('rmusana_ops_inventory');
  const profitRows = read('rmusana_fin_profit');
  const healthEv = read('rmusana_ops_health');
  const sched = read('rmusana_ops_schedule');
  const mixes = read('rmusana_ops_weeklyMix');

  const key10 = (v) => String(v || '').slice(0, 10);
  const isoWeekOfKey = (k) => {
    const p = String(k).split('-');
    const d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
    if (isNaN(d)) return '';
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    const f = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const fd = (f.getUTCDay() + 6) % 7;
    f.setUTCDate(f.getUTCDate() - fd + 3);
    return d.getUTCFullYear() + '-W' + String(1 + Math.round((d - f) / 604800000)).padStart(2, '0');
  };
  const inPeriodEx = (rows, field = 'Date') =>
    rows.filter((r) => {
      const k = key10(r[field] || r.date || '');
      if (/^\d{4}-W\d{2}$/.test(period)) return isoWeekOfKey(k) === period;
      return k.indexOf(period) === 0;
    });

  const inPeriod = (rows, field = 'Date') =>
    rows.filter((r) => String(r[field] || r.date || '').startsWith(period));

  const sum = (rows, key) => rows.reduce((s, r) => s + Number(r[key] || r[key?.toLowerCase?.()] || 0), 0);

  if (type === 'monthly_statement') {
    const pc = inPeriod(capital);
    const pe = inPeriod(expenses);
    const pd = inPeriod(daily);
    const ps = inPeriod(sales);
    const cumCap = sum(capital, 'Amount') || capital.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
    const cumExp = expenses.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
    return {
      title: 'Monthly Investment Statement',
      period,
      contributionsReceived: pc.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0),
      cumulativeContributions: cumCap,
      expendituresIncurred: pe.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0),
      cumulativeExpenditures: cumExp,
      outstandingFunding: Math.max(0, 55120422 - cumCap),
      production: {
        days: pd.length,
        eggs: pd.reduce((s, r) => s + Number(r.EggsCollected || r.eggsCollected || 0), 0),
        mortality: pd.reduce((s, r) => s + Number(r.Mortality || r.mortality || 0), 0)
      },
      sales: {
        count: ps.length,
        revenue: ps.reduce((s, r) => s + Number(r.TotalRevenue || r.totalRevenue || 0), 0)
      },
      capitalLines: pc,
      expenseLines: pe,
      note: 'Prepared under Monthly statement. Due by the 10th of the following month.'
    };
  }

  if (type === 'executive') {
    const cumCap = capital.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
    const cumExp = expenses.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
    const pd = inPeriod(daily);
    return {
      title: 'Executive Summary',
      period,
      financial: {
        totalInvestment: cumCap,
        totalExpenses: cumExp,
        netProfitToInvestor: 0,
        roi: 0,
        commercialReached: false
      },
      production: {
        eggs: pd.reduce((s, r) => s + Number(r.EggsCollected || r.eggsCollected || 0), 0),
        mortality: pd.reduce((s, r) => s + Number(r.Mortality || r.mortality || 0), 0),
        days: pd.length
      },
      healthNote: 'Log operations regularly to keep reports up to date.'
    };
  }

  if (type === 'production') {
    const pd = inPeriod(daily);
    return {
      title: 'Production Report',
      period,
      days: pd.length,
      totalEggs: pd.reduce((s, r) => s + Number(r.EggsCollected || r.eggsCollected || 0), 0),
      totalMortality: pd.reduce((s, r) => s + Number(r.Mortality || r.mortality || 0), 0),
      totalFeedKg: pd.reduce((s, r) => {
        const issued = Number(r.FeedIssuedKg ?? r.feedIssuedKg) || 0;
        if (issued > 0) return s + issued;
        return s + ['FeedBrandKg', 'FeedConcentrateKg', 'FeedHendrixKg', 'FeedLimePowderKg', 'FeedLimestoneKg', 'FeedLimeKg', 'FeedSoyaKg', 'FeedSunflowerKg', 'FeedBrokenKg', 'FeedMaizeKg', 'FeedOthersKg']
          .reduce((t, k) => t + Number(r[k] || r[k.charAt(0).toLowerCase() + k.slice(1)] || 0), 0);
      }, 0),
      records: pd
    };
  }

  if (type === 'expense') {
    const pe = inPeriodEx(expenses);
    const byCategory = {};
    pe.forEach((r) => {
      const c = r.Category || r.category || 'Other';
      byCategory[c] = (byCategory[c] || 0) + Number(r.Amount || r.amount || 0);
    });
    return {
      title: 'Expense Report', period,
      total: pe.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0),
      byCategory, lines: pe
    };
  }

  if (type === 'revenue') {
    const ps = inPeriodEx(sales);
    return {
      title: 'Revenue Report', period,
      total: ps.reduce((s, r) => s + Number(r.TotalRevenue || r.totalRevenue || 0), 0),
      count: ps.length, lines: ps
    };
  }

  if (type === 'mortality') {
    const lines = inPeriodEx(daily).filter((r) => Number(r.Mortality || r.mortality || 0) > 0);
    return {
      title: 'Mortality Report', period,
      total: lines.reduce((s, r) => s + Number(r.Mortality || r.mortality || 0), 0),
      lines
    };
  }

  if (type === 'feed') {
    const pp = inPeriodEx(feedPurch);
    return {
      title: 'Feed Report', period,
      purchases: pp,
      inventory: feedInv,
      purchaseTotal: pp.reduce((s, r) => s + Number(r.TotalCost || r.totalCost || (Number(r.QtyKg || r.qtyKg || 0) * Number(r.UnitCost || r.unitCost || 0))) , 0),
      weeklyMixTotalKg: mixes.reduce((s, r) => s + Number(r.TotalKg || r.totalKg || 0), 0),
      weeklyMixes: mixes
    };
  }

  if (type === 'inventory') {
    return { title: 'Inventory Report', period, feed: feedInv, items: invItems };
  }

  if (type === 'profit') {
    const lines = profitRows.filter((r) => String(r.Month || r.month || '').indexOf(period) === 0);
    return {
      title: 'Profit Distribution', period, lines,
      paid: lines.filter((d) => (d.Status || d.status) === 'Paid').reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0),
      pending: lines.filter((d) => (d.Status || d.status) !== 'Paid').reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0)
    };
  }

  if (type === 'audit') {
    return {
      title: 'Audit Report', period,
      note: 'Transaction package for the selected period.',
      capital: inPeriodEx(capital), expenses: inPeriodEx(expenses),
      sales: inPeriodEx(sales), productionDays: inPeriodEx(daily).length
    };
  }

  if (type === 'health') {
    const today = new Date().toISOString().slice(0, 10);
    const lines = sched.map((s) => {
      const planned = key10(s.PlannedDate || s.plannedDate || '');
      const done = (s.Status || s.status) === 'Completed';
      return {
        Week: s.Week ?? s.week, Vaccine: s.Vaccine || s.vaccine,
        PlannedDate: planned, ActualDate: key10(s.ActualDate || s.actualDate || ''),
        Status: done ? 'Completed' : (planned !== '' && planned < today ? 'Overdue' : 'Pending')
      };
    });
    return {
      title: 'Health & Vaccination Compliance', period,
      scheduled: lines.length,
      completed: lines.filter((l) => l.Status === 'Completed').length,
      overdue: lines.filter((l) => l.Status === 'Overdue').length,
      treatments: inPeriodEx(healthEv).length,
      lines
    };
  }

  if (type === 'capital_statement') {
    const pc = inPeriodEx(capital);
    const cum = capital.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
    return {
      title: 'Capital Contribution Statement', period,
      received: pc.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0),
      cumulative: cum, budgetTotal: 55120422,
      outstanding: Math.max(0, 55120422 - cum), lines: pc
    };
  }

  if (type === 'forecast') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const recent = (rows, f) => rows.filter((r) => new Date(key10(r.Date || r.date || '')) >= cutoff);
    const rev30 = recent(sales).reduce((s, r) => s + Number(r.TotalRevenue || r.totalRevenue || 0), 0);
    const exp30 = recent(expenses).reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
    return {
      title: 'Forecast', period, horizonDays: 90,
      projectedRevenue: Math.round(rev30 / 30 * 90),
      projectedExpenses: Math.round(exp30 / 30 * 90),
      projectedNetProfit: 0,
      fundingRequired: Math.max(0, Math.round(exp30 / 30 * 90 - rev30 / 30 * 90))
    };
  }

  if (type === 'weekly_section') {
    return { title: 'Weekly Section Report', period, note: 'Weekly section reporting needs the online service.' };
  }

  return { title: REPORT_TYPES.find((t) => t.id === type)?.name || type, period, note: 'Report data will expand as records accumulate.' };
}

function buildPreviewHtml(type, data, period) {
  const dstr = (v) => String(v || '').slice(0, 10);
  const esc = (v) => String(v ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const meta = reportMeta(type);
  // Detail table with cap + helpful empty state (also prints into the PDF)
  const linesTable = (title, headers, rows, mapFn) => {
    rows = rows || [];
    let html = '<h3 class="u-text-sm u-font-semibold" style="margin:var(--space-4) 0 var(--space-2)">' + esc(title) + ' (' + rows.length + ')</h3>';
    if (!rows.length) {
      const em = meta.empty;
      html += '<div class="empty-state" style="padding:12px"><p class="empty-state-desc">' + esc(em?.text || 'No records in this period.') + '</p>';
      if (em?.nav) html += '<button class="btn btn-secondary btn-sm" style="margin-top:8px" data-nav="' + em.nav + '">' + esc(em.label || 'Add records') + '</button>';
      html += '</div>';
      return html;
    }
    const shown = rows.slice(0, 25);
    html += '<div class="table-wrap"><table class="data-table"><thead><tr>' + headers.map((h) => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
      shown.map((r) => '<tr>' + mapFn(r).map((c) => '<td>' + esc(c ?? '—') + '</td>').join('') + '</tr>').join('') +
      '</tbody></table></div>';
    if (rows.length > shown.length) html += '<p class="u-text-xs u-text-muted">Showing 25 of ' + rows.length + ' lines — the printed PDF carries the same detail.</p>';
    return html;
  };
  const fmt = (n) => formatUGX(n).replace('UGX', '').trim();
  let body = `<h2 style="margin:0 0 4px">${data.title || type}</h2>
    <p class="u-text-xs u-text-muted" style="margin-bottom:var(--space-4)">Period: ${period} · LUK54 Flock</p>`;

  if (type === 'monthly_statement') {
    body += `
      <div class="kpi-grid" style="margin-bottom:var(--space-4)">
        <div class="card kpi-card"><div class="kpi-label">Contributions (period)</div><div class="kpi-value" style="font-size:var(--text-lg)">${formatUGX(data.contributionsReceived)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Cumulative contributions</div><div class="kpi-value" style="font-size:var(--text-lg)">${formatUGX(data.cumulativeContributions)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Expenditures (period)</div><div class="kpi-value" style="font-size:var(--text-lg)">${formatUGX(data.expendituresIncurred)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Cumulative expenditures</div><div class="kpi-value" style="font-size:var(--text-lg)">${formatUGX(data.cumulativeExpenditures)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Outstanding funding</div><div class="kpi-value" style="font-size:var(--text-lg)">${formatUGX(data.outstandingFunding)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Sales revenue</div><div class="kpi-value" style="font-size:var(--text-lg)">${formatUGX(data.sales?.revenue)}</div></div>
      </div>
      <p class="u-text-sm u-text-secondary">Production: ${data.production?.days || 0} days · ${formatNumber(data.production?.eggs)} eggs · ${formatNumber(data.production?.mortality)} mortality</p>
      <p class="u-text-xs u-text-muted" style="margin-top:var(--space-4)">${data.note || ''}</p>`;
  } else if (type === 'executive') {
    const f = data.financial || {};
    body += `
      <div class="kpi-grid">
        <div class="card kpi-card"><div class="kpi-label">Investment</div><div class="kpi-value">${formatUGX(f.totalInvestment)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Expenses</div><div class="kpi-value">${formatUGX(f.totalExpenses)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Net profit</div><div class="kpi-value">${formatUGX(f.netProfitToInvestor)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">ROI</div><div class="kpi-value">${f.roi || 0}%</div></div>
        <div class="card kpi-card"><div class="kpi-label">Eggs (period)</div><div class="kpi-value">${formatNumber(data.production?.eggs)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Mortality</div><div class="kpi-value">${formatNumber(data.production?.mortality)}</div></div>
      </div>
      <p class="u-text-sm u-text-secondary" style="margin-top:var(--space-4)">${data.healthNote || ''}</p>`;
  } else if (type === 'weekly_section') {
    body +=
      '<p class="u-text-sm u-text-secondary">Week ' + (data.week || '') +
      ' · Section ' + (data.section || 'all') +
      ' · ' + (data.weekStartDisplay || data.weekStart || '') +
      ' – ' + (data.weekEndDisplay || data.weekEnd || '') + '</p>' +
      '<div class="kpi-grid">' +
      '<div class="card kpi-card"><div class="kpi-label">Days logged</div><div class="kpi-value">' + (data.daysLogged || 0) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Opening birds</div><div class="kpi-value">' + formatNumber(data.openingBirds) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Closing birds</div><div class="kpi-value">' + formatNumber(data.closingBirds) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Eggs (trays)</div><div class="kpi-value">' + formatNumber(data.eggsTrays, 1) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Mortality</div><div class="kpi-value">' + formatNumber(data.totalMortality) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Feed (kg)</div><div class="kpi-value">' + formatNumber(data.totalFeedKg, 1) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Prod %</div><div class="kpi-value">' + (data.productionPct != null ? data.productionPct + '%' : '—') + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Sales revenue</div><div class="kpi-value">' + formatUGX(data.salesRevenue) + '</div></div>' +
      '</div>' +
      (data.generatedAt ? '<p class="u-text-xs u-text-muted" style="margin-top:var(--space-3)">Generated ' + data.generatedAt + '</p>' : '');
  } else if (type === 'production') {
    body += `
      <div class="kpi-grid">
        <div class="card kpi-card"><div class="kpi-label">Days</div><div class="kpi-value">${data.days || 0}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Eggs</div><div class="kpi-value">${formatNumber(data.totalEggs)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Mortality</div><div class="kpi-value">${formatNumber(data.totalMortality)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Feed (kg)</div><div class="kpi-value">${formatNumber(data.totalFeedKg, 1)}</div></div>
      </div>`;
  } else if (type === 'financial' && data.summary) {
    const s = data.summary;
    const a = data.allocation || {};
    body += `
      <div class="kpi-grid">
        <div class="card kpi-card"><div class="kpi-label">Investment</div><div class="kpi-value">${formatUGX(s.totalInvestment)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Net profit</div><div class="kpi-value">${formatUGX(s.netProfitToInvestor)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Feed allocation</div><div class="kpi-value">${formatUGX(a.feedAllocation)}</div></div>
        <div class="card kpi-card"><div class="kpi-label">Operator share</div><div class="kpi-value">${formatUGX(a.operatingPartnerShare)}</div></div>
      </div>`;
  } else if (type === 'feed') {
    body +=
      '<div class="kpi-grid">' +
      '<div class="card kpi-card"><div class="kpi-label">Purchases total</div><div class="kpi-value">' + formatUGX(data.purchaseTotal) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Purchased (kg)</div><div class="kpi-value">' + formatNumber(data.totalPurchasedKg, 1) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Issued (kg)</div><div class="kpi-value">' + formatNumber(data.totalIssuedKg, 1) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Weekly mix (kg)</div><div class="kpi-value">' + formatNumber(data.weeklyMixTotalKg, 1) + '</div></div>' +
      '</div>';
    if (data.purchases && data.purchases.length) {
      body += '<p class="u-text-sm u-font-semibold" style="margin-top:var(--space-4)">Purchases: ' + data.purchases.length + ' lines</p>';
    }
    if (data.weeklyMixes && data.weeklyMixes.length) {
      body += '<p class="u-text-sm">Weekly formulations logged: ' + data.weeklyMixes.length + '</p>';
    }
  } else if (type === 'health') {
    body +=
      '<div class="kpi-grid">' +
      '<div class="card kpi-card"><div class="kpi-label">Scheduled</div><div class="kpi-value">' + (data.scheduled || 0) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Completed</div><div class="kpi-value">' + (data.completed || 0) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Overdue</div><div class="kpi-value">' + (data.overdue || 0) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Treatments logged</div><div class="kpi-value">' + (data.treatments || 0) + '</div></div>' +
      '</div>';
    body += linesTable('Schedule', ['Week', 'Vaccine', 'Planned', 'Actual', 'Status'], data.lines, (r) => [
      r.Week ?? r.week ?? '—', r.Vaccine || r.vaccine || '—', dstr(r.PlannedDate || r.plannedDate),
      dstr(r.ActualDate || r.actualDate), r.Status || r.status || '—'
    ]);
  } else if (type === 'capital_statement') {
    body +=
      '<div class="kpi-grid">' +
      '<div class="card kpi-card"><div class="kpi-label">Received (period)</div><div class="kpi-value">' + formatUGX(data.received) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Cumulative</div><div class="kpi-value">' + formatUGX(data.cumulative) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Outstanding</div><div class="kpi-value">' + formatUGX(data.outstanding) + '</div></div>' +
      '</div>';
    body += linesTable('Contributions', ['Date', 'Amount', 'Purpose', 'Reference'], data.lines, (r) => [
      dstr(r.Date || r.date), formatUGX(r.Amount ?? r.amount), r.Purpose || r.purpose || '—', r.Reference || r.reference || '—'
    ]);
  } else if (type === 'forecast') {
    body +=
      '<div class="kpi-grid">' +
      '<div class="card kpi-card"><div class="kpi-label">Horizon</div><div class="kpi-value">' + (data.horizonDays || 0) + ' days</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Projected revenue</div><div class="kpi-value">' + formatUGX(data.projectedRevenue) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Projected expenses</div><div class="kpi-value">' + formatUGX(data.projectedExpenses) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Projected net</div><div class="kpi-value">' + formatUGX(data.projectedNetProfit) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Funding required</div><div class="kpi-value">' + formatUGX(data.fundingRequired) + '</div></div>' +
      '</div>';
  } else if (type === 'profit') {
    body += '<div class="kpi-grid"><div class="card kpi-card"><div class="kpi-label">Paid</div><div class="kpi-value">' + formatUGX(data.paid) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Pending</div><div class="kpi-value">' + formatUGX(data.pending) + '</div></div></div>';
    body += linesTable('Distributions', ['Month', 'Amount', 'Status', 'Paid date', 'Reference'], data.lines, (r) => [
      dstr(r.Month || r.month), formatUGX(r.Amount ?? r.amount), r.Status || r.status || 'Pending',
      dstr(r.PaidDate || r.paidDate), r.Reference || r.reference || '—'
    ]);
  } else if (type === 'audit') {
    body += '<div class="kpi-grid">' +
      '<div class="card kpi-card"><div class="kpi-label">Capital lines</div><div class="kpi-value">' + ((data.capital || []).length) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Expense lines</div><div class="kpi-value">' + ((data.expenses || []).length) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Sales lines</div><div class="kpi-value">' + ((data.sales || []).length) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Production days</div><div class="kpi-value">' + (data.productionDays || 0) + '</div></div>' +
      '</div>' + (data.note ? '<p class="u-text-sm u-text-secondary" style="margin-top:var(--space-3)">' + data.note + '</p>' : '');
    body += linesTable('Capital', ['Date', 'Amount', 'Purpose'], data.capital, (r) => [
      dstr(r.Date || r.date), formatUGX(r.Amount ?? r.amount), r.Purpose || r.purpose || '—'
    ]);
    body += linesTable('Expenses', ['Date', 'Category', 'Amount'], data.expenses, (r) => [
      dstr(r.Date || r.date), r.Category || r.category || '—', formatUGX(r.Amount ?? r.amount)
    ]);
    body += linesTable('Sales', ['Date', 'Customer', 'Revenue'], data.sales, (r) => [
      dstr(r.Date || r.date), r.Customer || r.customer || '—', formatUGX(r.TotalRevenue ?? r.totalRevenue)
    ]);
  } else if (type === 'expense') {
    const byCat = data.byCategory || {};
    body += '<div class="kpi-grid"><div class="card kpi-card"><div class="kpi-label">Total expenses</div><div class="kpi-value">' + formatUGX(data.total != null ? data.total : data.totalExpenses) + '</div></div></div>';
    const cats = Object.keys(byCat);
    if (cats.length) {
      body += '<h3 class="u-text-sm u-font-semibold" style="margin:var(--space-4) 0 var(--space-2)">By category</h3><div class="table-wrap"><table class="data-table"><tbody>' +
        cats.map((c) => '<tr><td>' + c.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</td><td style="text-align:right">' + formatUGX(byCat[c]) + '</td></tr>').join('') +
        '</tbody></table></div>';
    }
    body += linesTable('Lines', ['Date', 'Category', 'Detail', 'Amount', 'Supplier'], data.lines, (r) => [
      dstr(r.Date || r.date), r.Category || r.category || '—', r.SubCategory || r.subCategory || '—',
      formatUGX(r.Amount ?? r.amount), r.Supplier || r.supplier || '—'
    ]);
  } else if (type === 'revenue') {
    body += '<div class="kpi-grid"><div class="card kpi-card"><div class="kpi-label">Revenue</div><div class="kpi-value">' + formatUGX(data.total != null ? data.total : data.revenue) + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Sales</div><div class="kpi-value">' + (data.count || (data.lines || []).length) + '</div></div></div>';
    body += linesTable('Lines', ['Date', 'Customer', 'Trays', 'Revenue', 'Payment'], data.lines, (r) => [
      dstr(r.Date || r.date), r.Customer || r.customer || '—',
      formatNumber(r.QuantityTrays ?? r.quantityTrays, 1),
      formatUGX(r.TotalRevenue ?? r.totalRevenue), r.PaymentStatus || r.paymentStatus || '—'
    ]);
  } else if (type === 'mortality') {
    body += '<div class="kpi-grid"><div class="card kpi-card"><div class="kpi-label">Total mortality</div><div class="kpi-value">' + formatNumber(data.total) + '</div></div></div>';
    body += linesTable('Lines', ['Date', 'Deaths', 'Opening', 'Rate %'], data.lines, (r) => [
      dstr(r.Date || r.date), formatNumber(r.Mortality ?? r.mortality),
      formatNumber(r.OpeningBirds ?? r.openingBirds), r.Rate != null ? r.Rate + '%' : '—'
    ]);
  } else if (type === 'inventory') {
    const feed = data.feed || [];
    const items = data.items || [];
    body += '<div class="kpi-grid"><div class="card kpi-card"><div class="kpi-label">Feed products</div><div class="kpi-value">' + feed.length + '</div></div>' +
      '<div class="card kpi-card"><div class="kpi-label">Store items</div><div class="kpi-value">' + items.length + '</div></div></div>';
    body += linesTable('Feed stock', ['Product', 'Stock (kg)', 'Unit cost'], feed, (r) => [
      r.Product || r.product || '—', formatNumber(r.ClosingStock ?? r.closingStock, 1), formatUGX(r.UnitCost ?? r.unitCost)
    ]);
    body += linesTable('Store items', ['Name', 'Quantity', 'Unit'], items, (r) => [
      r.Name || r.name || '—', formatNumber(r.Quantity ?? r.quantity), r.Unit || r.unit || '—'
    ]);
  } else {
    if (data.note) body += '<p class="u-text-sm u-text-secondary">' + data.note + '</p>';
    if (data.total != null) body += '<p class="u-font-semibold">Total: ' + formatUGX(data.total) + '</p>';
    if (!data.note && data.total == null && data.title) {
      body += '<p class="u-text-sm u-text-secondary">Summary generated for this period.</p>';
    }
  }
  return body;
}

export default {
  lastResult: null,
  selectedType: 'monthly_statement',

  async render(root) {
    this.root = root;
    root.innerHTML = `
      <div class="page-header">
        <div class="page-header-title">
          <div class="breadcrumb"><span>Main</span><span>/</span><span>Reports</span></div>
          <h1>Reports</h1>
          <p class="u-text-secondary u-text-sm">Generate, preview, print and email statements</p>
        </div>
        <div class="page-header-actions" style="display:flex;gap:var(--space-2);flex-wrap:wrap;align-items:center">
          <label class="u-text-xs u-text-muted" for="report-granularity">Step 2 · Period</label>
          <select class="form-input" id="report-granularity" style="width:auto;height:36px">
            <option value="week">Weekly</option>
            <option value="month" selected>Monthly</option>
            <option value="year">Yearly</option>
          </select>
          <input type="week" class="form-input" id="report-period-week" style="width:auto;height:36px;display:none" />
          <input type="month" class="form-input" id="report-period" value="${currentMonth()}" style="width:auto;height:36px" />
          <input type="number" class="form-input" id="report-period-year" min="2024" max="2100" value="${new Date().getFullYear()}" style="width:100px;height:36px;display:none" />
          <span id="batch-controls" style="display:none;gap:var(--space-2);flex-wrap:wrap;align-items:center">
            <select class="form-input" id="report-week-num" style="width:auto;height:36px" title="Week of month for batch report">
              <option value="1">Week 1</option>
              <option value="2">Week 2</option>
              <option value="3">Week 3</option>
              <option value="4">Week 4</option>
              <option value="5">Week 5</option>
            </select>
            <select class="form-input" id="report-section" style="width:auto;height:36px" title="Batch / section">
              <option value="all">All sections</option>
              <option value="A">Section A</option>
              <option value="B">Section B</option>
              <option value="C">Section C</option>
              <option value="Others">Others</option>
            </select>
          </span>
        </div>
      </div>

      <div class="card" style="padding:16px; margin-bottom:16px; background: linear-gradient(135deg, var(--color-bg-elevated), var(--color-bg-subtle)); border:1px solid var(--color-border);">
        <div style="display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin-bottom:12px">
          <div style="display:flex; gap:8px; align-items:center; font-size:12px; color:var(--color-text-secondary)"><span class="badge badge-accent">1</span> Pick a report below</div>
          <div style="display:flex; gap:8px; align-items:center; font-size:12px; color:var(--color-text-secondary)"><span class="badge badge-accent">2</span> Set the period above</div>
          <div style="display:flex; gap:8px; align-items:center; font-size:12px; color:var(--color-text-secondary)"><span class="badge badge-accent">3</span> Preview, then Print / Email</div>
        </div>
        <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap">
          <div style="width:44px;height:44px; border-radius:12px; background: var(--color-accent); color:#fff; display:grid; place-items:center; flex-shrink:0"><i data-lucide="file-bar-chart" style="width:22px;height:22px"></i></div>
          <div style="flex:1; min-width:200px"><div style="font-weight:700; font-size:14px">Monthly Investment Statement</div><div class="u-text-xs u-text-muted">The standard month-end pack — start here. Period: <strong id="hero-period">${currentMonth()}</strong></div></div>
          <button class="btn btn-primary btn-sm" id="btn-recommended">Generate</button>
        </div>
      </div>

      <style>
        .card[data-report]{ transition: transform 160ms var(--ease-out), box-shadow 160ms var(--ease-out), border-color 160ms; }
        .card[data-report]:hover{ transform: translateY(-3px); box-shadow: var(--shadow-md); border-color: var(--color-accent); }
        .card[data-report]:active{ transform: translateY(-1px); }
        .card[data-report].selected{ border-color: var(--color-accent); box-shadow: var(--shadow-md); }
      </style>

      ${REPORT_GROUPS.map((g) => `
        <h3 class="u-text-sm u-font-semibold" style="margin:0 0 4px">${g.label} <span class="u-text-xs u-text-muted" style="font-weight:400">· ${g.hint}</span></h3>
        <div class="kpi-grid" style="margin-bottom:var(--space-5)">
          ${REPORT_TYPES.filter((t) => t.group === g.id).map((t) => `
            <button class="card ${this.selectedType === t.id ? 'selected' : ''}" data-report="${t.id}" style="padding:var(--space-4);text-align:left;cursor:pointer;border:1px solid var(--color-border);background:var(--color-bg-elevated); position:relative; overflow:hidden">
              <div style="display:flex;align-items:center;gap:var(--space-3)">
                <div style="width:40px;height:40px;border-radius:var(--radius-md);background:var(--color-accent-soft);color:var(--color-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                  <i data-lucide="${t.icon}" style="width:20px;height:20px"></i>
                </div>
                <div>
                  <div class="u-font-semibold u-text-sm">${t.name}</div>
                  <div class="u-text-xs u-text-muted">${t.desc}</div>
                  <div class="u-text-xs" style="color:var(--color-accent);margin-top:2px">Shows: ${t.shows}</div>
                </div>
              </div>
            </button>
          `).join('')}
        </div>
      `).join('')}

      <div class="card" id="report-preview-wrap" style="display:none">
        <div class="card-header">
          <h3 id="preview-title">Preview</h3>
          <div style="display:flex;gap:var(--space-2)">
            <button class="btn btn-secondary btn-sm" id="btn-print">Print / PDF</button>
            ${canApprove() ? '<button class="btn btn-primary btn-sm" id="btn-email">Email</button>' : ''}
          </div>
        </div>
        <div class="card-body" id="report-preview"></div>
      </div>
    `;

    const markSelected = (type) => {
      this.selectedType = type;
      root.querySelectorAll('[data-report]').forEach((b) => {
        b.classList.toggle('selected', b.dataset.report === type);
      });
      const bc = root.querySelector('#batch-controls');
      if (bc) bc.style.display = type === 'weekly_section' ? 'inline-flex' : 'none';
    };

    root.querySelectorAll('[data-report]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        markSelected(btn.dataset.report);
        this.generate(btn.dataset.report, btn);
      });
    });

    root.querySelector('#btn-recommended')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      markSelected('monthly_statement');
      this.generate('monthly_statement', btn);
    });

    
    const granSel = root.querySelector('#report-granularity');
    const syncPeriodInputs = () => {
      const g = granSel?.value || 'month';
      const w = root.querySelector('#report-period-week');
      const m = root.querySelector('#report-period');
      const y = root.querySelector('#report-period-year');
      if (w) w.style.display = g === 'week' ? '' : 'none';
      if (m) m.style.display = g === 'month' ? '' : 'none';
      if (y) y.style.display = g === 'year' ? '' : 'none';
    };
    granSel?.addEventListener('change', syncPeriodInputs);
    syncPeriodInputs();
    if (root.querySelector('#report-period-week') && !root.querySelector('#report-period-week').value) {
      root.querySelector('#report-period-week').value = isoWeekInput(new Date());
    }

    root.querySelector('#btn-print')?.addEventListener('click', () => this.print());
    root.querySelector('#btn-email')?.addEventListener('click', () => this.email());

    if (window.lucide) window.lucide.createIcons({ nodes: [root] });
  },

  async generate(type, btn) {
    this.selectedType = type;
    this.root.querySelectorAll('[data-report]').forEach((b) => {
      b.classList.toggle('selected', b.dataset.report === type);
    });
    const bc = this.root.querySelector('#batch-controls');
    if (bc) bc.style.display = type === 'weekly_section' ? 'inline-flex' : 'none';
    const gran = this.root.querySelector('#report-granularity')?.value || 'month';
    let period = currentMonth();
    if (gran === 'week') {
      period = this.root.querySelector('#report-period-week')?.value || isoWeekInput(new Date());
    } else if (gran === 'year') {
      period = String(this.root.querySelector('#report-period-year')?.value || new Date().getFullYear());
    } else {
      period = this.root.querySelector('#report-period')?.value || currentMonth();
    }
    const hero = this.root.querySelector('#hero-period');
    if (hero) hero.textContent = period;
    const week = this.root.querySelector('#report-week-num')?.value || '1';
    const section = this.root.querySelector('#report-section')?.value || 'all';
    const wrap = this.root.querySelector('#report-preview-wrap');
    const preview = this.root.querySelector('#report-preview');
    const title = this.root.querySelector('#preview-title');
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.style.opacity = '0.55';
    }
    wrap.style.display = 'block';
    preview.innerHTML = '<div class="skeleton" style="height:160px"></div>';
    title.textContent = (REPORT_TYPES.find((t) => t.id === type)?.name || type) +
      (type === 'weekly_section' ? (' · W' + week + ' · ' + section) : '');

    try {
      let data;
      let html = null;
      if (window.RMUSANA_API_URL) {
        const res = await api.request('/reports', {
          body: {
            module: 'reports',
            action: 'generate',
            type: type,
            reportType: type,
            period: period,
            week: Number(week),
            section: section,
            projectId: 'LUK54'
          }
        });
        // Apps Script returns { success, data: { report, html, type, period } }
        const payload = res.data || res;
        data = payload.report || payload;
        html = payload.html || null;
        this.lastResult = { type: type, period: period, week: week, section: section, report: data, html: html };
      } else {
        data = localGenerate(type, period);
        this.lastResult = { type, period, week, section, report: data, html: null };
      }
      if (!data || typeof data !== 'object') data = { title: type };
      preview.innerHTML = buildPreviewHtml(type, data, period);
      if (html) {
        this.lastResult.html = html;
      }
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toastSuccess('Report generated');
    } catch (err) {
      preview.innerHTML = '<div class="empty-state"><p class="empty-state-desc">' + (err.message || 'Failed') + '</p></div>';
      toastError(err.message || 'Generate failed');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.style.opacity = '';
      }
    }
  },

  print() {
    if (!this.lastResult) {
      toastError('Generate a report first');
      return;
    }
    const preview = this.root.querySelector('#report-preview');
    const title = this.root.querySelector('#preview-title')?.textContent || 'LUK54 Report';
    const bodyHtml = preview ? preview.innerHTML : '';
    if (!bodyHtml || bodyHtml.indexOf('skeleton') >= 0) {
      toastError('Generate a report first');
      return;
    }
    const w = window.open('', '_blank');
    if (!w) {
      toastError('Pop-up blocked. Allow pop-ups to print.');
      return;
    }
    const doc = w.document;
    doc.open();
    doc.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
      title.replace(/</g, '') +
      '</title><style>' +
      'body{font-family:system-ui,-apple-system,sans-serif;padding:32px;max-width:860px;margin:0 auto;color:#111;line-height:1.45}' +
      'h1,h2,h3{margin:0 0 12px} .kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin:16px 0}' +
      '.kpi-card,.card{border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px}' +
      '.kpi-label{font-size:12px;color:#6b7280;margin-bottom:4px}' +
      '.kpi-value{font-size:20px;font-weight:700}' +
      'p{margin:8px 0} table{width:100%;border-collapse:collapse;margin-top:16px}' +
      'th,td{border:1px solid #e5e7eb;padding:8px;text-align:left;font-size:13px}' +
      '@media print{body{padding:12px}}' +
      '</style></head><body>' +
      '<h1>' + title.replace(/</g, '') + '</h1>' +
      bodyHtml +
      '</body></html>'
    );
    doc.close();
    setTimeout(function () { w.focus(); w.print(); }, 350);
  },

  async email() {
    if (!this.lastResult) {
      toastError('Generate a report first');
      return;
    }
    const email = prompt('Send report to email address:');
    if (!email) return;
    try {
      if (window.RMUSANA_API_URL) {
        await api.request('/reports', {
          body: {
            module: 'reports',
            action: 'email',
            type: this.lastResult.type,
            period: this.lastResult.period,
            to: email
          }
        });
        toastSuccess('Report emailed to ' + email);
      } else {
        // Fallback: mailto with summary
        const subject = encodeURIComponent('LUK54 Report · ' + (this.lastResult.period || ''));
        const body = encodeURIComponent('Please find the LUK54 report for period ' + this.lastResult.period + '.\n\n(Configure Apps Script Gmail for full HTML delivery.)');
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        toastSuccess('Opening mail client');
      }
    } catch (err) {
      toastError(err.message || 'Email failed');
    }
  },

  destroy() {
    this.lastResult = null;
  }
};
