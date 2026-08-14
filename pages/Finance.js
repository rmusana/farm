/**
 * Finance module – Capital, Disbursed, Revenue, Expenses, Allocation, Profit, Cashflow, Forecast
 */
import { field, serializeForm, validateRequired } from '../components/Form.js';
import { renderDataTable } from '../components/DataTable.js';
import { openModal, closeModal, confirmDialog } from '../components/Modal.js';
import { formatUGX, formatPercent, formatNumber } from '../components/KPI.js';
import { toastSuccess, toastError } from '../components/Toast.js';
import { canApprove, canWrite } from '../js/auth.js';
import api from '../js/api.js';
import { formatDate, formatDateTime, todayEAT } from '../js/datetime.js';

const SECTIONS = [
  { id: 'summary', label: 'Overview' },
  { id: 'capital', label: 'Capital' },
  { id: 'disbursed', label: 'Capital vs Disbursed' },
  { id: 'revenue', label: 'Revenue' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'allocation', label: 'Revenue Allocation' },
  { id: 'profit', label: 'Profit Distribution' },
  { id: 'cashflow', label: 'Cash Flow' },
  { id: 'forecast', label: 'Forecasting' }
];

const EXPENSE_CATEGORIES = [
  'Booking', 'Brooder', 'Feeds', 'Medication', 'Vaccination',
  'Labour', 'Utilities', 'Transport', 'Maintenance', 'Equipment', 'Other'
];
const CAPITAL_PURPOSES = ['Birds', 'Feed', 'Medication', 'Equipment', 'Brooder', 'General', 'Other'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

async function finApi(resource, action, payload = {}) {
  if (window.RMUSANA_API_URL) {
    return api.request('/finance', {
      body: {
        module: 'finance',
        resource,
        action,
        projectId: 'LUK54',
        ...payload
      }
    });
  }
  // Offline / local fallback
  const key = 'rmusana_fin_' + resource;
  if (action === 'list' || action === 'get' || action === 'status' || action === 'compute') {
    try {
      const rows = JSON.parse(localStorage.getItem(key) || '[]');
      if (resource === 'summary') {
        const capital = JSON.parse(localStorage.getItem('rmusana_fin_capital') || '[]');
        const expenses = JSON.parse(localStorage.getItem('rmusana_fin_expenses') || '[]');
        const sales = JSON.parse(localStorage.getItem('rmusana_ops_sales') || '[]');
        const totalInvestment = capital.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
        const totalExpenses = expenses.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
        const grossSalesRevenue = sales.reduce((s, r) => s + Number(r.TotalRevenue || r.totalRevenue || 0), 0);
        return {
          success: true,
          data: {
            totalInvestment,
            totalExpenses,
            grossSalesRevenue,
            commercialReached: false,
            feedAllocation: 0,
            grossProfit: 0,
            operatingPartnerShare: 0,
            netProfitToInvestor: 0,
            roi: 0,
            capitalRecovery: 0,
            cashPosition: totalInvestment - totalExpenses,
            outstandingFunding: Math.max(0, 52849172 - totalInvestment)
          }
        };
      }
      if (resource === 'allocation') {
        return {
          success: true,
          data: {
            month: payload.month || currentMonth(),
            commercialReached: false,
            formulaActive: false,
            grossSalesRevenue: 0,
            feedAllocation: 0,
            grossProfit: 0,
            operatingPartnerShare: 0,
            netProfitToInvestor: 0
          }
        };
      }
      if (resource === 'cashflow') {
        return { success: true, data: [] };
      }
      if (resource === 'forecast') {
        return {
          success: true,
          data: {
            horizonDays: payload.days || 30,
            projectedRevenue: 0,
            projectedExpenses: 0,
            projectedNetProfit: 0,
            fundingRequired: 0
          }
        };
      }
      return { success: true, data: rows, total: rows.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0) };
    } catch (e) {
      return { success: true, data: [] };
    }
  }
  if (action === 'create') {
    const rows = JSON.parse(localStorage.getItem(key) || '[]');
    const row = {
      ...payload,
      Amount: Number(payload.amount) || 0,
      amount: Number(payload.amount) || 0,
      Date: payload.date,
      date: payload.date,
      CreatedAt: new Date().toISOString()
    };
    rows.unshift(row);
    localStorage.setItem(key, JSON.stringify(rows));
    return { success: true, data: row };
  }
  return { success: true, data: {} };
}

