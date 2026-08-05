/**
 * Operations – Daily Log, Flock, Feed, Sales, Health, Mortality, Inventory, Notes
 */
import { field, serializeForm, validateRequired } from '../components/Form.js';
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
  { key: 'Concentrate', label: 'Concentrate' },
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
const TRAY_SIZE = 30;

const FLOCK_SECTIONS = [
  { id: 'Combined', label: 'Combined (2,500)' },
  { id: 'A', label: 'Section A (1,500)' },
  { id: 'B', label: 'Section B (1,000)' }
];

const MEDS = [
  'GLUCOVIT', 'ASHYTL', 'LIMOVIT', 'MACROLAN', 'COCCITOLTRAZOL',
  'OXYVITAMIN', 'LEVACIDE', 'DISINFECTANT'
];
const VACCINES = [
  'NEWCASTLE IB', 'GUMBOLO 1', 'GUMBOLO 2', 'NEWCASTLE PLAIN',
  'FOWL POX', 'DEWORMING', 'DEBEAKING', 'FOWL TYPHOID', 'NEWCASTLE LASOTA'
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function localStore(key, value) {
  if (value === undefined) {
    try {
      return JSON.parse(localStorage.getItem('rmusana_ops_' + key) || '[]');
    } catch (e) {
      return [];
    }
  }
  localStorage.setItem('rmusana_ops_' + key, JSON.stringify(value));
}

async function apiOrLocal(resource, action, payload) {
  payload = payload || {};
  if (window.RMUSANA_API_URL) {
    return api.request('/operations', {
      body: {
        module: 'operations',
        resource: resource,
        action: action,
        projectId: 'LUK54',
        ...payload
      }
    });
  }

  // Offline localStorage path
  if (action === 'list' || action === 'schedule' || action === 'inventory' || action === 'status') {
    if (resource === 'mortality') {
      const daily = localStore('daily');
      const out = daily
        .filter(function (r) {
          return Number(r.Mortality || r.mortality) > 0;
        })
        .map(function (r) {
          const open = Number(r.OpeningBirds || r.openingBirds || 0);
          const mort = Number(r.Mortality || r.mortality || 0);
          return {
            Date: r.Date || r.date,
            Mortality: mort,
            OpeningBirds: open,
            ClosingBirds: r.ClosingBirds || r.closingBirds,
            Rate: open > 0 ? Math.round((mort / open) * 1000) / 10 : 0,
            Notes: r.Notes || r.notes || ''
          };
        });
      return { success: true, data: out };
    }
    if (action === 'status') {
      const daily = localStore('daily');
      const last = daily[0];
      return {
        success: true,
        data: {
          currentBirds: last ? Number(last.ClosingBirds || last.closingBirds || 2500) : 2500,
          plannedBirds: 2500,
          week: 1,
          startDate: '2026-06-01',
          lastProductionDate: last ? last.Date || last.date : null
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
        inv = FEED_PRODUCTS.map(function (p) {
          return { Product: p.label, ClosingStock: 0, UnitCost: 0 };
        });
        localStore('feedInv', inv);
      }
      return { success: true, data: inv };
    }
    if (resource === 'inventory') {
      return { success: true, data: localStore('inventory') };
    }
    if (resource === 'feed') {
      return { success: true, data: localStore('feed') };
    }
    if (resource === 'sales' || resource === 'eggs') {
      return { success: true, data: localStore('sales') };
    }
    if (resource === 'daily') {
      return { success: true, data: localStore('daily') };
    }
    if (resource === 'flock') {
      return { success: true, data: localStore('flock') };
    }
    if (resource === 'health') {
      return { success: true, data: localStore('health') };
    }
    if (resource === 'notes') {
      return { success: true, data: localStore('notes') };
    }
    return { success: true, data: localStore(resource) };
  }

  if (action === 'create' || action === 'purchase' || action === 'adjust') {
    const storeKey =
      resource === 'feed' && action === 'purchase'
        ? 'feed'
        : resource === 'sales' || resource === 'eggs'
          ? 'sales'
          : resource;
    const list = localStore(storeKey);
    const row = Object.assign({}, payload, {
      RecordID: 'local_' + Date.now(),
      CreatedAt: new Date().toISOString()
    });

    if (resource === 'daily') {
      const open = Number(payload.openingBirds) || 0;
      const mort = Number(payload.mortality) || 0;
      row.Date = payload.date;
      row.Section = payload.section || 'Combined';
      row.OpeningBirds = open;
      row.Mortality = mort;
      row.ClosingBirds = payload.closingBirds != null && payload.closingBirds !== ''
        ? Number(payload.closingBirds)
        : open - mort;
      row.EggsTrays = Number(payload.eggsTrays) || (Number(payload.eggsCollected) || 0) / 30;
      row.EggsCollected = Number(payload.eggsCollected) || (Number(payload.eggsTrays) || 0) * 30;
      row.Breakages = Number(payload.breakages) || 0;
      row.EggsLost = Number(payload.eggsLost) || 0;
      row.FeedBrandKg = Number(payload.feedBrandKg) || 0;
      row.FeedHendrixKg = Number(payload.feedHendrixKg || payload.feedConcentrateKg) || 0;
      row.FeedConcentrateKg = Number(payload.feedConcentrateKg) || 0;
      row.FeedLimePowderKg = Number(payload.feedLimePowderKg) || 0;
      row.FeedLimestoneKg = Number(payload.feedLimestoneKg) || 0;
      row.FeedLimeKg = Number(payload.feedLimeKg) || 0;
      row.FeedSoyaKg = Number(payload.feedSoyaKg) || 0;
      row.FeedSunflowerKg = Number(payload.feedSunflowerKg) || 0;
      row.FeedBrokenKg = Number(payload.feedBrokenKg) || 0;
      row.FeedMaizeKg = Number(payload.feedMaizeKg) || 0;
      row.FeedOthersKg = Number(payload.feedOthersKg) || 0;
      row.Notes = payload.notes || '';
    }

    if (resource === 'sales' || resource === 'eggs') {
      const trays = Number(payload.quantityTrays) || 0;
      const eggs = Number(payload.quantityEggs) || trays * TRAY_SIZE;
      const price = Number(payload.unitPrice) || 0;
      row.Date = payload.date;
      row.Customer = payload.customer || '';
      row.QuantityTrays = trays || eggs / TRAY_SIZE;
      row.QuantityEggs = eggs;
      row.UnitPrice = price;
      row.TotalRevenue = trays ? trays * price : eggs * price;
      row.SaleCategory = payload.saleCategory || 'Eggs';
      row.EggType = payload.eggType || '';
      row.PaymentStatus = payload.paymentStatus || 'Cash';
      row.PaymentRef = payload.paymentRef || '';
      row.BreakageTraysSold = Number(payload.breakageTraysSold) || 0;
      row.DamagedTraysSold = Number(payload.damagedTraysSold) || 0;
      row.LostTrays = Number(payload.lostTrays) || 0;
      row.Notes = payload.notes || '';
    }

    if (resource === 'feed' && action === 'purchase') {
      row.Date = payload.date;
      row.Product = payload.product;
      row.QtyKg = Number(payload.qtyKg) || 0;
      row.UnitCost = Number(payload.unitCost) || 0;
      row.TotalCost = row.QtyKg * row.UnitCost;
      row.Supplier = payload.supplier || '';
      const inv = localStore('feedInv');
      const item = inv.find(function (i) {
        return i.Product === row.Product;
      });
      if (item) {
        item.ClosingStock = (Number(item.ClosingStock) || 0) + row.QtyKg;
      } else {
        inv.push({ Product: row.Product, ClosingStock: row.QtyKg, UnitCost: row.UnitCost });
      }
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
    if (resource === 'inventory' && action === 'adjust') {
      row.Name = payload.name;
      row.Quantity = Number(payload.quantity) || 0;
      row.Unit = payload.unit || '';
      const inv = localStore('inventory');
      const existing = inv.find(function (i) {
        return i.Name === row.Name;
      });
      if (existing) {
        existing.Quantity = row.Quantity;
      } else {
        inv.push(row);
      }
      localStore('inventory', inv);
      return { success: true, data: row };
    }

    list.unshift(row);
    localStore(storeKey, list);
    return { success: true, data: row };
  }

  return { success: true, data: {} };
}

function feedTotalKg(r) {
  return (
    Number(r.FeedBrandKg || 0) +
    Number(r.FeedHendrixKg || r.FeedConcentrateKg || 0) +
    Number(r.FeedLimeKg || 0) +
    Number(r.FeedLimePowderKg || 0) +
    Number(r.FeedLimestoneKg || 0) +
    Number(r.FeedSoyaKg || 0) +
    Number(r.FeedSunflowerKg || 0) +
    Number(r.FeedBrokenKg || 0) +
    Number(r.FeedMaizeKg || 0) +
    Number(r.FeedOthersKg || 0)
  );
}

export default {
  activeTab: 'daily',
  root: null,
  writable: false,

  async render(root) {
    this.root = root;
    this.writable = canWrite('operations');

    root.innerHTML =
      '<div class="page-header">' +
      '<div class="page-header-title">' +
      '<div class="breadcrumb"><span>Main</span><span>/</span><span>Operations</span></div>' +
      '<h1>Operations</h1>' +
      '<p class="u-text-secondary u-text-sm">LUK54 Flock — daily farm operations</p>' +
      '</div>' +
      '<div class="page-header-actions" id="ops-actions"></div>' +
      '</div>' +
      '<div style="display:flex;gap:var(--space-1);flex-wrap:wrap;margin-bottom:var(--space-4)" id="ops-tabs">' +
      TABS.map(function (t) {
        const cls = t.id === 'daily' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost';
        return '<button class="' + cls + '" data-tab="' + t.id + '">' + t.label + '</button>';
      }).join('') +
      '</div>' +
      '<div id="ops-content"><div class="skeleton" style="height:180px"></div></div>';

    root.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        this.activeTab = btn.dataset.tab;
        root.querySelectorAll('[data-tab]').forEach(function (b) {
          b.classList.toggle('btn-primary', b.dataset.tab === this.activeTab);
          b.classList.toggle('btn-ghost', b.dataset.tab !== this.activeTab);
        }.bind(this));
        this.renderTab();
      }.bind(this));
    }.bind(this));

    await this.renderTab();
    if (window.lucide) window.lucide.createIcons({ nodes: [root] });
  },

  async renderTab() {
    const content = this.root.querySelector('#ops-content');
    const actions = this.root.querySelector('#ops-actions');
    if (!content) return;
    content.innerHTML = '<div class="skeleton" style="height:140px"></div>';
    if (actions) actions.innerHTML = '';

    const map = {
      daily: function () { return this.tabDaily(content, actions); }.bind(this),
      flock: function () { return this.tabFlock(content, actions); }.bind(this),
      feed: function () { return this.tabFeed(content, actions); }.bind(this),
      sales: function () { return this.tabSales(content, actions); }.bind(this),
      health: function () { return this.tabHealth(content, actions); }.bind(this),
      mortality: function () { return this.tabMortality(content, actions); }.bind(this),
      inventory: function () { return this.tabInventory(content, actions); }.bind(this),
      notes: function () { return this.tabNotes(content, actions); }.bind(this)
    };
    const fn = map[this.activeTab] || map.daily;
    await fn();
    if (window.lucide) window.lucide.createIcons({ nodes: [this.root] });
  },

  /* ── Daily Log ────────────────────────────────────────── */

  async tabDaily(content, actions) {
    if (this.writable) {
      actions.innerHTML =
        '<button class="btn btn-primary btn-sm" id="btn-log-day">' +
        '<i data-lucide="plus" style="width:14px;height:14px"></i> Log Day</button>';
      actions.querySelector('#btn-log-day').addEventListener('click', function () {
        this.formDaily();
      }.bind(this));
    }
    try {
      const res = await apiOrLocal('daily', 'list');
      const rows = res.data || [];
      content.innerHTML = '<div id="daily-table"></div>';
      renderDataTable(content.querySelector('#daily-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: function (r) { return r.Date || r.date; } },
          {
            key: 'Section',
            label: 'Section',
            accessor: function (r) { return r.Section || r.section || 'Combined'; }
          },
          {
            key: 'Opening',
            label: 'Opening',
            accessor: function (r) {
              return formatNumber(r.OpeningBirds ?? r.openingBirds);
            }
          },
          {
            key: 'Mortality',
            label: 'Mortality',
            accessor: function (r) {
              return formatNumber(r.Mortality ?? r.mortality);
            }
          },
          {
            key: 'Closing',
            label: 'Closing',
            accessor: function (r) {
              return formatNumber(r.ClosingBirds ?? r.closingBirds);
            }
          },
          {
            key: 'Eggs',
            label: 'Eggs (trays)',
            accessor: function (r) {
              var trays = r.EggsTrays ?? r.eggsTrays;
              if (trays != null && trays !== '') return formatNumber(trays, 1);
              var eggs = Number((r.EggsCollected ?? r.eggsCollected) || 0);
              return formatNumber(eggs / 30, 1);
            }
          },
          {
            key: 'Feed',
            label: 'Feed (kg)',
            accessor: function (r) {
              return formatNumber(feedTotalKg(r), 1);
            }
          }
        ],
        rows: rows,
        emptyMessage: 'No daily logs yet. Click Log Day to add one.'
      });
    } catch (err) {
      content.innerHTML =
        '<div class="empty-state"><p class="empty-state-desc">' +
        (err.message || 'Failed to load') +
        '</p></div>';
    }
  },

  formDaily() {
    const sectionOpts = FLOCK_SECTIONS.map(function (s) {
      return s.id + ' — ' + s.label;
    });
    let feedFields = '';
    FEED_PRODUCTS.forEach(function (p) {
      feedFields += field({
        name: 'feed' + p.key + 'Kg',
        label: p.label,
        type: 'number',
        value: '0'
      });
    });

    const html =
      '<form id="form-daily">' +
      field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() }) +
      field({
        name: 'section',
        label: 'Section',
        type: 'select',
        options: sectionOpts,
        value: sectionOpts[0]
      }) +
      '<div class="form-row">' +
      field({ name: 'openingBirds', label: 'Opening birds', type: 'number', required: true, value: '2500' }) +
      field({ name: 'mortality', label: 'Mortality', type: 'number', value: '0' }) +
      field({
        name: 'closingBirds',
        label: 'Closing birds',
        type: 'number',
        hint: 'Auto: opening − mortality if blank'
      }) +
      '</div>' +
      '<div class="form-row">' +
      field({ name: 'eggsTrays', label: 'Eggs collected (trays)', type: 'number', value: '0', hint: '30 eggs per tray' }) +
      field({ name: 'breakages', label: 'Breakages (eggs)', type: 'number', value: '0' }) +
      field({ name: 'eggsLost', label: 'Lost (exchange)', type: 'number', value: '0' }) +
      '</div>' +
      '<p class="u-font-semibold u-text-sm" style="margin:var(--space-2) 0">Feed issued (kg)</p>' +
      '<div class="form-row">' +
      feedFields +
      '</div>' +
      field({ name: 'notes', label: 'Notes / observations', type: 'textarea' }) +
      '</form>';

    openModal({
      title: 'Daily production log',
      content: html,
      size: 'lg',
      footer:
        '<button class="btn btn-secondary" data-modal-close>Cancel</button>' +
        '<button class="btn btn-primary" id="save-daily">Save</button>'
    });

    document.getElementById('save-daily').addEventListener('click', async function () {
      const form = document.getElementById('form-daily');
      if (!validateRequired(form, ['date', 'openingBirds'])) return;
      const data = serializeForm(form);
      const sectionRaw = String(data.section || 'Combined').split('—')[0].trim();
      const payload = {
        date: data.date,
        section: sectionRaw,
        openingBirds: data.openingBirds,
        mortality: data.mortality || 0,
        closingBirds: data.closingBirds || undefined,
        eggsTrays: data.eggsTrays || 0,
        eggsCollected: (Number(data.eggsTrays) || 0) * 30, // backend still stores egg count
        breakages: data.breakages || 0,
        eggsLost: data.eggsLost || 0,
        feedBrandKg: data.feedBrandKg || 0,
        feedConcentrateKg: data.feedConcentrateKg || 0,
        feedHendrixKg: data.feedConcentrateKg || 0,
        feedLimePowderKg: data.feedLimePowderKg || 0,
        feedLimestoneKg: data.feedLimestoneKg || 0,
        feedLimeKg:
          Number(data.feedLimePowderKg || 0) + Number(data.feedLimestoneKg || 0) || 0,
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
    }.bind(this));
  },

  /* ── Flock ────────────────────────────────────────────── */

  async tabFlock(content, actions) {
    if (this.writable) {
      actions.innerHTML =
        '<button class="btn btn-primary btn-sm" id="btn-flock-event">' +
        '<i data-lucide="plus" style="width:14px;height:14px"></i> Flock event</button>';
      actions.querySelector('#btn-flock-event').addEventListener('click', function () {
        this.formFlock();
      }.bind(this));
    }
    try {
      const statusRes = await apiOrLocal('flock', 'status');
      const listRes = await apiOrLocal('flock', 'list');
      const st = statusRes.data || {};
      const rows = listRes.data || [];
      content.innerHTML =
        '<div class="kpi-grid" style="margin-bottom:var(--space-4)">' +
        '<div class="card kpi-card"><div class="kpi-label">Current birds</div><div class="kpi-value">' +
        formatNumber(st.currentBirds) +
        '</div></div>' +
        '<div class="card kpi-card"><div class="kpi-label">Planned</div><div class="kpi-value">' +
        formatNumber(st.plannedBirds || 2500) +
        '</div></div>' +
        '<div class="card kpi-card"><div class="kpi-label">Section A</div><div class="kpi-value">1,500</div>' +
        '<div class="kpi-insight">Managed together with B</div></div>' +
        '<div class="card kpi-card"><div class="kpi-label">Section B</div><div class="kpi-value">1,000</div>' +
        '<div class="kpi-insight">Reports combine A + B</div></div>' +
        '</div>' +
        '<div id="flock-table"></div>';
      renderDataTable(content.querySelector('#flock-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: function (r) { return r.Date || r.date; } },
          {
            key: 'EventType',
            label: 'Event',
            accessor: function (r) { return r.EventType || r.eventType || '—'; }
          },
          {
            key: 'Quantity',
            label: 'Qty',
            accessor: function (r) {
              return formatNumber(r.Quantity ?? r.quantity);
            }
          },
          {
            key: 'Notes',
            label: 'Notes',
            accessor: function (r) { return r.Notes || r.notes || '—'; }
          }
        ],
        rows: rows,
        emptyMessage: 'No flock events recorded.'
      });
    } catch (err) {
      content.innerHTML =
        '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  formFlock() {
    const html =
      '<form id="form-flock">' +
      field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() }) +
      field({
        name: 'eventType',
        label: 'Event type',
        type: 'select',
        required: true,
        options: ['Stocking', 'Transfer', 'Culling', 'Sale of birds', 'Other']
      }) +
      field({ name: 'quantity', label: 'Quantity', type: 'number', required: true }) +
      field({ name: 'ageWeek', label: 'Age (week)', type: 'number' }) +
      field({ name: 'notes', label: 'Notes', type: 'textarea' }) +
      '</form>';
    openModal({
      title: 'Flock event',
      content: html,
      footer:
        '<button class="btn btn-secondary" data-modal-close>Cancel</button>' +
        '<button class="btn btn-primary" id="save-flock">Save</button>'
    });
    document.getElementById('save-flock').addEventListener('click', async function () {
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
    }.bind(this));
  },

  /* ── Feed ─────────────────────────────────────────────── */

  async tabFeed(content, actions) {
    if (this.writable) {
      actions.innerHTML =
        '<button class="btn btn-primary btn-sm" id="btn-feed-purchase">' +
        '<i data-lucide="plus" style="width:14px;height:14px"></i> Feed purchase</button>';
      actions.querySelector('#btn-feed-purchase').addEventListener('click', function () {
        this.formFeedPurchase();
      }.bind(this));
    }
    try {
      const invRes = await apiOrLocal('feed', 'inventory');
      const listRes = await apiOrLocal('feed', 'list');
      const inv = invRes.data || [];
      const rows = listRes.data || [];
      content.innerHTML =
        '<h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-3)">Stock</h3>' +
        '<div id="feed-inv" style="margin-bottom:var(--space-5)"></div>' +
        '<h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-3)">Purchases</h3>' +
        '<div id="feed-purch"></div>';
      renderDataTable(content.querySelector('#feed-inv'), {
        columns: [
          {
            key: 'Product',
            label: 'Product',
            accessor: function (r) { return r.Product || r.product; }
          },
          {
            key: 'ClosingStock',
            label: 'Stock (kg)',
            accessor: function (r) {
              return formatNumber(r.ClosingStock ?? r.closingStock, 1);
            }
          },
          {
            key: 'UnitCost',
            label: 'Unit cost',
            accessor: function (r) {
              return formatUGX(r.UnitCost ?? r.unitCost);
            }
          }
        ],
        rows: inv,
        emptyMessage: 'No feed inventory yet.'
      });
      renderDataTable(content.querySelector('#feed-purch'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: function (r) { return r.Date || r.date; } },
          {
            key: 'Product',
            label: 'Product',
            accessor: function (r) { return r.Product || r.product; }
          },
          {
            key: 'QtyKg',
            label: 'Qty (kg)',
            accessor: function (r) {
              return formatNumber(r.QtyKg ?? r.qtyKg, 1);
            }
          },
          {
            key: 'TotalCost',
            label: 'Total',
            accessor: function (r) {
              return formatUGX(r.TotalCost ?? r.totalCost);
            }
          },
          {
            key: 'Supplier',
            label: 'Supplier',
            accessor: function (r) { return r.Supplier || r.supplier || '—'; }
          }
        ],
        rows: rows,
        emptyMessage: 'No feed purchases yet.'
      });
    } catch (err) {
      content.innerHTML =
        '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  formFeedPurchase() {
    const products = FEED_PRODUCTS.map(function (p) {
      return p.label;
    });
    const html =
      '<form id="form-feed">' +
      field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() }) +
      field({
        name: 'product',
        label: 'Product',
        type: 'select',
        required: true,
        options: products
      }) +
      '<div class="form-row">' +
      field({ name: 'qtyKg', label: 'Quantity (kg)', type: 'number', required: true }) +
      field({ name: 'unitCost', label: 'Unit cost (UGX)', type: 'number', required: true }) +
      '</div>' +
      field({ name: 'supplier', label: 'Supplier' }) +
      '</form>';
    openModal({
      title: 'Feed purchase',
      content: html,
      footer:
        '<button class="btn btn-secondary" data-modal-close>Cancel</button>' +
        '<button class="btn btn-primary" id="save-feed">Save</button>'
    });
    document.getElementById('save-feed').addEventListener('click', async function () {
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
    }.bind(this));
  },

  /* ── Sales ────────────────────────────────────────────── */

  async tabSales(content, actions) {
    if (this.writable) {
      actions.innerHTML =
        '<button class="btn btn-primary btn-sm" id="btn-sale">' +
        '<i data-lucide="plus" style="width:14px;height:14px"></i> Record sale</button>';
      actions.querySelector('#btn-sale').addEventListener('click', function () {
        this.formSale();
      }.bind(this));
    }
    try {
      const res = await apiOrLocal('sales', 'list');
      const rows = res.data || [];
      const total = rows.reduce(function (s, r) {
        return s + Number(r.TotalRevenue || r.totalRevenue || 0);
      }, 0);
      content.innerHTML =
        '<div class="card kpi-card" style="margin-bottom:var(--space-4);max-width:280px">' +
        '<div class="kpi-label">Total sales revenue</div>' +
        '<div class="kpi-value">' +
        formatUGX(total) +
        '</div></div>' +
        '<div id="sales-table"></div>';
      renderDataTable(content.querySelector('#sales-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: function (r) { return r.Date || r.date; } },
          {
            key: 'SaleCategory',
            label: 'Type',
            accessor: function (r) {
              return r.SaleCategory || r.saleCategory || 'Eggs';
            }
          },
          {
            key: 'EggType',
            label: 'Egg type',
            accessor: function (r) { return r.EggType || r.eggType || '—'; }
          },
          {
            key: 'Customer',
            label: 'Customer',
            accessor: function (r) { return r.Customer || r.customer || '—'; }
          },
          {
            key: 'Trays',
            label: 'Trays',
            accessor: function (r) {
              const t = r.QuantityTrays ?? r.quantityTrays;
              if (t != null && t !== '') return formatNumber(t, 1);
              const eggs = Number(r.QuantityEggs || r.quantityEggs || 0);
              return formatNumber(eggs / TRAY_SIZE, 1);
            }
          },
          {
            key: 'UnitPrice',
            label: 'Price/tray',
            accessor: function (r) {
              return formatUGX(r.UnitPrice ?? r.unitPrice);
            }
          },
          {
            key: 'TotalRevenue',
            label: 'Revenue',
            accessor: function (r) {
              return formatUGX(r.TotalRevenue ?? r.totalRevenue);
            }
          },
          {
            key: 'PaymentStatus',
            label: 'Payment',
            accessor: function (r) {
              return r.PaymentStatus || r.paymentStatus || '—';
            }
          }
        ],
        rows: rows,
        emptyMessage: 'No sales recorded yet.'
      });
    } catch (err) {
      content.innerHTML =
        '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  formSale() {
    const eggOpts = EGG_TYPES.map(function (e) {
      return e.id;
    });
    const html =
      '<form id="form-sale">' +
      field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() }) +
      '<div class="form-row">' +
      field({
        name: 'saleCategory',
        label: 'Sale type',
        type: 'select',
        options: SALE_CATEGORIES,
        value: 'Eggs'
      }) +
      field({
        name: 'eggType',
        label: 'Egg type',
        type: 'select',
        options: eggOpts,
        value: 'Normal'
      }) +
      '</div>' +
      field({ name: 'customer', label: 'Customer' }) +
      '<div class="form-row">' +
      field({
        name: 'quantityTrays',
        label: 'Quantity (trays)',
        type: 'number',
        required: true,
        hint: TRAY_SIZE + ' eggs per tray'
      }) +
      field({
        name: 'unitPrice',
        label: 'Price per tray (UGX)',
        type: 'number',
        required: true,
        value: '11000'
      }) +
      '</div>' +
      '<p class="u-text-xs u-text-muted" style="margin-bottom:var(--space-3)">' +
      'Starter / Normal / Medium have different tray prices — adjust as needed.</p>' +
      '<div class="form-row">' +
      field({
        name: 'breakageTraysSold',
        label: 'Breakage sold (trays)',
        type: 'number',
        value: '0'
      }) +
      field({
        name: 'damagedTraysSold',
        label: 'Damaged sold (trays)',
        type: 'number',
        value: '0'
      }) +
      field({
        name: 'lostTrays',
        label: 'Lost in exchange (trays)',
        type: 'number',
        value: '0'
      }) +
      '</div>' +
      field({
        name: 'paymentStatus',
        label: 'Payment status',
        type: 'select',
        options: PAYMENT_STATUSES,
        value: 'Cash'
      }) +
      field({ name: 'paymentRef', label: 'Payment reference / cheque no.' }) +
      field({ name: 'notes', label: 'Notes', type: 'textarea' }) +
      '</form>';

    openModal({
      title: 'Record sale',
      content: html,
      size: 'lg',
      footer:
        '<button class="btn btn-secondary" data-modal-close>Cancel</button>' +
        '<button class="btn btn-primary" id="save-sale">Save</button>'
    });

    const formEl = document.getElementById('form-sale');
    const eggSelect = formEl.querySelector('[name="eggType"]');
    if (eggSelect) {
      eggSelect.addEventListener('change', function (e) {
        const found = EGG_TYPES.find(function (x) {
          return x.id === e.target.value;
        });
        const price = formEl.querySelector('[name="unitPrice"]');
        if (found && price) price.value = found.defaultPrice;
      });
    }

    document.getElementById('save-sale').addEventListener('click', async function () {
      const form = document.getElementById('form-sale');
      if (!validateRequired(form, ['date', 'quantityTrays', 'unitPrice'])) return;
      const data = serializeForm(form);
      const trays = Number(data.quantityTrays) || 0;
      const payload = {
        date: data.date,
        customer: data.customer || '',
        quantityTrays: trays,
        quantityEggs: trays * TRAY_SIZE,
        unitPrice: data.unitPrice,
        saleCategory: data.saleCategory || 'Eggs',
        eggType: data.eggType || 'Normal',
        paymentStatus: data.paymentStatus || 'Cash',
        paymentRef: data.paymentRef || '',
        breakageTraysSold: data.breakageTraysSold || 0,
        damagedTraysSold: data.damagedTraysSold || 0,
        lostTrays: data.lostTrays || 0,
        notes: data.notes || ''
      };
      try {
        await apiOrLocal('sales', 'create', payload);
        toastSuccess('Sale recorded');
        closeModal();
        this.renderTab();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    }.bind(this));
  },

  /* ── Health ───────────────────────────────────────────── */

  async tabHealth(content, actions) {
    if (this.writable) {
      actions.innerHTML =
        '<button class="btn btn-primary btn-sm" id="btn-health">' +
        '<i data-lucide="plus" style="width:14px;height:14px"></i> Log treatment</button>';
      actions.querySelector('#btn-health').addEventListener('click', function () {
        this.formHealth();
      }.bind(this));
    }
    try {
      const schedRes = await apiOrLocal('health', 'schedule');
      const eventsRes = await apiOrLocal('health', 'list');
      const schedule = schedRes.data || [];
      const events = eventsRes.data || [];
      content.innerHTML =
        '<h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-3)">Vaccination schedule</h3>' +
        '<div id="sched-table" style="margin-bottom:var(--space-5)"></div>' +
        '<h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-3)">Treatments & events</h3>' +
        '<div id="health-table"></div>';
      renderDataTable(content.querySelector('#sched-table'), {
        columns: [
          {
            key: 'Week',
            label: 'Week',
            accessor: function (r) { return r.Week || r.week || '—'; }
          },
          {
            key: 'Vaccine',
            label: 'Vaccine',
            accessor: function (r) { return r.Vaccine || r.vaccine; }
          },
          {
            key: 'PlannedDate',
            label: 'Planned',
            accessor: function (r) { return r.PlannedDate || r.plannedDate || '—'; }
          },
          {
            key: 'Status',
            label: 'Status',
            accessor: function (r) {
              const s = r.Status || r.status || 'Pending';
              const cls = s === 'Completed' ? 'positive' : s === 'Recurring' ? 'info' : 'caution';
              return '<span class="badge badge-' + cls + '">' + s + '</span>';
            }
          }
        ],
        rows: schedule,
        emptyMessage: 'No schedule.'
      });
      renderDataTable(content.querySelector('#health-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: function (r) { return r.Date || r.date; } },
          {
            key: 'Type',
            label: 'Type',
            accessor: function (r) { return r.Type || r.type; }
          },
          {
            key: 'Product',
            label: 'Product',
            accessor: function (r) { return r.Product || r.product; }
          },
          {
            key: 'Notes',
            label: 'Notes',
            accessor: function (r) { return r.Notes || r.notes || '—'; }
          }
        ],
        rows: events,
        emptyMessage: 'No treatments logged.'
      });
    } catch (err) {
      content.innerHTML =
        '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  formHealth() {
    const html =
      '<form id="form-health">' +
      field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() }) +
      field({
        name: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: ['Vaccination', 'Medication', 'Treatment', 'Other']
      }) +
      field({
        name: 'product',
        label: 'Product',
        type: 'select',
        required: true,
        options: VACCINES.concat(MEDS)
      }) +
      field({ name: 'week', label: 'Week', type: 'number' }) +
      field({ name: 'notes', label: 'Notes', type: 'textarea' }) +
      '</form>';
    openModal({
      title: 'Log treatment',
      content: html,
      footer:
        '<button class="btn btn-secondary" data-modal-close>Cancel</button>' +
        '<button class="btn btn-primary" id="save-health">Save</button>'
    });
    document.getElementById('save-health').addEventListener('click', async function () {
      const form = document.getElementById('form-health');
      if (!validateRequired(form, ['date', 'type', 'product'])) return;
      try {
        await apiOrLocal('health', 'create', serializeForm(form));
        toastSuccess('Treatment logged');
        closeModal();
        this.renderTab();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    }.bind(this));
  },

  /* ── Mortality ────────────────────────────────────────── */

  async tabMortality(content) {
    try {
      const res = await apiOrLocal('mortality', 'list');
      const rows = res.data || [];
      content.innerHTML = '<div id="mort-table"></div>';
      renderDataTable(content.querySelector('#mort-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: function (r) { return r.Date || r.date; } },
          {
            key: 'Mortality',
            label: 'Deaths',
            accessor: function (r) {
              return formatNumber(r.Mortality ?? r.mortality);
            }
          },
          {
            key: 'Rate',
            label: 'Rate %',
            accessor: function (r) { return r.Rate != null ? r.Rate : '—'; }
          },
          {
            key: 'Notes',
            label: 'Notes',
            accessor: function (r) { return r.Notes || r.notes || '—'; }
          }
        ],
        rows: rows,
        emptyMessage: 'No mortality recorded in daily logs.'
      });
    } catch (err) {
      content.innerHTML =
        '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  /* ── Inventory ────────────────────────────────────────── */

  async tabInventory(content, actions) {
    if (this.writable) {
      actions.innerHTML =
        '<button class="btn btn-primary btn-sm" id="btn-inv">' +
        '<i data-lucide="plus" style="width:14px;height:14px"></i> Adjust stock</button>';
      actions.querySelector('#btn-inv').addEventListener('click', function () {
        this.formInventory();
      }.bind(this));
    }
    try {
      const res = await apiOrLocal('inventory', 'list');
      const rows = res.data || [];
      content.innerHTML = '<div id="inv-table"></div>';
      renderDataTable(content.querySelector('#inv-table'), {
        columns: [
          {
            key: 'Name',
            label: 'Item',
            accessor: function (r) { return r.Name || r.name; }
          },
          {
            key: 'Quantity',
            label: 'Qty',
            accessor: function (r) {
              return formatNumber(r.Quantity ?? r.quantity);
            }
          },
          {
            key: 'Unit',
            label: 'Unit',
            accessor: function (r) { return r.Unit || r.unit || '—'; }
          }
        ],
        rows: rows,
        emptyMessage: 'No inventory items.'
      });
    } catch (err) {
      content.innerHTML =
        '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  formInventory() {
    const html =
      '<form id="form-inv">' +
      field({ name: 'name', label: 'Item name', required: true }) +
      field({ name: 'quantity', label: 'Quantity', type: 'number', required: true }) +
      field({ name: 'unit', label: 'Unit', value: 'pcs' }) +
      '</form>';
    openModal({
      title: 'Adjust inventory',
      content: html,
      footer:
        '<button class="btn btn-secondary" data-modal-close>Cancel</button>' +
        '<button class="btn btn-primary" id="save-inv">Save</button>'
    });
    document.getElementById('save-inv').addEventListener('click', async function () {
      const form = document.getElementById('form-inv');
      if (!validateRequired(form, ['name', 'quantity'])) return;
      try {
        await apiOrLocal('inventory', 'adjust', serializeForm(form));
        toastSuccess('Inventory updated');
        closeModal();
        this.renderTab();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    }.bind(this));
  },

  /* ── Notes ────────────────────────────────────────────── */

  async tabNotes(content, actions) {
    if (this.writable) {
      actions.innerHTML =
        '<button class="btn btn-primary btn-sm" id="btn-note">' +
        '<i data-lucide="plus" style="width:14px;height:14px"></i> Add note</button>';
      actions.querySelector('#btn-note').addEventListener('click', function () {
        this.formNote();
      }.bind(this));
    }
    try {
      const res = await apiOrLocal('notes', 'list');
      const rows = res.data || [];
      content.innerHTML = '<div id="notes-table"></div>';
      renderDataTable(content.querySelector('#notes-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: function (r) { return r.Date || r.date; } },
          {
            key: 'Category',
            label: 'Category',
            accessor: function (r) { return r.Category || r.category || 'General'; }
          },
          {
            key: 'Content',
            label: 'Note',
            accessor: function (r) { return r.Content || r.content || '—'; }
          }
        ],
        rows: rows,
        emptyMessage: 'No staff notes.'
      });
    } catch (err) {
      content.innerHTML =
        '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  formNote() {
    const html =
      '<form id="form-note">' +
      field({ name: 'date', label: 'Date', type: 'date', value: today() }) +
      field({
        name: 'category',
        label: 'Category',
        type: 'select',
        options: ['General', 'Production', 'Health', 'Feed', 'Staff', 'Other'],
        value: 'General'
      }) +
      field({ name: 'content', label: 'Note', type: 'textarea', required: true }) +
      '</form>';
    openModal({
      title: 'Staff note',
      content: html,
      footer:
        '<button class="btn btn-secondary" data-modal-close>Cancel</button>' +
        '<button class="btn btn-primary" id="save-note">Save</button>'
    });
    document.getElementById('save-note').addEventListener('click', async function () {
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
    }.bind(this));
  },

  destroy: function () {}
};
