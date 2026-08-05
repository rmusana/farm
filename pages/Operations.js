/**
 * Operations module – Daily Log, Flock, Feed, Eggs/Sales, Health, Mortality, Inventory, Notes
 */
import { field, serializeForm, validateRequired, clearErrors } from '../components/Form.js';
import { renderDataTable } from '../components/DataTable.js';
import { openModal, closeModal } from '../components/Modal.js';
import { formatUGX, formatNumber } from '../components/KPI.js';
import { toastSuccess, toastError } from '../components/Toast.js';
import { canWrite } from '../js/auth.js';
import api from '../js/api.js';

const TABS = [
  { id: 'daily', label: 'Daily Log' },
  { id: 'flock', label: 'Flock' },
  { id: 'feed', label: 'Feed' },
  { id: 'sales', label: 'Sales' },
  { id: 'health', label: 'Health & Vaccination' },
  { id: 'mortality', label: 'Mortality' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'notes', label: 'Staff Notes' }
];

const FEED_PRODUCTS = [
  { key: 'Brand', label: 'Brand' },
  { key: 'Concentrate', label: 'Concentrate', legacy: 'Hendrix' },
  { key: 'LimePowder', label: 'Lime powder' },
  { key: 'Limestone', label: 'Limestone' },
  { key: 'Soya', label: 'Soya' },
  { key: 'Sunflower', label: 'Sunflower' },
  { key: 'Broken', label: 'Broken' },
  { key: 'Maize', label: 'Maize' },
  { key: 'Others', label: 'Others' }
];
const EGG_TYPES = [
  { id: 'Starter', defaultPrice: 9000 },
  { id: 'Normal', defaultPrice: 11000 },
  { id: 'Medium', defaultPrice: 10000 }
];
const PAYMENT_STATUSES = ['Cash', 'Cheque', 'Debt'];
const SALE_CATEGORIES = ['Eggs', 'Litter', 'Others'];
const TRAY_SIZE = 30; // eggs per tray
const FLOCK_SECTIONS = [
  { id: 'A', birds: 1500, label: 'Section A (1,500)' },
  { id: 'B', birds: 1000, label: 'Section B (1,000)' },
  { id: 'Combined', birds: 2500, label: 'Combined (2,500)' }
];
const MEDS = ['GLUCOVIT', 'ASHYTL', 'LIMOVIT', 'MACROLAN', 'COCCITOLTRAZOL', 'OXYVITAMIN', 'LEVACIDE', 'DISINFECTANT'];
const VACCINES = ['NEWCASTLE IB', 'GUMBOLO 1', 'GUMBOLO 2', 'NEWCASTLE PLAIN', 'FOWL POX', 'DEWORMING', 'DEBEAKING', 'FOWL TYPHOID', 'NEWCASTLE LASOTA'];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function localStore(key, value) {
  if (value === undefined) {
    try { return JSON.parse(localStorage.getItem('rmusana_ops_' + key) || '[]'); } catch { return []; }
  }
  localStorage.setItem('rmusana_ops_' + key, JSON.stringify(value));
}