export default {
  activeSection: 'summary',
  root: null,

  async render(root) {
    this.root = root;
    const writable = canWrite('finance') || canApprove();

    root.innerHTML = `
      <div class="page-header">
        <div class="page-header-title">
          <div class="breadcrumb"><span>Main</span><span>/</span><span>Finance</span></div>
          <h1>Finance</h1>
          <p class="u-text-secondary u-text-sm">Capital, disbursements, revenue and profit allocation</p>
        </div>
        <div class="page-header-actions" id="fin-actions"></div>
      </div>

      <div style="display:flex;gap:var(--space-1);flex-wrap:wrap;margin-bottom:var(--space-4)" id="fin-tabs">
        ${SECTIONS.map((s) =>
          '<button class="btn btn-sm ' +
          (s.id === this.activeSection ? 'btn-primary' : 'btn-ghost') +
          '" data-sec="' + s.id + '">' + s.label + '</button>'
        ).join('')}
      </div>

      <div id="fin-content"><div class="skeleton" style="height:200px"></div></div>
    `;

    root.querySelectorAll('[data-sec]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeSection = btn.dataset.sec;
        root.querySelectorAll('[data-sec]').forEach((b) => {
          b.classList.toggle('btn-primary', b.dataset.sec === this.activeSection);
          b.classList.toggle('btn-ghost', b.dataset.sec !== this.activeSection);
        });
        this.renderSection();
      });
    });

    this.writable = writable;
    await this.renderSection();
    if (window.lucide) window.lucide.createIcons({ nodes: [root] });
  },

  async renderSection() {
    const content = this.root.querySelector('#fin-content');
    const actions = this.root.querySelector('#fin-actions');
    if (!content) return;
    content.innerHTML = '<div class="skeleton" style="height:160px"></div>';
    if (actions) actions.innerHTML = '';

    const map = {
      summary: () => this.secSummary(content, actions),
      capital: () => this.secCapital(content, actions),
      disbursed: () => this.secDisbursed(content, actions),
      revenue: () => this.secRevenue(content, actions),
      expenses: () => this.secExpenses(content, actions),
      allocation: () => this.secAllocation(content, actions),
      profit: () => this.secProfit(content, actions),
      cashflow: () => this.secCashflow(content, actions),
      forecast: () => this.secForecast(content, actions)
    };
    await (map[this.activeSection] || map.summary)();
    if (window.lucide) window.lucide.createIcons({ nodes: [this.root] });
  },

  /* ── Overview ─────────────────────────────────────────── */

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
            <div class="kpi-insight">${s.commercialReached ? 'Allocation active' : 'Allocation not yet active'}</div></div>
          <div class="card card-glass kpi-card"><div class="kpi-label">ROI</div><div class="kpi-value">${formatPercent(s.roi)}</div></div>
          <div class="card card-glass kpi-card"><div class="kpi-label">Capital Recovery</div><div class="kpi-value">${formatPercent(s.capitalRecovery)}</div></div>
          <div class="card card-glass kpi-card"><div class="kpi-label">Cash Position</div><div class="kpi-value">${formatUGX(s.cashPosition)}</div></div>
          <div class="card card-glass kpi-card"><div class="kpi-label">Outstanding Funding</div><div class="kpi-value">${formatUGX(s.outstandingFunding)}</div></div>
        </div>
        <div class="card" style="padding:var(--space-5)">
          <h3 style="margin-bottom:var(--space-3)">Revenue allocation</h3>
          <p class="u-text-sm u-text-secondary" style="line-height:1.6;margin-bottom:var(--space-4)">
            Gross sales are split: half toward feed, half as gross profit.
            A share of gross profit goes to the operating partner; the balance is net profit to the investor.
          </p>
          <div class="kpi-grid">
            <div class="card kpi-card"><div class="kpi-label">Feed allocation</div><div class="kpi-value" style="font-size:var(--text-lg)">${formatUGX(s.feedAllocation)}</div></div>
            <div class="card kpi-card"><div class="kpi-label">Operator share</div><div class="kpi-value" style="font-size:var(--text-lg)">${formatUGX(s.operatingPartnerShare)}</div></div>
            <div class="card kpi-card"><div class="kpi-label">Net to investor</div><div class="kpi-value" style="font-size:var(--text-lg)">${formatUGX(s.netProfitToInvestor)}</div></div>
          </div>
        </div>`;
    } catch (err) {
      content.innerHTML = '<div class="empty-state"><p class="empty-state-desc">' + (err.message || 'Failed to load') + '</p></div>';
    }
  },

  /* ── Capital ──────────────────────────────────────────── */

  async secCapital(content, actions) {
    if (this.writable) {
      actions.innerHTML = '<button class="btn btn-primary btn-sm" id="btn-capital"><i data-lucide="plus" style="width:14px;height:14px"></i> Add contribution</button>';
      actions.querySelector('#btn-capital')?.addEventListener('click', () => this.formCapital());
    }
    try {
      const res = await finApi('capital', 'list');
      const rows = res.data || [];
      const total = res.total != null ? res.total : rows.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
      content.innerHTML = `
        <div class="card kpi-card" style="margin-bottom:var(--space-4);max-width:280px">
          <div class="kpi-label">Cumulative capital</div>
          <div class="kpi-value">${formatUGX(total)}</div>
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
        actions: this.writable ? [{ id: 'delete', label: 'Delete', danger: true }] : null,
        onAction: async (action, row) => {
          if (action !== 'delete') return;
          const id = row.ContributionID || row.contributionId || row.id;
          if (!id) { toastError('Cannot delete: missing id'); return; }
          const ok = await confirmDialog({
            title: 'Delete contribution',
            message: 'Delete this capital contribution? This cannot be undone.',
            confirmLabel: 'Delete',
            danger: true
          });
          if (!ok) return;
          try {
            await finApi('capital', 'delete', { id });
            toastSuccess('Deleted');
            this.renderSection();
          } catch (err) { toastError(err.message || 'Delete failed'); }
        },
        emptyMessage: 'No capital contributions recorded.'
      });
    } catch (err) {
      content.innerHTML = '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  formCapital() {
    const html = '<form id="form-capital">' +
      field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() }) +
      field({ name: 'amount', label: 'Amount (UGX)', type: 'number', required: true }) +
      field({ name: 'purpose', label: 'Purpose', type: 'select', options: CAPITAL_PURPOSES, value: 'General' }) +
      field({ name: 'reference', label: 'Reference' }) +
      '</form>';
    openModal({
      title: 'Capital contribution',
      content: html,
      footer: '<button class="btn btn-secondary" data-modal-close>Cancel</button><button class="btn btn-primary" id="save-capital">Save</button>'
    });
    document.getElementById('save-capital')?.addEventListener('click', async () => {
      const form = document.getElementById('form-capital');
      if (!validateRequired(form, ['date', 'amount'])) return;
      try {
        await finApi('capital', 'create', serializeForm(form));
        toastSuccess('Contribution recorded');
        closeModal();
        this.renderSection();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    });
  },

  /* ── Capital vs Disbursed ─────────────────────────────── */

  async secDisbursed(content, actions) {
    if (actions) actions.innerHTML = '';
    try {
      const [capRes, expRes] = await Promise.all([
        finApi('capital', 'list'),
        finApi('expenses', 'list')
      ]);
      const capital = capRes.data || [];
      const expenses = expRes.data || [];
      const totalCapital = capital.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
      const totalDisbursed = expenses.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
      const remaining = totalCapital - totalDisbursed;
      const pct = totalCapital ? Math.round((totalDisbursed / totalCapital) * 100) : 0;

      content.innerHTML = `
        <p class="u-text-sm u-text-secondary" style="margin-bottom:var(--space-4)">
          Capital contributed versus amounts disbursed (spent) on the flock.
        </p>
        <div class="kpi-grid" style="margin-bottom:var(--space-4)">
          <div class="card kpi-card"><div class="kpi-label">Capital contributed</div><div class="kpi-value">${formatUGX(totalCapital)}</div></div>
          <div class="card kpi-card"><div class="kpi-label">Amount disbursed</div><div class="kpi-value">${formatUGX(totalDisbursed)}</div></div>
          <div class="card kpi-card"><div class="kpi-label">Remaining / unspent</div><div class="kpi-value">${formatUGX(remaining)}</div>
            <div class="kpi-insight">${pct}% disbursed</div></div>
        </div>
        <h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-3)">Capital contributions</h3>
        <div id="cap-table" style="margin-bottom:var(--space-5)"></div>
        <h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-3)">Disbursements (expenses)</h3>
        <div id="disb-table"></div>`;

      renderDataTable(content.querySelector('#cap-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: (r) => r.Date || r.date },
          { key: 'Amount', label: 'Amount', accessor: (r) => formatUGX(r.Amount ?? r.amount), align: 'right' },
          { key: 'Purpose', label: 'Purpose', accessor: (r) => r.Purpose || r.purpose || '—' },
          { key: 'Reference', label: 'Reference', accessor: (r) => r.Reference || r.reference || '—' }
        ],
        rows: capital,
        emptyMessage: 'No capital contributions yet.'
      });
      renderDataTable(content.querySelector('#disb-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: (r) => r.Date || r.date },
          { key: 'Category', label: 'Category', accessor: (r) => r.Category || r.category },
          { key: 'Amount', label: 'Amount', accessor: (r) => formatUGX(r.Amount ?? r.amount), align: 'right' },
          { key: 'Supplier', label: 'Supplier', accessor: (r) => r.Supplier || r.supplier || '—' }
        ],
        rows: expenses,
        emptyMessage: 'No disbursements recorded yet.'
      });
    } catch (err) {
      content.innerHTML = '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  /* ── Revenue ──────────────────────────────────────────── */

  async secRevenue(content, actions) {
    if (actions) actions.innerHTML = '';
    try {
      let sales = [];
      if (window.RMUSANA_API_URL) {
        const res = await api.request('/operations', {
          body: { module: 'operations', resource: 'sales', action: 'list', projectId: 'LUK54' }
        });
        sales = res.data || [];
      } else {
        try {
          sales = JSON.parse(localStorage.getItem('rmusana_ops_sales') || '[]');
        } catch (e) {
          sales = [];
        }
      }

      const total = sales.reduce((s, r) => s + Number((r.TotalRevenue ?? r.totalRevenue) || 0), 0);
      const trays = sales.reduce((s, r) => {
        const t = Number(r.QuantityTrays ?? r.quantityTrays);
        if (t) return s + t;
        return s + Number((r.QuantityEggs ?? r.quantityEggs) || 0) / 30;
      }, 0);
      const days = new Set(
        sales.map((r) => String(r.Date || r.date || '').slice(0, 10)).filter(Boolean)
      ).size;

      const byCat = {};
      const byPay = {};
      sales.forEach((r) => {
        const c = r.SaleCategory || r.saleCategory || 'Eggs';
        byCat[c] = (byCat[c] || 0) + Number((r.TotalRevenue ?? r.totalRevenue) || 0);
        const p = r.PaymentStatus || r.paymentStatus || '—';
        byPay[p] = (byPay[p] || 0) + Number((r.TotalRevenue ?? r.totalRevenue) || 0);
      });

      // Build HTML without nested template literals (avoids syntax errors)
      let catHtml = '<p class="u-text-muted u-text-sm">No data</p>';
      if (Object.keys(byCat).length) {
        catHtml = Object.keys(byCat)
          .map(function (k) {
            return (
              '<div class="u-text-sm" style="display:flex;justify-content:space-between">' +
              '<span>' + k + '</span><strong>' + formatUGX(byCat[k]) + '</strong></div>'
            );
          })
          .join('');
      }
      let payHtml = '<p class="u-text-muted u-text-sm">No data</p>';
      if (Object.keys(byPay).length) {
        payHtml = Object.keys(byPay)
          .map(function (k) {
            return (
              '<div class="u-text-sm" style="display:flex;justify-content:space-between">' +
              '<span>' + k + '</span><strong>' + formatUGX(byPay[k]) + '</strong></div>'
            );
          })
          .join('');
      }

      content.innerHTML =
        '<div class="kpi-grid" style="margin-bottom:var(--space-4)">' +
        '<div class="card kpi-card"><div class="kpi-label">Total revenue</div><div class="kpi-value">' +
        formatUGX(total) +
        '</div></div>' +
        '<div class="card kpi-card"><div class="kpi-label">Trays sold</div><div class="kpi-value">' +
        formatNumber(trays, 1) +
        '</div></div>' +
        '<div class="card kpi-card"><div class="kpi-label">Days with sales</div><div class="kpi-value">' +
        days +
        '</div></div>' +
        '</div>' +
        '<div class="grid-2" style="margin-bottom:var(--space-4)">' +
        '<div class="card" style="padding:var(--space-4)">' +
        '<h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-2)">By sale type</h3>' +
        catHtml +
        '</div>' +
        '<div class="card" style="padding:var(--space-4)">' +
        '<h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-2)">By payment</h3>' +
        payHtml +
        '</div>' +
        '</div>' +
        '<div id="rev-table"></div>';

      renderDataTable(content.querySelector('#rev-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: (r) => r.Date || r.date },
          {
            key: 'SaleCategory',
            label: 'Type',
            accessor: (r) => r.SaleCategory || r.saleCategory || 'Eggs'
          },
          {
            key: 'EggType',
            label: 'Egg type',
            accessor: (r) => r.EggType || r.eggType || '—'
          },
          {
            key: 'QuantityTrays',
            label: 'Trays',
            accessor: (r) => {
              const t = r.QuantityTrays ?? r.quantityTrays;
              if (t != null && t !== '') return formatNumber(t, 1);
              return formatNumber(Number(r.QuantityEggs || r.quantityEggs || 0) / 30, 1);
            }
          },
          {
            key: 'TotalRevenue',
            label: 'Revenue',
            accessor: (r) => formatUGX(r.TotalRevenue ?? r.totalRevenue),
            align: 'right'
          },
          {
            key: 'PaymentStatus',
            label: 'Payment',
            accessor: (r) => r.PaymentStatus || r.paymentStatus || '—'
          }
        ],
        rows: sales,
        emptyMessage: 'No sales yet. Record sales under Operations → Sales.'
      });
    } catch (err) {
      content.innerHTML = '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  /* ── Expenses ─────────────────────────────────────────── */

  async secExpenses(content, actions) {
    if (this.writable) {
      actions.innerHTML = '<button class="btn btn-primary btn-sm" id="btn-expense"><i data-lucide="plus" style="width:14px;height:14px"></i> Record expense</button>';
      actions.querySelector('#btn-expense')?.addEventListener('click', () => this.formExpense());
    }
    try {
      const res = await finApi('expenses', 'list');
      const rows = res.data || [];
      const total = res.total != null
        ? res.total
        : rows.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
      content.innerHTML = `
        <div class="card kpi-card" style="margin-bottom:var(--space-4);max-width:280px">
          <div class="kpi-label">Total expenses</div>
          <div class="kpi-value">${formatUGX(total)}</div>
        </div>
        <div id="exp-table"></div>`;
      renderDataTable(content.querySelector('#exp-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: (r) => r.Date || r.date },
          { key: 'Category', label: 'Category', accessor: (r) => r.Category || r.category },
          {
            key: 'SubCategory',
            label: 'Detail',
            accessor: (r) => r.SubCategory || r.subCategory || '—'
          },
          {
            key: 'Amount',
            label: 'Amount',
            accessor: (r) => formatUGX(r.Amount ?? r.amount),
            align: 'right'
          },
          {
            key: 'Supplier',
            label: 'Supplier',
            accessor: (r) => r.Supplier || r.supplier || '—'
          }
        ],
        rows,
        actions: this.writable ? [{ id: 'delete', label: 'Delete', danger: true }] : null,
        onAction: async (action, row) => {
          if (action !== 'delete') return;
          const id = row.ExpenseID || row.expenseId || row.id;
          if (!id) { toastError('Cannot delete: missing id'); return; }
          const ok = await confirmDialog({
            title: 'Delete expense',
            message: 'Delete this expense? This cannot be undone.',
            confirmLabel: 'Delete',
            danger: true
          });
          if (!ok) return;
          try {
            await finApi('expenses', 'delete', { id });
            toastSuccess('Deleted');
            this.renderSection();
          } catch (err) { toastError(err.message || 'Delete failed'); }
        },
        emptyMessage: 'No expenses recorded.'
      });
    } catch (err) {
      content.innerHTML = '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  formExpense() {
    const html =
      '<form id="form-expense">' +
      field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() }) +
      field({ name: 'category', label: 'Category', type: 'select', required: true, options: EXPENSE_CATEGORIES }) +
      field({ name: 'subCategory', label: 'Sub-item / description' }) +
      field({ name: 'amount', label: 'Amount (UGX)', type: 'number', required: true }) +
      field({ name: 'supplier', label: 'Supplier' }) +
      field({ name: 'notes', label: 'Notes', type: 'textarea' }) +
      '</form>';
    openModal({
      title: 'Record expense',
      content: html,
      footer:
        '<button class="btn btn-secondary" data-modal-close>Cancel</button>' +
        '<button class="btn btn-primary" id="save-expense">Save</button>'
    });
    document.getElementById('save-expense')?.addEventListener('click', async () => {
      const form = document.getElementById('form-expense');
      if (!validateRequired(form, ['date', 'category', 'amount'])) return;
      try {
        await finApi('expenses', 'create', serializeForm(form));
        toastSuccess('Expense recorded');
        closeModal();
        this.renderSection();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    });
  },

  /* ── Revenue Allocation ───────────────────────────────── */

  async secAllocation(content, actions) {
    const month = currentMonth();
    actions.innerHTML =
      '<input type="month" class="form-input" id="alloc-month" value="' +
      month +
      '" style="width:auto;height:32px" />' +
      '<button class="btn btn-secondary btn-sm" id="btn-compute-alloc">Compute</button>' +
      (canApprove()
        ? '<button class="btn btn-primary btn-sm" id="btn-finalize-alloc">Finalize month</button>'
        : '');

    const load = async () => {
      const m = this.root.querySelector('#alloc-month')?.value || month;
      try {
        const res = await finApi('allocation', 'compute', { month: m });
        const a = res.data || {};
        const active = a.formulaActive || a.commercialReached;
        content.innerHTML =
          '<div class="insight-card ' +
          (active ? 'positive' : 'info') +
          '" style="margin-bottom:var(--space-4)">' +
          '<div class="insight-icon"><i data-lucide="' +
          (active ? 'check-circle' : 'info') +
          '" style="width:18px;height:18px"></i></div>' +
          '<div class="insight-text">' +
          (active
            ? 'Revenue allocation is active for ' + (a.month || m) + '.'
            : 'Revenue allocation is not yet active for this period. Month: ' + (a.month || m)) +
          '</div></div>' +
          '<div class="kpi-grid">' +
          '<div class="card kpi-card"><div class="kpi-label">Gross sales revenue</div><div class="kpi-value">' +
          formatUGX(a.grossSalesRevenue) +
          '</div></div>' +
          '<div class="card kpi-card"><div class="kpi-label">Feed allocation</div><div class="kpi-value">' +
          formatUGX(a.feedAllocation) +
          '</div></div>' +
          '<div class="card kpi-card"><div class="kpi-label">Gross profit</div><div class="kpi-value">' +
          formatUGX(a.grossProfit) +
          '</div></div>' +
          '<div class="card kpi-card"><div class="kpi-label">Operator share</div><div class="kpi-value">' +
          formatUGX(a.operatingPartnerShare) +
          '</div></div>' +
          '<div class="card kpi-card"><div class="kpi-label">Net profit to investor</div><div class="kpi-value">' +
          formatUGX(a.netProfitToInvestor) +
          '</div></div></div>';
        if (window.lucide) window.lucide.createIcons({ nodes: [content] });
      } catch (err) {
        content.innerHTML = '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
      }
    };

    actions.querySelector('#btn-compute-alloc')?.addEventListener('click', load);
    actions.querySelector('#btn-finalize-alloc')?.addEventListener('click', async () => {
      const m = actions.querySelector('#alloc-month')?.value || month;
      try {
        await finApi('allocation', 'finalize', { month: m });
        toastSuccess('Allocation finalized for ' + m);
        load();
      } catch (err) {
        toastError(err.message || 'Finalize failed');
      }
    });

    await load();
  },

  /* ── Profit ───────────────────────────────────────────── */

  async secProfit(content, actions) {
    if (this.writable && canApprove()) {
      actions.innerHTML =
        '<button class="btn btn-primary btn-sm" id="btn-profit"><i data-lucide="plus" style="width:14px;height:14px"></i> Record distribution</button>';
      actions.querySelector('#btn-profit')?.addEventListener('click', () => this.formProfit());
    }
    try {
      const res = await finApi('profit', 'list');
      const rows = res.data || [];
      content.innerHTML = '<div id="profit-table"></div>';
      renderDataTable(content.querySelector('#profit-table'), {
        columns: [
          { key: 'Month', label: 'Month', accessor: (r) => r.Month || r.month },
          {
            key: 'Amount',
            label: 'Amount',
            accessor: (r) => formatUGX(r.Amount ?? r.amount),
            align: 'right'
          },
          {
            key: 'Status',
            label: 'Status',
            accessor: (r) => {
              const s = r.Status || r.status || 'Pending';
              const cls = s === 'Paid' ? 'positive' : 'caution';
              return '<span class="badge badge-' + cls + '">' + s + '</span>';
            }
          },
          {
            key: 'PaidDate',
            label: 'Paid date',
            accessor: (r) => r.PaidDate || r.paidDate || '—'
          },
          {
            key: 'Reference',
            label: 'Reference',
            accessor: (r) => r.Reference || r.reference || '—'
          }
        ],
        rows,
        emptyMessage: 'No profit distributions recorded.'
      });
    } catch (err) {
      content.innerHTML = '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  formProfit() {
    const html =
      '<form id="form-profit">' +
      field({ name: 'month', label: 'Month', type: 'month', required: true, value: currentMonth() }) +
      field({ name: 'amount', label: 'Amount (UGX)', type: 'number', required: true }) +
      field({ name: 'paidDate', label: 'Paid date', type: 'date' }) +
      field({ name: 'reference', label: 'Reference' }) +
      '</form>';
    openModal({
      title: 'Profit distribution',
      content: html,
      footer:
        '<button class="btn btn-secondary" data-modal-close>Cancel</button>' +
        '<button class="btn btn-primary" id="save-profit">Save</button>'
    });
    document.getElementById('save-profit')?.addEventListener('click', async () => {
      const form = document.getElementById('form-profit');
      if (!validateRequired(form, ['month', 'amount'])) return;
      try {
        await finApi('profit', 'create', serializeForm(form));
        toastSuccess('Distribution recorded');
        closeModal();
        this.renderSection();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    });
  },

  /* ── Cash flow ────────────────────────────────────────── */

  async secCashflow(content) {
    try {
      const res = await finApi('cashflow', 'list');
      const rows = res.data || [];
      content.innerHTML = '<div id="cf-table"></div>';
      renderDataTable(content.querySelector('#cf-table'), {
        columns: [
          { key: 'date', label: 'Date', accessor: (r) => r.date || r.Date },
          { key: 'type', label: 'In/Out', accessor: (r) => r.type || '—' },
          { key: 'category', label: 'Category', accessor: (r) => r.category || r.Category || '—' },
          { key: 'label', label: 'Detail', accessor: (r) => r.label || '—' },
          {
            key: 'amount',
            label: 'Amount',
            accessor: (r) => formatUGX(r.amount),
            align: 'right'
          },
          {
            key: 'balance',
            label: 'Running balance',
            accessor: (r) => formatUGX(r.balance),
            align: 'right'
          }
        ],
        rows,
        emptyMessage: 'No cash-flow events yet.'
      });
    } catch (err) {
      content.innerHTML = '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  /* ── Forecast ─────────────────────────────────────────── */

  async secForecast(content, actions) {
    actions.innerHTML =
      '<input type="number" class="form-input" id="fc-days" value="30" min="7" max="365" style="width:90px;height:32px" />' +
      '<button class="btn btn-secondary btn-sm" id="btn-fc">Refresh</button>';

    const load = async () => {
      const days = Number(this.root.querySelector('#fc-days')?.value) || 30;
      try {
        const res = await finApi('forecast', 'get', { days });
        const f = res.data || {};
        content.innerHTML =
          '<div class="kpi-grid">' +
          '<div class="card kpi-card"><div class="kpi-label">Horizon (days)</div><div class="kpi-value">' +
          (f.horizonDays || days) +
          '</div></div>' +
          '<div class="card kpi-card"><div class="kpi-label">Projected revenue</div><div class="kpi-value">' +
          formatUGX(f.projectedRevenue) +
          '</div></div>' +
          '<div class="card kpi-card"><div class="kpi-label">Projected expenses</div><div class="kpi-value">' +
          formatUGX(f.projectedExpenses) +
          '</div></div>' +
          '<div class="card kpi-card"><div class="kpi-label">Projected net profit</div><div class="kpi-value">' +
          formatUGX(f.projectedNetProfit) +
          '</div></div>' +
          '<div class="card kpi-card"><div class="kpi-label">Funding required</div><div class="kpi-value">' +
          formatUGX(f.fundingRequired) +
          '</div></div></div>' +
          '<p class="u-text-xs u-text-muted" style="margin-top:var(--space-4)">Based on the last 30 days of sales and expenses.</p>';
      } catch (err) {
        content.innerHTML = '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
      }
    };

    actions.querySelector('#btn-fc')?.addEventListener('click', load);
    await load();
  },

  destroy() {}
};
