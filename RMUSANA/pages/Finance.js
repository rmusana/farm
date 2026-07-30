/**
 * Finance module – Capital, Expenses, Budget, Allocation, Profit, ROI, Forecast
 */
import { field, serializeForm, validateRequired } from '../components/Form.js';
import { renderDataTable } from '../components/DataTable.js';
import { openModal, closeModal } from '../components/Modal.js';
import { formatUGX, formatPercent, formatNumber } from '../components/KPI.js';
import { toastSuccess, toastError } from '../components/Toast.js';
import { canApprove, getRole } from '../js/auth.js';
import api from '../js/api.js';

const SECTIONS = [
  { id: 'summary', label: 'Overview' },
  { id: 'capital', label: 'Capital' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'budget', label: 'Budget vs Actual' },
  { id: 'allocation', label: 'Revenue Allocation' },
  { id: 'profit', label: 'Profit Distribution' },
  { id: 'cashflow', label: 'Cash Flow' },
  { id: 'forecast', label: 'Forecasting' }
];

const EXPENSE_CATEGORIES = ['Booking', 'Brooder', 'Feeds', 'Medication', 'Vaccination', 'Labour', 'Utilities', 'Transport', 'Maintenance', 'Equipment', 'Other'];
const CAPITAL_PURPOSES = ['Birds', 'Feed', 'Medication', 'Equipment', 'Brooder', 'General', 'Other'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function localStore(key, value) {
  if (value === undefined) {
    try { return JSON.parse(localStorage.getItem('rmusana_fin_' + key) || '[]'); } catch { return []; }
  }
  localStorage.setItem('rmusana_fin_' + key, JSON.stringify(value));
}

async function finApi(resource, action, payload = {}) {
  if (window.RMUSANA_API_URL) {
    return api.request('/finance', {
      body: { module: 'finance', resource, action, projectId: 'LUK54', ...payload }
    });
  }
  if (resource === 'summary') {
    const capital = localStore('capital').reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
    const expenses = localStore('expenses').reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
    const sales = JSON.parse(localStorage.getItem('rmusana_ops_sales') || '[]');
    const revenue = sales.reduce((s, r) => s + Number(r.TotalRevenue || r.totalRevenue || 0), 0);
    return {
      success: true,
      data: {
        totalInvestment: capital,
        totalExpenses: expenses,
        grossSalesRevenue: revenue,
        commercialReached: false,
        feedAllocation: 0,
        grossProfit: 0,
        operatingPartnerShare: 0,
        netProfitToInvestor: 0,
        profitPaidOut: 0,
        profitPending: 0,
        roi: 0,
        capitalRecovery: 0,
        cashPosition: capital - expenses,
        outstandingFunding: Math.max(0, 52849172 - capital),
        budgetTotal: 52849172,
        budgetActual: expenses,
        budgetVariance: expenses - 52849172
      }
    };
  }
  if (resource === 'budget' && (action === 'status' || action === 'seed')) {
    let lines = localStore('budget');
    if (!lines.length) {
      lines = [
        { Category: 'Booking', SubItem: '2,500 Birds', BudgetTotal: 13000000, ActualTotal: 0 },
        { Category: 'Brooder', SubItem: 'Brooder package', BudgetTotal: 4215000, ActualTotal: 0 },
        { Category: 'Feeds', SubItem: '6-month estimated feed', BudgetTotal: 35634172, ActualTotal: 0 },
        { Category: 'Medication', SubItem: 'Common meds', BudgetTotal: 500000, ActualTotal: 0 },
        { Category: 'Vaccination', SubItem: 'Schedule vaccines', BudgetTotal: 400000, ActualTotal: 0 }
      ];
      localStore('budget', lines);
    }
    const totalBudget = lines.reduce((s, l) => s + Number(l.BudgetTotal || 0), 0);
    const totalActual = lines.reduce((s, l) => s + Number(l.ActualTotal || 0), 0);
    return {
      success: true,
      data: { lines, totalBudget, totalActual, variance: totalActual - totalBudget, variancePct: totalBudget ? Math.round((totalActual - totalBudget) / totalBudget * 1000) / 10 : 0 }
    };
  }
  if (resource === 'allocation' && action === 'compute') {
    const sales = JSON.parse(localStorage.getItem('rmusana_ops_sales') || '[]');
    const month = payload.month || currentMonth();
    const gross = sales.filter((r) => String(r.Date || r.date || '').startsWith(month))
      .reduce((s, r) => s + Number(r.TotalRevenue || r.totalRevenue || 0), 0);
    return {
      success: true,
      data: {
        month, commercialReached: false, grossSalesRevenue: gross,
        feedAllocation: 0, grossProfit: 0, operatingPartnerShare: 0, netProfitToInvestor: 0, formulaActive: false
      }
    };
  }
  if (resource === 'forecast') {
    return {
      success: true,
      data: {
        horizonDays: payload.days || 30,
        projectedRevenue: 0, projectedExpenses: 0, projectedNetProfit: 0,
        projectedCash: 0, fundingRequired: 0, commercialReached: false
      }
    };
  }
  if (resource === 'cashflow') {
    const capital = localStore('capital').map((r) => ({
      date: r.Date || r.date, type: 'in', category: 'Capital', amount: Number(r.Amount || r.amount), label: r.Purpose || r.purpose || 'Contribution'
    }));
    const expenses = localStore('expenses').map((r) => ({
      date: r.Date || r.date, type: 'out', category: r.Category || r.category, amount: Number(r.Amount || r.amount), label: r.SubCategory || r.Category || ''
    }));
    const events = [...capital, ...expenses].sort((a, b) => new Date(a.date) - new Date(b.date));
    let bal = 0;
    events.forEach((e) => { bal += e.type === 'in' ? e.amount : -e.amount; e.balance = bal; });
    return { success: true, data: events };
  }
  if (action === 'list') {
    return { success: true, data: localStore(resource), total: localStore(resource).reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0) };
  }
  if (action === 'create') {
    const list = localStore(resource);
    const row = { ...payload, id: 'local_' + Date.now(), CreatedAt: new Date().toISOString() };
    if (resource === 'capital') {
      row.Date = payload.date; row.Amount = Number(payload.amount);
      row.Purpose = payload.purpose; row.Reference = payload.reference || '';
    }
    if (resource === 'expenses') {
      row.Date = payload.date; row.Category = payload.category;
      row.SubCategory = payload.subCategory || ''; row.Amount = Number(payload.amount);
      row.Supplier = payload.supplier || ''; row.Notes = payload.notes || '';
      const budget = localStore('budget');
      const line = budget.find((l) => l.Category === row.Category);
      if (line) line.ActualTotal = (Number(line.ActualTotal) || 0) + row.Amount;
      localStore('budget', budget);
    }
    if (resource === 'profit') {
      row.Month = payload.month; row.Amount = Number(payload.amount);
      row.Status = payload.paidDate ? 'Paid' : 'Pending';
      row.PaidDate = payload.paidDate || ''; row.Reference = payload.reference || '';
    }
    list.unshift(row);
    localStore(resource, list);
    return { success: true, data: row };
  }
  if (action === 'finalize') {
    return { success: false, error: 'Commercial production not reached — Clause 13 allocation not active' };
  }
  if (action === 'markPaid') {
    const list = localStore('profit');
    const item = list.find((d) => (d.DistributionID || d.id) === payload.distributionId);
    if (item) {
      item.Status = 'Paid';
      item.PaidDate = payload.paidDate || today();
      item.Reference = payload.reference || item.Reference || '';
      localStore('profit', list);
      return { success: true };
    }
    return { success: false, error: 'Not found' };
  }
  return { success: true, data: [] };
}