async function apiOrLocal(resource, action, payload = {}) {
  if (window.RMUSANA_API_URL) {
    return api.request('/operations', {
      body: { module: 'operations', resource, action, projectId: 'LUK54', ...payload }
    });
  }
  // Local persistence for offline / pre-backend
  const key = resource;
  if (action === 'list' || action === 'schedule' || action === 'inventory' || action === 'status') {
    if (resource === 'mortality' && action === 'list') {
      const daily = localStore('daily');
      const out = daily.filter((r) => Number(r.Mortality || r.mortality) > 0).map((r) => ({
        Date: r.Date || r.date,
        Mortality: r.Mortality ?? r.mortality,
        OpeningBirds: r.OpeningBirds ?? r.openingBirds,
        ClosingBirds: r.ClosingBirds ?? r.closingBirds,
        Rate: (r.OpeningBirds || r.openingBirds) > 0
          ? Math.round(Number(r.Mortality || r.mortality) / Number(r.OpeningBirds || r.openingBirds) * 1000) / 10
          : 0,
        Notes: r.Notes || r.notes || '',
        RecordID: r.RecordID || r.id
      }));
      return { success: true, data: out };
    }
    if (action === 'status') {
      const daily = localStore('daily');
      const last = daily[0];
      return {
        success: true,
        data: {
          currentBirds: last?.ClosingBirds ?? last?.closingBirds ?? 2500,
          plannedBirds: 2500,
          week: 1,
          startDate: '2026-06-01',
          lastProductionDate: last?.Date || last?.date || null
        }
      };
    }
    if (action === 'schedule') {
      let sched = localStore('schedule');
      if (!sched.length) {
        sched = [
          { Week: 1, Vaccine: 'NEWCASTLE IB', Status: 'Pending', PlannedDate: '2026-06-01' },
          { Week: 2, Vaccine: 'GUMBOLO 1', Status: 'Pending', PlannedDate: '2026-06-08' },
          { Week: 3, Vaccine: 'GUMBOLO 2', Status: 'Pending', PlannedDate: '2026-06-15' },
          { Week: 4, Vaccine: 'NEWCASTLE PLAIN', Status: 'Pending', PlannedDate: '2026-06-22' },
          { Week: 6, Vaccine: 'FOWL POX', Status: 'Pending', PlannedDate: '2026-07-06' },
          { Week: 8, Vaccine: 'DEWORMING', Status: 'Pending', PlannedDate: '2026-07-20' },
          { Week: 10, Vaccine: 'DEBEAKING', Status: 'Pending', PlannedDate: '2026-08-03' },
          { Week: 12, Vaccine: 'FOWL TYPHOID', Status: 'Pending', PlannedDate: '2026-08-17' }
        ];
        localStore('schedule', sched);
      }
      return { success: true, data: sched };
    }
    if (action === 'inventory' && resource === 'feed') {
      let inv = localStore('feedInv');
      if (!inv.length) {
        inv = FEED_PRODUCTS.map((p) => ({ Product: p.label || p, ClosingStock: 0, UnitCost: 0 }));
        localStore('feedInv', inv);
      }
      return { success: true, data: inv };
    }
    return { success: true, data: localStore(key) };
  }
  if (action === 'create' || action === 'purchase' || action === 'adjust') {
    const list = localStore(key);
    const id = 'local_' + Date.now();
    const row = { ...payload, id, RecordID: id, CreatedAt: new Date().toISOString() };
    // Normalise daily
    if (resource === 'daily') {
      const opening = Number(payload.openingBirds) || 0;
      const mortality = Number(payload.mortality) || 0;
      row.RecordID = id;
      row.Date = payload.date;
      row.OpeningBirds = opening;
      row.Mortality = mortality;
      row.ClosingBirds = payload.closingBirds != null ? Number(payload.closingBirds) : opening - mortality;
      row.EggsCollected = Number(payload.eggsCollected) || 0;
      row.Breakages = Number(payload.breakages) || 0;
      row.FeedBrandKg = Number(payload.feedBrandKg) || 0;
      row.FeedHendrixKg = Number(payload.feedHendrixKg || payload.feedConcentrateKg) || 0;
      row.Section = payload.section || 'Combined';
      row.EggsLost = Number(payload.eggsLost) || 0;
      row.FeedMaizeKg = Number(payload.feedMaizeKg) || 0;
      row.FeedOthersKg = Number(payload.feedOthersKg) || 0;
      row.FeedLimePowderKg = Number(payload.feedLimePowderKg) || 0;
      row.FeedLimestoneKg = Number(payload.feedLimestoneKg) || 0;
      row.FeedLimeKg = Number(payload.feedLimeKg) || 0;
      row.FeedSoyaKg = Number(payload.feedSoyaKg) || 0;
      row.FeedSunflowerKg = Number(payload.feedSunflowerKg) || 0;
      row.FeedBrokenKg = Number(payload.feedBrokenKg) || 0;
      row.Notes = payload.notes || '';
    }
    if (resource === 'sales' || resource === 'eggs') {
      row.Date = payload.date;
      row.Customer = payload.customer || '';
      row.QuantityEggs = Number(payload.quantityEggs) || (Number(payload.quantityTrays)||0)*30;
      row.QuantityTrays = Number(payload.quantityTrays) || (Number(payload.quantityEggs)||0)/30;
      row.SaleCategory = payload.saleCategory || 'Eggs';
      row.EggType = payload.eggType || '';
      row.BreakageTraysSold = Number(payload.breakageTraysSold)||0;
      row.DamagedTraysSold = Number(payload.damagedTraysSold)||0;
      row.LostTrays = Number(payload.lostTrays)||0;
      row.UnitPrice = Number(payload.unitPrice) || 0;
      row.TotalRevenue = (row.QuantityTrays ? row.QuantityTrays * row.UnitPrice : row.QuantityEggs * row.UnitPrice);
      row.PaymentStatus = payload.paymentStatus || 'Paid';
    }
    if (resource === 'feed' && action === 'purchase') {
      row.Date = payload.date;
      row.Product = payload.product;
      row.QtyKg = Number(payload.qtyKg) || 0;
      row.UnitCost = Number(payload.unitCost) || 0;
      row.TotalCost = row.QtyKg * row.UnitCost;
      row.Supplier = payload.supplier || '';
      const inv = localStore('feedInv');
      const item = inv.find((i) => i.Product === row.Product);
      if (item) item.ClosingStock = (Number(item.ClosingStock) || 0) + row.QtyKg;
      else inv.push({ Product: row.Product, ClosingStock: row.QtyKg, UnitCost: row.UnitCost });
      localStore('feedInv', inv);
    }
    if (resource === 'health') {
      row.Date = payload.date;
      row.Type = payload.type;
      row.Product = payload.product;
      row.Week = payload.week;
      row.Notes = payload.notes || '';
    }
    if (resource === 'notes') {
      row.Date = payload.date || today();
      row.Content = payload.content;
      row.Category = payload.category || 'General';
    }
    if (resource === 'flock') {
      row.Date = payload.date;
      row.EventType = payload.eventType;
      row.Quantity = Number(payload.quantity) || 0;
      row.AgeWeek = payload.ageWeek;
      row.Notes = payload.notes || '';
    }
    if (resource === 'inventory') {
      row.Name = payload.name;
      row.Category = payload.category || 'General';
      row.Quantity = Number(payload.quantity) || 0;
      row.Unit = payload.unit || 'units';
      const inv = localStore('inventory');
      const existing = inv.find((i) => i.Name === row.Name);
      if (existing) {
        existing.Quantity = (Number(existing.Quantity) || 0) + (payload.type === 'Out' ? -Math.abs(row.Quantity) : Math.abs(row.Quantity));
        localStore('inventory', inv);
        return { success: true, data: existing };
      }
      localStore('inventory', [row, ...inv]);
      return { success: true, data: row };
    }
    list.unshift(row);
    localStore(key === 'eggs' ? 'sales' : key, list);
    return { success: true, data: row };
  }
  return { success: true, data: [] };
}

