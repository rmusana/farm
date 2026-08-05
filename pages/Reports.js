/**
 * Reports module – generate, preview, print/PDF, email
 */
import { formatUGX, formatNumber } from '../components/KPI.js';
import { toastSuccess, toastError } from '../components/Toast.js';
import { canApprove } from '../js/auth.js';
import api from '../js/api.js';

const REPORT_TYPES = [
  { id: 'monthly_statement', name: 'Monthly Investment Statement', desc: 'Contributions, expenditures and production', icon: 'file-text' },
  { id: 'production', name: 'Production Report', desc: 'Eggs, mortality, feed by day', icon: 'egg' },
  { id: 'financial', name: 'Financial Report', desc: 'Revenue allocation and P&L', icon: 'landmark' },
  { id: 'budget', name: 'Capital vs Disbursed', desc: 'Capital contributed vs amounts spent', icon: 'calculator' },
  { id: 'expense', name: 'Expense Report', desc: 'Expenditures by category', icon: 'receipt' },
  { id: 'revenue', name: 'Revenue Report', desc: 'Egg sales and revenue', icon: 'shopping-cart' },
  { id: 'profit', name: 'Profit Distribution', desc: 'Investor profit payments', icon: 'banknote' },
  { id: 'inventory', name: 'Inventory Report', desc: 'Feed and stock levels', icon: 'package' },
  { id: 'mortality', name: 'Mortality Report', desc: 'Losses and rates', icon: 'activity' },
  { id: 'feed', name: 'Feed Report', desc: 'Purchases and consumption', icon: 'wheat' },
  { id: 'executive', name: 'Executive Summary', desc: 'One-page investor overview', icon: 'layout-dashboard' },
  { id: 'audit', name: 'Audit Report', desc: 'Transaction package for review', icon: 'shield-check' }
];

function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function localGenerate(type, period) {
  const capital = JSON.parse(localStorage.getItem('rmusana_fin_capital') || '[]');
  const expenses = JSON.parse(localStorage.getItem('rmusana_fin_expenses') || '[]');
  const daily = JSON.parse(localStorage.getItem('rmusana_ops_daily') || '[]');
  const sales = JSON.parse(localStorage.getItem('rmusana_ops_sales') || '[]');

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
      outstandingFunding: Math.max(0, 52849172 - cumCap),
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
        return s + ['FeedBrandKg', 'FeedHendrixKg', 'FeedLimeKg', 'FeedSoyaKg', 'FeedSunflowerKg', 'FeedBrokenKg']
          .reduce((t, k) => t + Number(r[k] || 0), 0);
      }, 0),
      records: pd
    };
  }

  return { title: REPORT_TYPES.find((t) => t.id === type)?.name || type, period, note: 'Report data will expand as records accumulate.' };
}

function buildPreviewHtml(type, data, period) {
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
  } else {
    body += `<p class="u-text-sm u-text-secondary">${data.note || 'Report generated. Connect Apps Script for full detail tables and PDF storage.'}</p>`;
    if (data.total != null) body += `<p class="u-font-semibold">Total: ${formatUGX(data.total)}</p>`;
  }
  return body;
}

export default {
  lastResult: null,

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
          <select class="form-input" id="report-granularity" style="width:auto;height:36px">
            <option value="week">Weekly</option>
            <option value="month" selected>Monthly</option>
            <option value="year">Yearly</option>
          </select>
          <input type="week" class="form-input" id="report-period-week" style="width:auto;height:36px;display:none" />
          <input type="month" class="form-input" id="report-period" value="${currentMonth()}" style="width:auto;height:36px" />
          <input type="number" class="form-input" id="report-period-year" min="2024" max="2100" value="${new Date().getFullYear()}" style="width:100px;height:36px;display:none" />
        </div>
      </div>

      <div class="kpi-grid" id="report-cards" style="margin-bottom:var(--space-6)">
        ${REPORT_TYPES.map((t) => `
          <button class="card" data-report="${t.id}" style="padding:var(--space-5);text-align:left;cursor:pointer;border:1px solid var(--color-border);background:var(--color-bg-elevated)">
            <div style="display:flex;align-items:center;gap:var(--space-3)">
              <div style="width:40px;height:40px;border-radius:var(--radius-md);background:var(--color-accent-soft);color:var(--color-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i data-lucide="${t.icon}" style="width:20px;height:20px"></i>
              </div>
              <div>
                <div class="u-font-semibold u-text-sm">${t.name}</div>
                <div class="u-text-xs u-text-muted">${t.desc}</div>
              </div>
            </div>
          </button>
        `).join('')}
      </div>

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

    root.querySelectorAll('[data-report]').forEach((btn) => {
      btn.addEventListener('click', () => this.generate(btn.dataset.report));
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

    root.querySelector('#btn-print')?.addEventListener('click', () => this.print());
    root.querySelector('#btn-email')?.addEventListener('click', () => this.email());

    if (window.lucide) window.lucide.createIcons({ nodes: [root] });
  },

  async generate(type) {
    const period = this.root.querySelector('#report-period')?.value || currentMonth();
    const wrap = this.root.querySelector('#report-preview-wrap');
    const preview = this.root.querySelector('#report-preview');
    const title = this.root.querySelector('#preview-title');
    wrap.style.display = 'block';
    preview.innerHTML = `<div class="skeleton" style="height:160px"></div>`;
    title.textContent = REPORT_TYPES.find((t) => t.id === type)?.name || type;

    try {
      let data;
      let html = null;
      if (window.RMUSANA_API_URL) {
        const res = await api.reports.generate({ type, period, action: 'generate', reportType: type });
        data = res.data?.report || res.data;
        html = res.data?.html;
        this.lastResult = res.data;
      } else {
        data = localGenerate(type, period);
        this.lastResult = { type, period, report: data, html: null };
      }
      preview.innerHTML = buildPreviewHtml(type, data, period);
      if (html) {
        this.lastResult.html = html;
      }
      wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toastSuccess('Report generated');
    } catch (err) {
      preview.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
      toastError(err.message || 'Generate failed');
    }
  },

  print() {
    if (!this.lastResult) {
      toastError('Generate a report first');
      return;
    }
    const html = this.lastResult.html || `
      <!DOCTYPE html><html><head><title>RMUSANA Report</title>
      <style>body{font-family:system-ui;padding:32px;max-width:800px;margin:0 auto}</style>
      </head><body>${this.root.querySelector('#report-preview')?.innerHTML || ''}</body></html>`;
    const w = window.open('', '_blank');
    if (!w) {
      toastError('Pop-up blocked. Allow pop-ups to print.');
      return;
    }
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
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
        const subject = encodeURIComponent('RMUSANA Report · ' + (this.lastResult.period || ''));
        const body = encodeURIComponent('Please find the RMUSANA report for period ' + this.lastResult.period + '.\n\n(Configure Apps Script Gmail for full HTML delivery.)');
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