export default {
  activeSection: 'summary',

  async render(root) {
    this.root = root;
    this.canEdit = canApprove() || getRole() === 'OperationsManager';

    root.innerHTML = `
      <div class="page-header">
        <div class="page-header-title">
          <div class="breadcrumb"><span>Main</span><span>/</span><span>Finance</span></div>
          <h1>Finance</h1>
          <p class="u-text-secondary u-text-sm">Capital, expenses, Clause 13 allocation and investor returns</p>
        </div>
        <div class="page-header-actions" id="fin-actions"></div>
      </div>
      <div class="card">
        <div class="card-header" style="overflow-x:auto">
          <div style="display:flex;gap:var(--space-1);flex-wrap:wrap" id="fin-tabs">
            ${SECTIONS.map((s) => `
              <button class="btn btn-sm ${s.id === this.activeSection ? 'btn-primary' : 'btn-ghost'}" data-section="${s.id}">${s.label}</button>
            `).join('')}
          </div>
        </div>
        <div class="card-body" id="fin-content"><div class="skeleton" style="height:200px"></div></div>
      </div>
    `;

    root.querySelectorAll('[data-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeSection = btn.dataset.section;
        root.querySelectorAll('[data-section]').forEach((b) => {
          b.classList.toggle('btn-primary', b.dataset.section === this.activeSection);
          b.classList.toggle('btn-ghost', b.dataset.section !== this.activeSection);
        });
        this.renderSection();
      });
    });
    await this.renderSection();
  },

  async renderSection() {
    const content = this.root.querySelector('#fin-content');
    const actions = this.root.querySelector('#fin-actions');
    if (!content) return;
    content.innerHTML = `<div class="skeleton" style="height:160px"></div>`;
    actions.innerHTML = '';
    const map = {
      summary: () => this.secSummary(content, actions),
      capital: () => this.secCapital(content, actions),
      expenses: () => this.secExpenses(content, actions),
      budget: () => this.secBudget(content, actions),
      allocation: () => this.secAllocation(content, actions),
      profit: () => this.secProfit(content, actions),
      cashflow: () => this.secCashflow(content, actions),
      forecast: () => this.secForecast(content, actions)
    };
    await (map[this.activeSection] || map.summary)();
    if (window.lucide) window.lucide.createIcons({ nodes: [this.root] });
  },

  async secSummary(content) {
    try {
      const res = await finApi('summary', 'get');
      const s = res.data || {};
      content.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:var(--space-5)">
          <div class="card card-glass kpi-card"><div class="kpi-label">Total Investment</div><div class="kpi-value">${formatUGX(s.totalInvestment)}</div></div>
          <div class="card card-glass kpi-card"><div class="kpi-label">Total Expenses</div><div class="kpi-value">${formatUGX(s.totalExpenses)}</div></div>
          <div class="card card-glass kpi-card"><div class="kpi-label">Gross Revenue</div><div class="kpi-value">${formatUGX(s.grossSalesRevenue)}</div></div>
          <div class="card card-glass kpi-card"><div class="kpi-label">Net Profit (Investor)</div><div class="kpi-value">${formatUGX(s.netProfitToInvestor)}</div>
            <div class="kpi-insight">${s.commercialReached ? 'Clause 13 active' : 'Pre-commercial — allocation inactive'}</div></div>
          <div class="card card-glass kpi-card"><div class="kpi-label">ROI</div><div class="kpi-value">${formatPercent(s.roi)}</div></div>
          <div class="card card-glass kpi-card"><div class="kpi-label">Capital Recovery</div><div class="kpi-value">${formatPercent(s.capitalRecovery)}</div></div>
          <div class="card card-glass kpi-card"><div class="kpi-label">Cash Position</div><div class="kpi-value">${formatUGX(s.cashPosition)}</div></div>
          <div class="card card-glass kpi-card"><div class="kpi-label">Outstanding Funding</div><div class="kpi-value">${formatUGX(s.outstandingFunding)}</div></div>
        </div>
        <div class="card" style="padding:var(--space-5)">
          <h3 style="margin-bottom:var(--space-3)">Clause 13 allocation (when commercial)</h3>
          <p class="u-text-sm u-text-secondary" style="line-height:1.6;margin-bottom:var(--space-4)">
            <strong>50%</strong> of Gross Sales Revenue → feed costs · Remaining <strong>50%</strong> = Gross Profit ·
            <strong>25%</strong> of Gross Profit → Operating Partner · Balance = <strong>Net Profit</strong> to Investment Partner
          </p>
          <div class="kpi-grid">
            <div class="card kpi-card"><div class="kpi-label">Feed allocation (50%)</div><div class="kpi-value" style="font-size:var(--text-lg)">${formatUGX(s.feedAllocation)}</div></div>
            <div class="card kpi-card"><div class="kpi-label">Operator share (25% of GP)</div><div class="kpi-value" style="font-size:var(--text-lg)">${formatUGX(s.operatingPartnerShare)}</div></div>
          </div>
        </div>`;
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  async secCapital(content, actions) {
    if (canApprove()) {
      actions.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-capital"><i data-lucide="plus" style="width:14px;height:14px"></i> Add contribution</button>`;
      actions.querySelector('#btn-capital')?.addEventListener('click', () => this.formCapital());
    }
    try {
      const res = await finApi('capital', 'list');
      const rows = res.data || [];
      content.innerHTML = `
        <div class="card kpi-card" style="margin-bottom:var(--space-4);max-width:280px">
          <div class="kpi-label">Cumulative capital</div>
          <div class="kpi-value">${formatUGX(res.total || rows.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0))}</div>
        </div>
        <div id="capital-table"></div>`;
      renderDataTable(content.querySelector('#capital-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: (r) => r.Date || r.date },
          { key: 'Amount', label: 'Amount', accessor: (r) => formatUGX(r.Amount ?? r.amount), align: 'right' },
          { key: 'Purpose', label: 'Purpose', accessor: (r) => r.Purpose || r.purpose || '—' },
          { key: 'Reference', label: 'Reference', accessor: (r) => r.Reference || r.reference || '—' }
        ],
        rows,
        emptyMessage: 'No capital contributions recorded.'
      });
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  formCapital() {
    const html = `<form id="form-capital">
      ${field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() })}
      ${field({ name: 'amount', label: 'Amount (UGX)', type: 'number', required: true })}
      ${field({ name: 'purpose', label: 'Purpose', type: 'select', options: CAPITAL_PURPOSES, value: 'General' })}
      ${field({ name: 'reference', label: 'Bank / reference' })}
    </form>`;
    openModal({
      title: 'Capital contribution', content: html,
      footer: `<button class="btn btn-secondary" data-modal-close>Cancel</button><button class="btn btn-primary" id="save-capital">Save</button>`
    });
    document.getElementById('save-capital')?.addEventListener('click', async () => {
      const form = document.getElementById('form-capital');
      if (!validateRequired(form, ['date', 'amount'])) return;
      try {
        await finApi('capital', 'create', serializeForm(form));
        toastSuccess('Contribution recorded'); closeModal(); this.renderSection();
      } catch (err) { toastError(err.message || 'Save failed'); }
    });
  },

  async secExpenses(content, actions) {
    if (this.canEdit) {
      actions.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-expense"><i data-lucide="plus" style="width:14px;height:14px"></i> Add expense</button>`;
      actions.querySelector('#btn-expense')?.addEventListener('click', () => this.formExpense());
    }
    try {
      const res = await finApi('expenses', 'list');
      const rows = res.data || [];
      content.innerHTML = `
        <div class="card kpi-card" style="margin-bottom:var(--space-4);max-width:280px">
          <div class="kpi-label">Total expenses</div>
          <div class="kpi-value">${formatUGX(res.total || rows.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0))}</div>
        </div>
        <div id="exp-table"></div>`;
      renderDataTable(content.querySelector('#exp-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: (r) => r.Date || r.date },
          { key: 'Category', label: 'Category', accessor: (r) => r.Category || r.category },
          { key: 'SubCategory', label: 'Detail', accessor: (r) => r.SubCategory || r.subCategory || '—' },
          { key: 'Amount', label: 'Amount', accessor: (r) => formatUGX(r.Amount ?? r.amount), align: 'right' },
          { key: 'Supplier', label: 'Supplier', accessor: (r) => r.Supplier || r.supplier || '—' }
        ],
        rows, emptyMessage: 'No expenses recorded.'
      });
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  formExpense() {
    const html = `<form id="form-expense">
      ${field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() })}
      ${field({ name: 'category', label: 'Category', type: 'select', required: true, options: EXPENSE_CATEGORIES })}
      ${field({ name: 'subCategory', label: 'Sub-item / description' })}
      ${field({ name: 'amount', label: 'Amount (UGX)', type: 'number', required: true })}
      ${field({ name: 'supplier', label: 'Supplier' })}
      ${field({ name: 'notes', label: 'Notes', type: 'textarea' })}
    </form>`;
    openModal({
      title: 'Record expense', content: html,
      footer: `<button class="btn btn-secondary" data-modal-close>Cancel</button><button class="btn btn-primary" id="save-expense">Save</button>`
    });
    document.getElementById('save-expense')?.addEventListener('click', async () => {
      const form = document.getElementById('form-expense');
      if (!validateRequired(form, ['date', 'category', 'amount'])) return;
      try {
        await finApi('expenses', 'create', serializeForm(form));
        toastSuccess('Expense recorded'); closeModal(); this.renderSection();
      } catch (err) { toastError(err.message || 'Save failed'); }
    });
  },

  async secBudget(content, actions) {
    actions.innerHTML = `<button class="btn btn-secondary btn-sm" id="btn-seed-budget">Seed from budget doc</button>`;
    actions.querySelector('#btn-seed-budget')?.addEventListener('click', async () => {
      try { await finApi('budget', 'seed'); toastSuccess('Budget lines loaded'); this.renderSection(); }
      catch (err) { toastError(err.message); }
    });
    try {
      const res = await finApi('budget', 'status');
      const d = res.data || {};
      const lines = d.lines || [];
      content.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:var(--space-4)">
          <div class="card kpi-card"><div class="kpi-label">Budget total</div><div class="kpi-value">${formatUGX(d.totalBudget)}</div></div>
          <div class="card kpi-card"><div class="kpi-label">Actual spend</div><div class="kpi-value">${formatUGX(d.totalActual)}</div></div>
          <div class="card kpi-card"><div class="kpi-label">Variance</div><div class="kpi-value">${formatUGX(d.variance)}</div>
            <div class="kpi-insight">${d.variancePct != null ? d.variancePct + '%' : ''}</div></div>
        </div>
        <div id="budget-table"></div>`;
      renderDataTable(content.querySelector('#budget-table'), {
        columns: [
          { key: 'Category', label: 'Category' },
          { key: 'SubItem', label: 'Item' },
          { key: 'BudgetTotal', label: 'Budget', accessor: (r) => formatUGX(r.BudgetTotal), align: 'right' },
          { key: 'ActualTotal', label: 'Actual', accessor: (r) => formatUGX(r.ActualTotal), align: 'right' },
          { key: 'Variance', label: 'Variance', align: 'right',
            accessor: (r) => formatUGX((Number(r.ActualTotal) || 0) - (Number(r.BudgetTotal) || 0)) }
        ],
        rows: lines,
        emptyMessage: 'No budget lines. Click “Seed from budget doc” to load the 2,500-bird budget.'
      });
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  async secAllocation(content, actions) {
    const month = currentMonth();
    actions.innerHTML = `
      <input type="month" class="form-input" id="alloc-month" value="${month}" style="width:auto;height:32px" />
      <button class="btn btn-secondary btn-sm" id="btn-compute-alloc">Compute</button>
      ${canApprove() ? '<button class="btn btn-primary btn-sm" id="btn-finalize-alloc">Finalize month</button>' : ''}`;

    const load = async () => {
      const m = this.root.querySelector('#alloc-month')?.value || month;
      try {
        const res = await finApi('allocation', 'compute', { month: m });
        const a = res.data || {};
        content.innerHTML = `
          <div class="insight-card ${a.formulaActive ? 'positive' : 'info'}" style="margin-bottom:var(--space-4)">
            <div class="insight-icon"><i data-lucide="${a.formulaActive ? 'check-circle' : 'info'}" style="width:18px;height:18px"></i></div>
            <div class="insight-text">
              ${a.formulaActive
                ? 'Commercial production reached. Clause 13 revenue allocation is active for ' + a.month + '.'
                : 'Pre-commercial. Clause 13 allocation is not yet applied. Month: ' + a.month}
            </div>
          </div>
          <div class="kpi-grid">
            <div class="card kpi-card"><div class="kpi-label">Gross sales revenue</div><div class="kpi-value">${formatUGX(a.grossSalesRevenue)}</div></div>
            <div class="card kpi-card"><div class="kpi-label">Feed allocation (50%)</div><div class="kpi-value">${formatUGX(a.feedAllocation)}</div></div>
            <div class="card kpi-card"><div class="kpi-label">Gross profit (50%)</div><div class="kpi-value">${formatUGX(a.grossProfit)}</div></div>
            <div class="card kpi-card"><div class="kpi-label">Operator share (25% of GP)</div><div class="kpi-value">${formatUGX(a.operatingPartnerShare)}</div></div>
            <div class="card kpi-card"><div class="kpi-label">Net profit to investor</div><div class="kpi-value">${formatUGX(a.netProfitToInvestor)}</div></div>
          </div>`;
        if (window.lucide) window.lucide.createIcons({ nodes: [content] });
      } catch (err) {
        content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
      }
    };

    actions.querySelector('#btn-compute-alloc')?.addEventListener('click', load);
    actions.querySelector('#btn-finalize-alloc')?.addEventListener('click', async () => {
      const m = actions.querySelector('#alloc-month')?.value || month;
      try {
        await finApi('allocation', 'finalize', { month: m });
        toastSuccess('Allocation finalized for ' + m); load();
      } catch (err) { toastError(err.message || 'Finalize failed'); }
    });
    await load();
  },

  async secProfit(content, actions) {
    if (canApprove()) {
      actions.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-profit"><i data-lucide="plus" style="width:14px;height:14px"></i> Record distribution</button>`;
      actions.querySelector('#btn-profit')?.addEventListener('click', () => this.formProfit());
    }
    try {
      const res = await finApi('profit', 'list');
      const rows = res.data || [];
      content.innerHTML = `
        <p class="u-text-sm u-text-secondary" style="margin-bottom:var(--space-4)">
          Profit distributions are due monthly within 30 days of month end (Agreement Clause 13(e)).
        </p>
        <div id="profit-table"></div>`;
      renderDataTable(content.querySelector('#profit-table'), {
        columns: [
          { key: 'Month', label: 'Month', accessor: (r) => r.Month || r.month },
          { key: 'Amount', label: 'Amount', accessor: (r) => formatUGX(r.Amount ?? r.amount), align: 'right' },
          { key: 'Status', label: 'Status', accessor: (r) => {
            const s = r.Status || r.status || 'Pending';
            return `<span class="badge badge-${s === 'Paid' ? 'positive' : 'caution'}">${s}</span>`;
          }},
          { key: 'PaidDate', label: 'Paid date', accessor: (r) => r.PaidDate || r.paidDate || '—' },
          { key: 'Reference', label: 'Reference', accessor: (r) => r.Reference || r.reference || '—' }
        ],
        rows, emptyMessage: 'No profit distributions yet.'
      });
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  formProfit() {
    const html = `<form id="form-profit">
      ${field({ name: 'month', label: 'Month', type: 'month', required: true, value: currentMonth() })}
      ${field({ name: 'amount', label: 'Amount (UGX)', type: 'number', required: true })}
      ${field({ name: 'paidDate', label: 'Paid date (optional)', type: 'date' })}
      ${field({ name: 'reference', label: 'Payment reference' })}
    </form>`;
    openModal({
      title: 'Profit distribution', content: html,
      footer: `<button class="btn btn-secondary" data-modal-close>Cancel</button><button class="btn btn-primary" id="save-profit">Save</button>`
    });
    document.getElementById('save-profit')?.addEventListener('click', async () => {
      const form = document.getElementById('form-profit');
      if (!validateRequired(form, ['month', 'amount'])) return;
      try {
        await finApi('profit', 'create', serializeForm(form));
        toastSuccess('Distribution recorded'); closeModal(); this.renderSection();
      } catch (err) { toastError(err.message || 'Save failed'); }
    });
  },

  async secCashflow(content) {
    try {
      const res = await finApi('cashflow', 'list');
      const rows = res.data || [];
      content.innerHTML = `<div id="cf-table"></div>`;
      renderDataTable(content.querySelector('#cf-table'), {
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'type', label: 'Type', accessor: (r) => `<span class="badge badge-${r.type === 'in' ? 'positive' : 'neutral'}">${r.type === 'in' ? 'In' : 'Out'}</span>` },
          { key: 'category', label: 'Category' },
          { key: 'label', label: 'Detail' },
          { key: 'amount', label: 'Amount', accessor: (r) => formatUGX(r.amount), align: 'right' },
          { key: 'balance', label: 'Running balance', accessor: (r) => formatUGX(r.balance), align: 'right' }
        ],
        rows, emptyMessage: 'No cash movements yet.'
      });
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  async secForecast(content, actions) {
    actions.innerHTML = `
      <select class="form-select" id="forecast-days" style="width:auto;height:32px">
        <option value="30">30 days</option>
        <option value="60">60 days</option>
        <option value="90">90 days</option>
      </select>
      <button class="btn btn-secondary btn-sm" id="btn-forecast">Run forecast</button>`;
    const run = async () => {
      const days = Number(actions.querySelector('#forecast-days')?.value || 30);
      try {
        const res = await finApi('forecast', 'get', { days });
        const f = res.data || {};
        content.innerHTML = `
          <div class="kpi-grid">
            <div class="card kpi-card"><div class="kpi-label">Horizon</div><div class="kpi-value">${f.horizonDays} days</div></div>
            <div class="card kpi-card"><div class="kpi-label">Projected revenue</div><div class="kpi-value">${formatUGX(f.projectedRevenue)}</div></div>
            <div class="card kpi-card"><div class="kpi-label">Projected expenses</div><div class="kpi-value">${formatUGX(f.projectedExpenses)}</div></div>
            <div class="card kpi-card"><div class="kpi-label">Projected net profit</div><div class="kpi-value">${formatUGX(f.projectedNetProfit)}</div></div>
            <div class="card kpi-card"><div class="kpi-label">Funding required</div><div class="kpi-value">${formatUGX(f.fundingRequired)}</div>
              <div class="kpi-insight">${f.fundingRequired > 0 ? 'Additional capital may be needed' : 'No additional funding projected'}</div></div>
          </div>
          <p class="u-text-xs u-text-muted" style="margin-top:var(--space-4)">
            Projection uses the last 30 days of sales and expenses. Net profit applies Clause 13 only after commercial production.
          </p>`;
      } catch (err) {
        content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
      }
    };
    actions.querySelector('#btn-forecast')?.addEventListener('click', run);
    await run();
  },

  destroy() {}
};