export default {
  activeTab: 'daily',

  async render(root) {
    this.root = root;
    const writable = canWrite('operations');

    root.innerHTML = `
      <div class="page-header">
        <div class="page-header-title">
          <div class="breadcrumb"><span>Main</span><span>/</span><span>Operations</span></div>
          <h1>Operations</h1>
          <p class="u-text-secondary u-text-sm">LUK54 Flock — daily farm operations</p>
        </div>
        <div class="page-header-actions" id="ops-actions"></div>
      </div>

      <div class="card">
        <div class="card-header" style="overflow-x:auto">
          <div style="display:flex;gap:var(--space-1)" id="ops-tabs">
            ${TABS.map((t) => `
              <button class="btn btn-sm ${t.id === this.activeTab ? 'btn-primary' : 'btn-ghost'}" data-tab="${t.id}">${t.label}</button>
            `).join('')}
          </div>
        </div>
        <div class="card-body" id="ops-content">
          <div class="skeleton" style="height:200px"></div>
        </div>
      </div>
    `;

    root.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        root.querySelectorAll('[data-tab]').forEach((b) => {
          b.classList.toggle('btn-primary', b.dataset.tab === this.activeTab);
          b.classList.toggle('btn-ghost', b.dataset.tab !== this.activeTab);
        });
        this.renderTab();
      });
    });

    this.writable = writable;
    await this.renderTab();
    if (window.lucide) window.lucide.createIcons({ nodes: [root] });
  },

  async renderTab() {
    const content = this.root.querySelector('#ops-content');
    const actions = this.root.querySelector('#ops-actions');
    if (!content) return;

    content.innerHTML = `<div class="skeleton" style="height:180px"></div>`;
    actions.innerHTML = '';

    const map = {
      daily: () => this.tabDaily(content, actions),
      flock: () => this.tabFlock(content, actions),
      feed: () => this.tabFeed(content, actions),
      sales: () => this.tabSales(content, actions),
      health: () => this.tabHealth(content, actions),
      mortality: () => this.tabMortality(content, actions),
      inventory: () => this.tabInventory(content, actions),
      notes: () => this.tabNotes(content, actions)
    };
    await (map[this.activeTab] || map.daily)();
    if (window.lucide) window.lucide.createIcons({ nodes: [this.root] });
  },

  /* ── Daily Log ────────────────────────────────────────── */

  async tabDaily(content, actions) {
    if (this.writable) {
      actions.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-new-daily"><i data-lucide="plus" style="width:14px;height:14px"></i> Log Day</button>`;
      actions.querySelector('#btn-new-daily')?.addEventListener('click', () => this.formDaily());
    }

    try {
      const res = await apiOrLocal('daily', 'list');
      const rows = res.data || [];
      content.innerHTML = `<div id="daily-table"></div>`;
      renderDataTable(content.querySelector('#daily-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: (r) => r.Date || r.date },
          { key: 'OpeningBirds', label: 'Opening', accessor: (r) => formatNumber(r.OpeningBirds ?? r.openingBirds) },
          { key: 'Mortality', label: 'Mortality', accessor: (r) => formatNumber(r.Mortality ?? r.mortality) },
          { key: 'ClosingBirds', label: 'Closing', accessor: (r) => formatNumber(r.ClosingBirds ?? r.closingBirds) },
          { key: 'EggsCollected', label: 'Eggs', accessor: (r) => formatNumber(r.EggsCollected ?? r.eggsCollected) },
          { key: 'Breakages', label: 'Breakages', accessor: (r) => formatNumber(r.Breakages ?? r.breakages) },
          {
            key: 'Feed', label: 'Feed (kg)', accessor: (r) => {
              const t = ['FeedBrandKg', 'FeedHendrixKg', 'FeedLimeKg', 'FeedSoyaKg', 'FeedSunflowerKg', 'FeedBrokenKg']
                .reduce((s, k) => s + (Number(r[k]) || 0), 0);
              return formatNumber(t, 1);
            }
          },
          { key: 'Notes', label: 'Notes', accessor: (r) => (r.Notes || r.notes || '—').toString().slice(0, 40) }
        ],
        rows,
        emptyMessage: 'No daily logs yet. Record the first production day.'
      });
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  formDaily() {
    const html = `
      <form id="form-daily">
        ${field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() })}
        <div class="form-row">
          ${field({ name: 'openingBirds', label: 'Opening birds', type: 'number', required: true, value: '2500' })}
          ${field({ name: 'mortality', label: 'Mortality', type: 'number', value: '0' })}
          ${field({ name: 'closingBirds', label: 'Closing birds', type: 'number', hint: 'Auto: opening − mortality if blank' })}
        </div>
        <div class="form-row">
          ${field({ name: 'section', label: 'Section', type: 'select', options: FLOCK_SECTIONS.map(s => s.id + ' — ' + s.label), value: 'Combined' })}
        </div>
        <div class="form-row">
          ${field({ name: 'eggsCollected', label: 'Eggs collected', type: 'number', value: '0' })}
          ${field({ name: 'breakages', label: 'Breakages (eggs)', type: 'number', value: '0' })}
          ${field({ name: 'eggsLost', label: 'Lost (exchange)', type: 'number', value: '0' })}
        </div>
        <p class="u-font-semibold u-text-sm" style="margin:var(--space-2) 0">Feed issued (kg)</p>
        <div class="form-row">
          ${FEED_PRODUCTS.map((p) => field({ name: 'feed' + p.key + 'Kg', label: p.label, type: 'number', value: '0' })).join('')}
        </div>
        ${field({ name: 'notes', label: 'Notes / observations', type: 'textarea' })}
      </form>
    `;
    openModal({
      title: 'Daily production log',
      content: html,
      size: 'lg',
      footer: `
        <button class="btn btn-secondary" data-modal-close>Cancel</button>
        <button class="btn btn-primary" id="save-daily">Save</button>
      `
    });
    document.getElementById('save-daily')?.addEventListener('click', async () => {
      const form = document.getElementById('form-daily');
      if (!validateRequired(form, ['date', 'openingBirds'])) return;
      const data = serializeForm(form);
      // Map feed fields
      const sectionRaw = (data.section || 'Combined').split('—')[0].trim();
      const payload = {
        date: data.date,
        section: sectionRaw,
        openingBirds: data.openingBirds,
        mortality: data.mortality || 0,
        closingBirds: data.closingBirds || undefined,
        eggsCollected: data.eggsCollected || 0,
        breakages: data.breakages || 0,
        eggsLost: data.eggsLost || 0,
        feedBrandKg: data.feedBrandKg || 0,
        // Concentrate stored in FeedHendrixKg for backward compatibility with existing sheets
        feedHendrixKg: data.feedConcentrateKg || data.feedHendrixKg || 0,
        feedConcentrateKg: data.feedConcentrateKg || 0,
        feedLimeKg: (Number(data.feedLimePowderKg || 0) + Number(data.feedLimestoneKg || 0)) || data.feedLimeKg || 0,
        feedLimePowderKg: data.feedLimePowderKg || 0,
        feedLimestoneKg: data.feedLimestoneKg || 0,
        feedSoyaKg: data.feedSoyaKg || 0,
        feedSunflowerKg: data.feedSunflowerKg || 0,
        feedBrokenKg: data.feedBrokenKg || 0,
        feedMaizeKg: data.feedMaizeKg || 0,
        feedOthersKg: data.feedOthersKg || 0,
        notes: data.notes || ''
      };
      try {
        await apiOrLocal('daily', 'create', payload);
        toastSuccess('Daily log saved');
        closeModal();
        this.renderTab();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    });
  },

  /* ── Flock ────────────────────────────────────────────── */

  async tabFlock(content, actions) {
    if (this.writable) {
      actions.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-flock-event"><i data-lucide="plus" style="width:14px;height:14px"></i> Flock event</button>`;
      actions.querySelector('#btn-flock-event')?.addEventListener('click', () => this.formFlock());
    }
    try {
      const [statusRes, eventsRes] = await Promise.all([
        apiOrLocal('flock', 'status'),
        apiOrLocal('flock', 'list')
      ]);
      const st = statusRes.data || {};
      const events = eventsRes.data || [];
      content.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:var(--space-4)">
          <div class="card kpi-card"><div class="kpi-label">Current birds</div><div class="kpi-value">${formatNumber(st.currentBirds)}</div></div>
          <div class="card kpi-card"><div class="kpi-label">Planned</div><div class="kpi-value">${formatNumber(st.plannedBirds || 2500)}</div></div>
          <div class="card kpi-card"><div class="kpi-label">Week</div><div class="kpi-value">${st.week ?? '—'}</div></div>
          <div class="card kpi-card"><div class="kpi-label">Last production</div><div class="kpi-value" style="font-size:var(--text-base)">${st.lastProductionDate || '—'}</div></div>
        </div>
        <div id="flock-table"></div>
      `;
      renderDataTable(content.querySelector('#flock-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: (r) => r.Date || r.date },
          { key: 'EventType', label: 'Event', accessor: (r) => r.EventType || r.eventType },
          { key: 'Quantity', label: 'Quantity', accessor: (r) => formatNumber(r.Quantity ?? r.quantity) },
          { key: 'AgeWeek', label: 'Week', accessor: (r) => r.AgeWeek ?? r.ageWeek ?? '—' },
          { key: 'Notes', label: 'Notes', accessor: (r) => r.Notes || r.notes || '—' }
        ],
        rows: events,
        emptyMessage: 'No flock events recorded. Log stocking, transfers or off-lay here.'
      });
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  formFlock() {
    const html = `
      <form id="form-flock">
        ${field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() })}
        ${field({
          name: 'eventType', label: 'Event type', type: 'select', required: true,
          options: ['Stocking', 'TransferIn', 'TransferOut', 'OffLay', 'Adjustment']
        })}
        ${field({ name: 'quantity', label: 'Quantity', type: 'number', required: true })}
        ${field({ name: 'ageWeek', label: 'Age (week)', type: 'number' })}
        ${field({ name: 'notes', label: 'Notes', type: 'textarea' })}
      </form>
    `;
    openModal({
      title: 'Flock event',
      content: html,
      footer: `<button class="btn btn-secondary" data-modal-close>Cancel</button><button class="btn btn-primary" id="save-flock">Save</button>`
    });
    document.getElementById('save-flock')?.addEventListener('click', async () => {
      const form = document.getElementById('form-flock');
      if (!validateRequired(form, ['date', 'eventType', 'quantity'])) return;
      try {
        await apiOrLocal('flock', 'create', serializeForm(form));
        toastSuccess('Flock event saved');
        closeModal();
        this.renderTab();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    });
  },

  /* ── Feed ─────────────────────────────────────────────── */

  async tabFeed(content, actions) {
    if (this.writable) {
      actions.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-feed-purchase"><i data-lucide="plus" style="width:14px;height:14px"></i> Record purchase</button>`;
      actions.querySelector('#btn-feed-purchase')?.addEventListener('click', () => this.formFeedPurchase());
    }
    try {
      const [invRes, purchRes] = await Promise.all([
        apiOrLocal('feed', 'inventory'),
        apiOrLocal('feed', 'list')
      ]);
      const inv = invRes.data || [];
      const purchases = purchRes.data || [];
      content.innerHTML = `
        <h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-3)">Inventory</h3>
        <div class="kpi-grid" style="margin-bottom:var(--space-5)">
          ${inv.map((i) => `
            <div class="card kpi-card">
              <div class="kpi-label">${i.Product || i.product}</div>
              <div class="kpi-value">${formatNumber(i.ClosingStock ?? i.closingStock, 1)} <span class="u-text-sm u-text-muted">kg</span></div>
            </div>
          `).join('') || '<p class="u-text-muted">No feed inventory yet.</p>'}
        </div>
        <h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-3)">Purchases</h3>
        <div id="feed-table"></div>
      `;
      renderDataTable(content.querySelector('#feed-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: (r) => r.Date || r.date },
          { key: 'Product', label: 'Product', accessor: (r) => r.Product || r.product },
          { key: 'QtyKg', label: 'Qty (kg)', accessor: (r) => formatNumber(r.QtyKg ?? r.qtyKg, 1) },
          { key: 'UnitCost', label: 'Unit cost', accessor: (r) => formatUGX(r.UnitCost ?? r.unitCost) },
          { key: 'TotalCost', label: 'Total', accessor: (r) => formatUGX(r.TotalCost ?? r.totalCost) },
          { key: 'Supplier', label: 'Supplier', accessor: (r) => r.Supplier || r.supplier || '—' }
        ],
        rows: purchases,
        emptyMessage: 'No feed purchases recorded.'
      });
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  formFeedPurchase() {
    const html = `
      <form id="form-feed">
        ${field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() })}
        ${field({ name: 'product', label: 'Product', type: 'select', required: true, options: FEED_PRODUCTS.map(p => p.label || p) })}
        <div class="form-row">
          ${field({ name: 'qtyKg', label: 'Quantity (kg)', type: 'number', required: true })}
          ${field({ name: 'unitCost', label: 'Unit cost (UGX)', type: 'number', required: true })}
        </div>
        ${field({ name: 'supplier', label: 'Supplier' })}
      </form>
    `;
    openModal({
      title: 'Feed purchase',
      content: html,
      footer: `<button class="btn btn-secondary" data-modal-close>Cancel</button><button class="btn btn-primary" id="save-feed">Save</button>`
    });
    document.getElementById('save-feed')?.addEventListener('click', async () => {
      const form = document.getElementById('form-feed');
      if (!validateRequired(form, ['date', 'product', 'qtyKg', 'unitCost'])) return;
      try {
        await apiOrLocal('feed', 'purchase', serializeForm(form));
        toastSuccess('Feed purchase recorded');
        closeModal();
        this.renderTab();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    });
  },

  /* ── Sales ────────────────────────────────────────────── */

  async tabSales(content, actions) {
    if (this.writable) {
      actions.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-sale"><i data-lucide="plus" style="width:14px;height:14px"></i> Record sale</button>`;
      actions.querySelector('#btn-sale')?.addEventListener('click', () => this.formSale());
    }
    try {
      const res = await apiOrLocal('sales', 'list');
      const rows = res.data || [];
      const total = rows.reduce((s, r) => s + (Number(r.TotalRevenue ?? r.totalRevenue) || 0), 0);
      content.innerHTML = `
        <div class="card kpi-card" style="margin-bottom:var(--space-4);max-width:280px">
          <div class="kpi-label">Total sales revenue</div>
          <div class="kpi-value">${formatUGX(total)}</div>
        </div>
        <div id="sales-table"></div>
      `;
      renderDataTable(content.querySelector('#sales-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: (r) => r.Date || r.date },
          { key: 'SaleCategory', label: 'Type', accessor: (r) => r.SaleCategory || r.saleCategory || 'Eggs' },
          { key: 'EggType', label: 'Egg type', accessor: (r) => r.EggType || r.eggType || '—' },
          { key: 'Customer', label: 'Customer', accessor: (r) => r.Customer || r.customer || '—' },
          { key: 'QuantityTrays', label: 'Trays', accessor: (r) => {
            const trays = r.QuantityTrays ?? r.quantityTrays;
            if (trays != null && trays !== '') return formatNumber(trays);
            const eggs = Number(r.QuantityEggs ?? r.quantityEggs || 0);
            return eggs ? formatNumber(eggs / TRAY_SIZE, 1) : '0';
          }},
          { key: 'UnitPrice', label: 'Price/tray', accessor: (r) => formatUGX(r.UnitPrice ?? r.unitPrice) },
          { key: 'TotalRevenue', label: 'Revenue', accessor: (r) => formatUGX(r.TotalRevenue ?? r.totalRevenue) },
          { key: 'PaymentStatus', label: 'Payment', accessor: (r) => r.PaymentStatus || r.paymentStatus || '—' }
        ],
        rows,
        emptyMessage: 'No sales recorded yet.'
      });
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  formSale() {
    const html = `
      <form id="form-sale">
        ${field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() })}
        <div class="form-row">
          ${field({ name: 'saleCategory', label: 'Sale type', type: 'select', options: SALE_CATEGORIES, value: 'Eggs' })}
          ${field({ name: 'eggType', label: 'Egg type', type: 'select', options: EGG_TYPES.map(e => e.id), value: 'Normal' })}
        </div>
        ${field({ name: 'customer', label: 'Customer' })}
        <div class="form-row">
          ${field({ name: 'quantityTrays', label: 'Quantity (trays)', type: 'number', required: true, hint: TRAY_SIZE + ' eggs per tray' })}
          ${field({ name: 'unitPrice', label: 'Price per tray (UGX)', type: 'number', required: true, value: '11000' })}
        </div>
        <p class="u-text-xs u-text-muted" style="margin-bottom:var(--space-3)">Starter / Normal / Medium have different tray prices — adjust as needed.</p>
        <div class="form-row">
          ${field({ name: 'breakageTraysSold', label: 'Breakage sold (trays)', type: 'number', value: '0' })}
          ${field({ name: 'damagedTraysSold', label: 'Damaged sold (trays)', type: 'number', value: '0' })}
          ${field({ name: 'lostTrays', label: 'Lost in exchange (trays)', type: 'number', value: '0' })}
        </div>
        ${field({
          name: 'paymentStatus', label: 'Payment status', type: 'select',
          options: PAYMENT_STATUSES, value: 'Cash'
        })}
        ${field({ name: 'paymentRef', label: 'Payment reference / cheque no.' })}
        ${field({ name: 'notes', label: 'Notes', type: 'textarea' })}
      </form>
    `;
    openModal({
      title: 'Record sale',
      content: html,
      size: 'lg',
      footer: `<button class="btn btn-secondary" data-modal-close>Cancel</button><button class="btn btn-primary" id="save-sale">Save</button>`
    });
    // Auto price by egg type
    const formEl = document.getElementById('form-sale');
    formEl?.querySelector('[name="eggType"]')?.addEventListener('change', (e) => {
      const found = EGG_TYPES.find((x) => x.id === e.target.value);
      const price = formEl.querySelector('[name="unitPrice"]');
      if (found && price) price.value = found.defaultPrice;
    });
    document.getElementById('save-sale')?.addEventListener('click', async () => {
      const form = document.getElementById('form-sale');
      if (!validateRequired(form, ['date', 'quantityTrays', 'unitPrice'])) return;
      const data = serializeForm(form);
      const trays = Number(data.quantityTrays) || 0;
      const payload = {
        ...data,
        quantityTrays: trays,
        quantityEggs: trays * TRAY_SIZE, // backward compatible for existing reports
        unitPrice: data.unitPrice,
        saleCategory: data.saleCategory || 'Eggs',
        eggType: data.eggType || 'Normal',
        paymentStatus: data.paymentStatus || 'Cash',
        breakageTraysSold: data.breakageTraysSold || 0,
        damagedTraysSold: data.damagedTraysSold || 0,
        lostTrays: data.lostTrays || 0
      };
      try {
        await apiOrLocal('sales', 'create', payload);
        toastSuccess('Sale recorded');
        closeModal();
        this.renderTab();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    });
  },

  /* ── Health ───────────────────────────────────────────── */

  async tabHealth(content, actions) {
    if (this.writable) {
      actions.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-health"><i data-lucide="plus" style="width:14px;height:14px"></i> Log treatment</button>`;
      actions.querySelector('#btn-health')?.addEventListener('click', () => this.formHealth());
    }
    try {
      const [schedRes, eventsRes] = await Promise.all([
        apiOrLocal('health', 'schedule'),
        apiOrLocal('health', 'list')
      ]);
      const schedule = schedRes.data || [];
      const events = eventsRes.data || [];
      content.innerHTML = `
        <h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-3)">Vaccination schedule</h3>
        <div id="sched-table" style="margin-bottom:var(--space-5)"></div>
        <h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-3)">Treatments & events</h3>
        <div id="health-table"></div>
      `;
      renderDataTable(content.querySelector('#sched-table'), {
        columns: [
          { key: 'Week', label: 'Week', accessor: (r) => r.Week || r.week || '—' },
          { key: 'Vaccine', label: 'Vaccine', accessor: (r) => r.Vaccine || r.vaccine },
          { key: 'PlannedDate', label: 'Planned', accessor: (r) => r.PlannedDate || r.plannedDate || '—' },
          { key: 'ActualDate', label: 'Actual', accessor: (r) => r.ActualDate || r.actualDate || '—' },
          {
            key: 'Status', label: 'Status', accessor: (r) => {
              const s = r.Status || r.status || 'Pending';
              const cls = s === 'Completed' ? 'positive' : s === 'Recurring' ? 'info' : 'caution';
              return `<span class="badge badge-${cls}">${s}</span>`;
            }
          }
        ],
        rows: schedule,
        emptyMessage: 'Schedule will seed from budget on first load via API.'
      });
      renderDataTable(content.querySelector('#health-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: (r) => r.Date || r.date },
          { key: 'Type', label: 'Type', accessor: (r) => r.Type || r.type },
          { key: 'Product', label: 'Product', accessor: (r) => r.Product || r.product },
          { key: 'Week', label: 'Week', accessor: (r) => r.Week ?? r.week ?? '—' },
          { key: 'Notes', label: 'Notes', accessor: (r) => r.Notes || r.notes || '—' }
        ],
        rows: events,
        emptyMessage: 'No health events logged.'
      });
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  formHealth() {
    const html = `
      <form id="form-health">
        ${field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() })}
        ${field({
          name: 'type', label: 'Type', type: 'select', required: true,
          options: ['Vaccination', 'Medication', 'Treatment', 'Biosecurity']
        })}
        ${field({
          name: 'product', label: 'Product', type: 'select', required: true,
          options: [...VACCINES, ...MEDS]
        })}
        <div class="form-row">
          ${field({ name: 'week', label: 'Flock week', type: 'number' })}
          ${field({ name: 'birds', label: 'Birds treated', type: 'number' })}
        </div>
        ${field({ name: 'qty', label: 'Quantity used' })}
        ${field({ name: 'nextDue', label: 'Next due', type: 'date' })}
        ${field({ name: 'notes', label: 'Notes', type: 'textarea' })}
      </form>
    `;
    openModal({
      title: 'Health / vaccination log',
      content: html,
      size: 'lg',
      footer: `<button class="btn btn-secondary" data-modal-close>Cancel</button><button class="btn btn-primary" id="save-health">Save</button>`
    });
    document.getElementById('save-health')?.addEventListener('click', async () => {
      const form = document.getElementById('form-health');
      if (!validateRequired(form, ['date', 'type', 'product'])) return;
      try {
        await apiOrLocal('health', 'create', serializeForm(form));
        toastSuccess('Health event saved');
        closeModal();
        this.renderTab();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    });
  },

  /* ── Mortality ────────────────────────────────────────── */

  async tabMortality(content, actions) {
    try {
      const res = await apiOrLocal('mortality', 'list');
      const rows = res.data || [];
      const total = rows.reduce((s, r) => s + (Number(r.Mortality) || 0), 0);
      content.innerHTML = `
        <div class="card kpi-card" style="margin-bottom:var(--space-4);max-width:240px">
          <div class="kpi-label">Total mortality recorded</div>
          <div class="kpi-value">${formatNumber(total)}</div>
        </div>
        <div id="mort-table"></div>
        <p class="u-text-xs u-text-muted" style="margin-top:var(--space-3)">Mortality is captured in the Daily Log. Abnormal daily losses (&gt;1% of opening) raise a critical alert.</p>
      `;
      renderDataTable(content.querySelector('#mort-table'), {
        columns: [
          { key: 'Date', label: 'Date' },
          { key: 'Mortality', label: 'Count', accessor: (r) => formatNumber(r.Mortality) },
          { key: 'OpeningBirds', label: 'Opening', accessor: (r) => formatNumber(r.OpeningBirds) },
          { key: 'Rate', label: 'Rate %', accessor: (r) => r.Rate != null ? r.Rate + '%' : '—' },
          { key: 'Notes', label: 'Notes', accessor: (r) => r.Notes || '—' }
        ],
        rows,
        emptyMessage: 'No mortality recorded.'
      });
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  /* ── Inventory ────────────────────────────────────────── */

  async tabInventory(content, actions) {
    if (this.writable) {
      actions.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-inv"><i data-lucide="plus" style="width:14px;height:14px"></i> Adjust stock</button>`;
      actions.querySelector('#btn-inv')?.addEventListener('click', () => this.formInventory());
    }
    try {
      const res = await apiOrLocal('inventory', 'list');
      const rows = res.data || [];
      content.innerHTML = `<div id="inv-table"></div>`;
      renderDataTable(content.querySelector('#inv-table'), {
        columns: [
          { key: 'Name', label: 'Item', accessor: (r) => r.Name || r.name },
          { key: 'Category', label: 'Category', accessor: (r) => r.Category || r.category || '—' },
          { key: 'Quantity', label: 'Qty', accessor: (r) => formatNumber(r.Quantity ?? r.quantity) },
          { key: 'Unit', label: 'Unit', accessor: (r) => r.Unit || r.unit || '—' },
          { key: 'ReorderLevel', label: 'Reorder at', accessor: (r) => formatNumber(r.ReorderLevel ?? r.reorderLevel) }
        ],
        rows,
        emptyMessage: 'No inventory items. Track meds, vaccines, trays, equipment here.'
      });
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  formInventory() {
    const html = `
      <form id="form-inv">
        ${field({ name: 'name', label: 'Item name', required: true })}
        ${field({
          name: 'category', label: 'Category', type: 'select',
          options: ['Medication', 'Vaccine', 'Equipment', 'Consumable', 'Trays', 'General']
        })}
        ${field({
          name: 'type', label: 'Movement', type: 'select', required: true,
          options: ['In', 'Out', 'Adjustment']
        })}
        <div class="form-row">
          ${field({ name: 'quantity', label: 'Quantity', type: 'number', required: true })}
          ${field({ name: 'unit', label: 'Unit', value: 'units' })}
        </div>
        ${field({ name: 'reorderLevel', label: 'Reorder level', type: 'number', value: '0' })}
      </form>
    `;
    openModal({
      title: 'Inventory adjustment',
      content: html,
      footer: `<button class="btn btn-secondary" data-modal-close>Cancel</button><button class="btn btn-primary" id="save-inv">Save</button>`
    });
    document.getElementById('save-inv')?.addEventListener('click', async () => {
      const form = document.getElementById('form-inv');
      if (!validateRequired(form, ['name', 'type', 'quantity'])) return;
      try {
        await apiOrLocal('inventory', 'adjust', serializeForm(form));
        toastSuccess('Inventory updated');
        closeModal();
        this.renderTab();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    });
  },

  /* ── Notes ────────────────────────────────────────────── */

  async tabNotes(content, actions) {
    if (this.writable) {
      actions.innerHTML = `<button class="btn btn-primary btn-sm" id="btn-note"><i data-lucide="plus" style="width:14px;height:14px"></i> Add note</button>`;
      actions.querySelector('#btn-note')?.addEventListener('click', () => this.formNote());
    }
    try {
      const res = await apiOrLocal('notes', 'list');
      const rows = res.data || [];
      if (!rows.length) {
        content.innerHTML = `<div class="empty-state"><p class="empty-state-title">No notes yet</p><p class="empty-state-desc">Manager observations and recommendations appear here.</p></div>`;
        return;
      }
      content.innerHTML = rows.map((n) => `
        <div class="card" style="padding:var(--space-4);margin-bottom:var(--space-3)">
          <div style="display:flex;justify-content:space-between;gap:var(--space-2);margin-bottom:var(--space-2)">
            <span class="badge badge-neutral">${n.Category || n.category || 'General'}</span>
            <span class="u-text-xs u-text-muted">${n.Date || n.date || ''} · ${n.CreatedBy || n.createdBy || ''}</span>
          </div>
          <p class="u-text-sm" style="color:var(--color-text);white-space:pre-wrap">${n.Content || n.content || ''}</p>
        </div>
      `).join('');
    } catch (err) {
      content.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  formNote() {
    const html = `
      <form id="form-note">
        ${field({ name: 'date', label: 'Date', type: 'date', value: today() })}
        ${field({
          name: 'category', label: 'Category', type: 'select',
          options: ['General', 'Observation', 'Recommendation', 'Issue', 'Biosecurity']
        })}
        ${field({ name: 'content', label: 'Note', type: 'textarea', required: true, rows: 5 })}
      </form>
    `;
    openModal({
      title: 'Staff note',
      content: html,
      footer: `<button class="btn btn-secondary" data-modal-close>Cancel</button><button class="btn btn-primary" id="save-note">Save</button>`
    });
    document.getElementById('save-note')?.addEventListener('click', async () => {
      const form = document.getElementById('form-note');
      if (!validateRequired(form, ['content'])) return;
      try {
        await apiOrLocal('notes', 'create', serializeForm(form));
        toastSuccess('Note saved');
        closeModal();
        this.renderTab();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    });
  },

  destroy() {}
};
