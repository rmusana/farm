/**
 * Operations – Daily Log, Flock, Feed, Sales, Health, Mortality, Inventory, Notes
 */
import { field, serializeForm, validateRequired } from '../components/Form.js';
import { renderDataTable } from '../components/DataTable.js';
import { openModal, closeModal, confirmDialog } from '../components/Modal.js';
import { formatUGX, formatNumber } from '../components/KPI.js';
import { toastSuccess, toastError } from '../components/Toast.js';
import { canWrite } from '../js/auth.js';
import api from '../js/api.js';
import { formatDate, formatDateTime, todayEAT } from '../js/datetime.js';

const TABS = [
  { id: 'daily', label: 'Daily Log' },
  { id: 'flock', label: 'Flock' },
  { id: 'feed', label: 'Feed' },
  { id: 'sales', label: 'Sales' },
  { id: 'health', label: 'Health & Vaccination' },
  { id: 'mortality', label: 'Mortality' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'workers', label: 'Workers' },
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

const DEFAULT_SECTIONS = [
  { sectionId: 'A', label: 'Section A — Young', birdCount: 0 },
  { sectionId: 'B', label: 'Section B — Medium', birdCount: 0 },
  { sectionId: 'C', label: 'Section C — Grown', birdCount: 0 },
  { sectionId: 'Others', label: 'Others', birdCount: 0 }
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
  return todayEAT();
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


function recordId(row, keys) {
  for (var i = 0; i < keys.length; i++) {
    var v = row[keys[i]];
    if (v != null && v !== '') return v;
  }
  return null;
}

async function deleteRecord(resource, id) {
  if (!id) throw new Error('Missing record id');
  if (window.RMUSANA_API_URL) {
    return api.request('/operations', {
      body: {
        module: 'operations',
        resource: resource,
        action: 'delete',
        projectId: 'LUK54',
        id: id
      }
    });
  }
  // localStorage path
  var key = resource === 'sales' || resource === 'eggs' ? 'sales' : resource === 'feed' ? 'feed' : resource;
  var list = localStore(key);
  var next = list.filter(function (r) {
    var rid = r.RecordID || r.SaleID || r.EventID || r.PurchaseID || r.NoteID || r.ItemID || r.id;
    return String(rid) !== String(id);
  });
  localStore(key, next);
  return { success: true };
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
      workers: function () { return this.tabWorkers(content, actions); }.bind(this),
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
          { key: 'Date', label: 'Date', accessor: function (r) { return formatDate(r.Date || r.date); } },
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
              var issued = r.FeedIssuedKg ?? r.feedIssuedKg;
              if (issued != null && issued !== '') return formatNumber(issued, 1);
              return formatNumber(feedTotalKg(r), 1);
            }
          },
          {
            key: 'ProductionPct',
            label: 'Prod %',
            accessor: function (r) {
              var pct = r.ProductionPct ?? r.productionPct;
              if (pct !== '' && pct != null && Number(pct) > 0) return formatNumber(pct, 1) + '%';
              var birds = Number((r.OpeningBirds ?? r.openingBirds) || 0);
              var eggs = Number((r.EggsCollected ?? r.eggsCollected) || 0);
              if (eggs > 0 && birds > 0) return formatNumber((eggs / birds) * 100, 1) + '%';
              return '—';
            }
          }
        ],
        rows: rows,
        actions: this.writable ? [{ id: 'delete', label: 'Delete', danger: true, icon: 'trash-2' }] : null,
        onAction: async function (action, row) {
          if (action !== 'delete') return;
          var id = recordId(row, ['RecordID', 'recordId', 'id']);
          if (!id) { toastError('Cannot delete: missing id'); return; }
          var ok = await confirmDialog({
            title: 'Delete daily log',
            message: 'Delete the log for ' + (row.Date || row.date || 'this day') + '? This cannot be undone.',
            confirmLabel: 'Delete',
            danger: true
          });
          if (!ok) return;
          try {
            await deleteRecord('daily', id);
            toastSuccess('Daily log deleted');
            this.renderTab();
          } catch (err) {
            toastError(err.message || 'Delete failed');
          }
        }.bind(this),
        emptyMessage: 'No daily logs yet. Click Log Day to add one.'
      });
    } catch (err) {
      content.innerHTML =
        '<div class="empty-state"><p class="empty-state-desc">' +
        (err.message || 'Failed to load') +
        '</p></div>';
    }
  },

  async formDaily() {
    var sections = DEFAULT_SECTIONS.slice();
    try {
      var secRes = await apiOrLocal('sections', 'list');
      if (secRes.data && secRes.data.length) {
        sections = secRes.data.map(function (r) {
          return {
            sectionId: r.SectionID || r.sectionId,
            label: r.Label || r.label,
            birdCount: Number(r.BirdCount || r.birdCount || 0)
          };
        });
      }
    } catch (e) {}

    var sectionOpts = sections.map(function (s) {
      return s.sectionId + ' — ' + s.label + ' (' + s.birdCount + ')';
    });

    var html =
      '<form id="form-daily">' +
      field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() }) +
      field({
        name: 'section',
        label: 'Batch / section',
        type: 'select',
        options: sectionOpts,
        value: sectionOpts[0]
      }) +
      '<div class="form-row">' +
      field({ name: 'openingBirds', label: 'Opening birds', type: 'number', required: true, value: String(sections[0] ? sections[0].birdCount : 0) }) +
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
      field({
        name: 'feedIssuedKg',
        label: 'Feed issued (kg)',
        type: 'number',
        value: '0',
        hint: 'Total mixed feed for this day only'
      }) +
      '<div class="card" style="padding:var(--space-3);margin:var(--space-3) 0" id="prod-pct-box">' +
      '<span class="u-text-sm u-text-secondary">Egg production % (this section): </span>' +
      '<strong id="prod-pct-val">—</strong>' +
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

    function updateProdPct() {
      var form = document.getElementById('form-daily');
      if (!form) return;
      var birds = Number(form.openingBirds && form.openingBirds.value) || 0;
      var trays = Number(form.eggsTrays && form.eggsTrays.value) || 0;
      var eggs = trays * 30;
      var el = document.getElementById('prod-pct-val');
      if (!el) return;
      if (eggs > 0 && birds > 0) {
        el.textContent = (Math.round((eggs / birds) * 1000) / 10) + '%';
      } else {
        el.textContent = '—';
      }
    }
    var formEl = document.getElementById('form-daily');
    ['openingBirds', 'eggsTrays'].forEach(function (n) {
      var input = formEl.querySelector('[name="' + n + '"]');
      if (input) input.addEventListener('input', updateProdPct);
    });
    var secSelect = formEl.querySelector('[name="section"]');
    if (secSelect) {
      secSelect.addEventListener('change', function () {
        var id = String(secSelect.value || '').split('—')[0].trim();
        var found = sections.find(function (s) { return s.sectionId === id; });
        if (found && formEl.openingBirds) formEl.openingBirds.value = found.birdCount;
        updateProdPct();
      });
    }
    updateProdPct();

    document.getElementById('save-daily').addEventListener('click', async function () {
      const form = document.getElementById('form-daily');
      if (!validateRequired(form, ['date', 'openingBirds'])) return;
      const data = serializeForm(form);
      const sectionRaw = String(data.section || 'A').split('—')[0].trim();
      const trays = Number(data.eggsTrays) || 0;
      const eggs = trays * 30;
      const birds = Number(data.openingBirds) || 0;
      const payload = {
        date: data.date,
        section: sectionRaw,
        openingBirds: birds,
        mortality: data.mortality || 0,
        closingBirds: data.closingBirds || undefined,
        eggsTrays: trays,
        eggsCollected: eggs,
        breakages: data.breakages || 0,
        eggsLost: data.eggsLost || 0,
        feedIssuedKg: data.feedIssuedKg || 0,
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
        '<button class="btn btn-secondary btn-sm" id="btn-save-sections">Save sections</button>' +
        '<button class="btn btn-primary btn-sm" id="btn-flock-event">' +
        '<i data-lucide="plus" style="width:14px;height:14px"></i> Flock event</button>';
      actions.querySelector('#btn-flock-event').addEventListener('click', function () {
        this.formFlock();
      }.bind(this));
    }
    try {
      const secRes = await apiOrLocal('sections', 'list');
      const statusRes = await apiOrLocal('flock', 'status');
      const listRes = await apiOrLocal('flock', 'list');
      let sections = secRes.data || [];
      if (!sections.length) {
        sections = DEFAULT_SECTIONS.map(function (s) {
          return { SectionID: s.sectionId, Label: s.label, BirdCount: s.birdCount };
        });
      }
      const total = secRes.totalBirds != null
        ? secRes.totalBirds
        : sections.reduce(function (s, r) { return s + Number(r.BirdCount || r.birdCount || 0); }, 0);
      const st = statusRes.data || {};
      const rows = listRes.data || [];

      let secHtml = '<div class="card" style="padding:var(--space-4);margin-bottom:var(--space-4)">' +
        '<h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-3)">Batch / sections (editable)</h3>' +
        '<p class="u-text-xs u-text-muted" style="margin-bottom:var(--space-3)">Set bird counts per section. Total drives the live flock count.</p>' +
        '<div id="sections-editor">';
      sections.forEach(function (s, i) {
        const id = s.SectionID || s.sectionId || ('S' + i);
        const label = s.Label || s.label || id;
        const count = Number((s.BirdCount ?? s.birdCount) || 0);
        secHtml +=
          '<div class="form-row" style="margin-bottom:var(--space-2)" data-sec-id="' + id + '">' +
          '<div class="form-group"><label class="form-label">Label</label>' +
          '<input class="form-input sec-label" value="' + String(label).replace(/"/g, '&quot;') + '" /></div>' +
          '<div class="form-group"><label class="form-label">Birds</label>' +
          '<input class="form-input sec-count" type="number" value="' + count + '" /></div>' +
          '</div>';
      });
      secHtml += '</div>' +
        '<div class="kpi-grid" style="margin-top:var(--space-3)">' +
        '<div class="card kpi-card"><div class="kpi-label">Total birds (all sections)</div>' +
        '<div class="kpi-value" id="sec-total-display">' + formatNumber(total) + '</div></div></div></div>';

      content.innerHTML = secHtml +
        '<h3 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-3)">Flock events</h3>' +
        '<div id="flock-table"></div>';

      function recalcTotal() {
        var sum = 0;
        content.querySelectorAll('.sec-count').forEach(function (inp) {
          sum += Number(inp.value) || 0;
        });
        var el = content.querySelector('#sec-total-display');
        if (el) el.textContent = formatNumber(sum);
      }
      content.querySelectorAll('.sec-count').forEach(function (inp) {
        inp.addEventListener('input', recalcTotal);
      });

      if (this.writable) {
        actions.querySelector('#btn-save-sections').addEventListener('click', async function () {
          var payload = [];
          content.querySelectorAll('[data-sec-id]').forEach(function (row) {
            payload.push({
              sectionId: row.getAttribute('data-sec-id'),
              label: row.querySelector('.sec-label').value,
              birdCount: Number(row.querySelector('.sec-count').value) || 0
            });
          });
          try {
            const res = await apiOrLocal('sections', 'save', { sections: payload });
            toastSuccess('Sections saved — total ' + formatNumber(res.totalBirds != null ? res.totalBirds : 0) + ' birds');
            this.renderTab();
          } catch (err) {
            toastError(err.message || 'Save failed');
          }
        }.bind(this));
      }

      renderDataTable(content.querySelector('#flock-table'), {
        columns: [
          { key: 'Date', label: 'Date', accessor: function (r) { return formatDate(r.Date || r.date); } },
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
        actions: this.writable ? [{ id: 'delete', label: 'Delete', danger: true, icon: 'trash-2' }] : null,
        onAction: async function (action, row) {
          if (action !== 'delete') return;
          var id = recordId(row, ['EventID', 'eventId', 'RecordID', 'id']);
          if (!id) { toastError('Cannot delete: missing id'); return; }
          var ok = await confirmDialog({
            title: 'Delete flock event',
            message: 'Delete this flock event?',
            confirmLabel: 'Delete',
            danger: true
          });
          if (!ok) return;
          try {
            await deleteRecord('flock', id);
            toastSuccess('Event deleted');
            this.renderTab();
          } catch (err) {
            toastError(err.message || 'Delete failed');
          }
        }.bind(this),
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
        '<button class="btn btn-secondary btn-sm" id="btn-weekly-mix">Weekly mix</button>' +
        '<button class="btn btn-primary btn-sm" id="btn-feed-purchase">' +
        '<i data-lucide="plus" style="width:14px;height:14px"></i> Feed purchase</button>';
      actions.querySelector('#btn-feed-purchase').addEventListener('click', function () {
        this.formFeedPurchase();
      }.bind(this));
      actions.querySelector('#btn-weekly-mix').addEventListener('click', function () {
        this.formWeeklyMix();
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
          { key: 'Date', label: 'Date', accessor: function (r) { return formatDate(r.Date || r.date); } },
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
        actions: this.writable ? [{ id: 'delete', label: 'Delete', danger: true, icon: 'trash-2' }] : null,
        onAction: async function (action, row) {
          if (action !== 'delete') return;
          var id = recordId(row, ['PurchaseID', 'purchaseId', 'RecordID', 'id']);
          if (!id) { toastError('Cannot delete: missing id'); return; }
          var ok = await confirmDialog({
            title: 'Delete feed purchase',
            message: 'Delete this feed purchase? This cannot be undone.',
            confirmLabel: 'Delete',
            danger: true
          });
          if (!ok) return;
          try {
            await deleteRecord('feed', id);
            toastSuccess('Feed purchase deleted');
            this.renderTab();
          } catch (err) {
            toastError(err.message || 'Delete failed');
          }
        }.bind(this),
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
          { key: 'Date', label: 'Date', accessor: function (r) { return formatDate(r.Date || r.date); } },
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
        actions: this.writable ? [{ id: 'delete', label: 'Delete', danger: true, icon: 'trash-2' }] : null,
        onAction: async function (action, row) {
          if (action !== 'delete') return;
          var id = recordId(row, ['SaleID', 'saleId', 'RecordID', 'id']);
          if (!id) { toastError('Cannot delete: missing id'); return; }
          var ok = await confirmDialog({
            title: 'Delete sale',
            message: 'Delete this sale record? This cannot be undone.',
            confirmLabel: 'Delete',
            danger: true
          });
          if (!ok) return;
          try {
            await deleteRecord('sales', id);
            toastSuccess('Sale deleted');
            this.renderTab();
          } catch (err) {
            toastError(err.message || 'Delete failed');
          }
        }.bind(this),
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
          { key: 'Date', label: 'Date', accessor: function (r) { return formatDate(r.Date || r.date); } },
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
        actions: this.writable ? [{ id: 'delete', label: 'Delete', danger: true, icon: 'trash-2' }] : null,
        onAction: async function (action, row) {
          if (action !== 'delete') return;
          var id = recordId(row, ['EventID', 'eventId', 'RecordID', 'id']);
          if (!id) { toastError('Cannot delete: missing id'); return; }
          var ok = await confirmDialog({
            title: 'Delete treatment',
            message: 'Delete this health record?',
            confirmLabel: 'Delete',
            danger: true
          });
          if (!ok) return;
          try {
            await deleteRecord('health', id);
            toastSuccess('Record deleted');
            this.renderTab();
          } catch (err) {
            toastError(err.message || 'Delete failed');
          }
        }.bind(this),
        emptyMessage: 'No treatments logged.'
      });
    } catch (err) {
      content.innerHTML =
        '<div class="empty-state"><p class="empty-state-desc">' + err.message + '</p></div>';
    }
  },

  async formHealth() {
    var types = ['Vaccination', 'Medication', 'Treatment', 'Other'];
    var products = VACCINES.concat(MEDS);
    try {
      var opt = await apiOrLocal('health', 'options');
      if (opt.data) {
        if (opt.data.types && opt.data.types.length) types = opt.data.types;
        if (opt.data.products && opt.data.products.length) products = opt.data.products;
      }
    } catch (e) {}

    const html =
      '<form id="form-health">' +
      field({ name: 'date', label: 'Date', type: 'date', required: true, value: today() }) +
      field({
        name: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: types.concat(['— Add new type —'])
      }) +
      field({
        name: 'customType',
        label: 'New type (if adding)',
        hint: 'Only fill if you chose Add new type'
      }) +
      field({
        name: 'product',
        label: 'Product',
        type: 'select',
        required: true,
        options: products.concat(['— Add new product —'])
      }) +
      field({
        name: 'customProduct',
        label: 'New product (if adding)',
        hint: 'Only fill if you chose Add new product'
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
      if (!validateRequired(form, ['date'])) return;
      const data = serializeForm(form);
      let type = data.type;
      let product = data.product;
      if (type && type.indexOf('Add new type') >= 0) {
        type = (data.customType || '').trim();
        if (!type) { toastError('Enter the new type name'); return; }
        try { await apiOrLocal('health', 'addOption', { kind: 'Type', value: type }); } catch (e) {}
      }
      if (product && product.indexOf('Add new product') >= 0) {
        product = (data.customProduct || '').trim();
        if (!product) { toastError('Enter the new product name'); return; }
        try { await apiOrLocal('health', 'addOption', { kind: 'Product', value: product }); } catch (e) {}
      }
      if (!type || !product) { toastError('Type and product required'); return; }
      try {
        await apiOrLocal('health', 'create', {
          date: data.date,
          type: type,
          product: product,
          week: data.week,
          notes: data.notes
        });
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
          { key: 'Date', label: 'Date', accessor: function (r) { return formatDate(r.Date || r.date); } },
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
          { key: 'Date', label: 'Date', accessor: function (r) { return formatDate(r.Date || r.date); } },
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
        actions: this.writable ? [{ id: 'delete', label: 'Delete', danger: true, icon: 'trash-2' }] : null,
        onAction: async function (action, row) {
          if (action !== 'delete') return;
          var id = recordId(row, ['NoteID', 'noteId', 'RecordID', 'id']);
          if (!id) { toastError('Cannot delete: missing id'); return; }
          var ok = await confirmDialog({
            title: 'Delete note',
            message: 'Delete this note?',
            confirmLabel: 'Delete',
            danger: true
          });
          if (!ok) return;
          try {
            await deleteRecord('notes', id);
            toastSuccess('Note deleted');
            this.renderTab();
          } catch (err) {
            toastError(err.message || 'Delete failed');
          }
        }.bind(this),
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


  async tabWorkers(content, actions) {
    if (this.writable) {
      actions.innerHTML =
        '<button class="btn btn-primary btn-sm" id="btn-worker">' +
        '<i data-lucide="plus" style="width:14px;height:14px"></i> Add worker</button>';
      actions.querySelector('#btn-worker').addEventListener('click', function () {
        this.formWorker();
      }.bind(this));
    }
    try {
      const res = await apiOrLocal('workers', 'list');
      const rows = res.data || [];
      content.innerHTML = '<div id="workers-table"></div>';
      renderDataTable(content.querySelector('#workers-table'), {
        columns: [
          { key: 'Name', label: 'Name', accessor: function (r) { return r.Name || r.name; } },
          {
            key: 'Payroll',
            label: 'Payroll',
            accessor: function (r) { return formatUGX(r.Payroll ?? r.payroll); },
            align: 'right'
          },
          {
            key: 'Bonus',
            label: 'Bonus',
            accessor: function (r) { return formatUGX(r.Bonus ?? r.bonus); },
            align: 'right'
          },
          {
            key: 'Advance',
            label: 'Advance',
            accessor: function (r) { return formatUGX(r.Advance ?? r.advance); },
            align: 'right'
          },
          {
            key: 'Notes',
            label: 'Notes',
            accessor: function (r) { return r.Notes || r.notes || '—'; }
          }
        ],
        rows: rows,
        actions: this.writable
          ? [
              { id: 'edit', label: 'Edit' },
              { id: 'delete', label: 'Delete', danger: true, icon: 'trash-2' }
            ]
          : null,
        onAction: async function (action, row) {
          const id = recordId(row, ['WorkerID', 'workerId', 'id']);
          if (action === 'edit') {
            this.formWorker(row);
            return;
          }
          if (action !== 'delete') return;
          if (!id) { toastError('Cannot delete: missing id'); return; }
          const ok = await confirmDialog({
            title: 'Delete worker',
            message: 'Remove this worker record?',
            confirmLabel: 'Delete',
            danger: true
          });
          if (!ok) return;
          try {
            await deleteRecord('workers', id);
            toastSuccess('Worker deleted');
            this.renderTab();
          } catch (err) {
            toastError(err.message || 'Delete failed');
          }
        }.bind(this),
        emptyMessage: 'No workers yet. Add payroll, bonus and advance here.'
      });
    } catch (err) {
      content.innerHTML =
        '<div class="empty-state"><p class="empty-state-desc">' + (err.message || 'Failed') + '</p></div>';
    }
  },

  formWorker(existing) {
    existing = existing || null;
    const html =
      '<form id="form-worker">' +
      field({
        name: 'name',
        label: 'Worker name',
        required: true,
        value: existing ? (existing.Name || existing.name || '') : ''
      }) +
      '<div class="form-row">' +
      field({
        name: 'payroll',
        label: 'Payroll (UGX)',
        type: 'number',
        value: existing ? String(existing.Payroll ?? existing.payroll ?? 0) : '0'
      }) +
      field({
        name: 'bonus',
        label: 'Bonus (UGX)',
        type: 'number',
        value: existing ? String(existing.Bonus ?? existing.bonus ?? 0) : '0'
      }) +
      field({
        name: 'advance',
        label: 'Advance (UGX)',
        type: 'number',
        value: existing ? String(existing.Advance ?? existing.advance ?? 0) : '0'
      }) +
      '</div>' +
      field({
        name: 'notes',
        label: 'Notes',
        type: 'textarea',
        value: existing ? (existing.Notes || existing.notes || '') : ''
      }) +
      '</form>';
    openModal({
      title: existing ? 'Edit worker' : 'Add worker',
      content: html,
      footer:
        '<button class="btn btn-secondary" data-modal-close>Cancel</button>' +
        '<button class="btn btn-primary" id="save-worker">Save</button>'
    });
    document.getElementById('save-worker').addEventListener('click', async function () {
      const form = document.getElementById('form-worker');
      if (!validateRequired(form, ['name'])) return;
      const data = serializeForm(form);
      try {
        if (existing) {
          const id = recordId(existing, ['WorkerID', 'workerId', 'id']);
          await apiOrLocal('workers', 'update', {
            id: id,
            name: data.name,
            payroll: data.payroll,
            bonus: data.bonus,
            advance: data.advance,
            notes: data.notes
          });
        } else {
          await apiOrLocal('workers', 'create', data);
        }
        toastSuccess('Worker saved');
        closeModal();
        this.renderTab();
      } catch (err) {
        toastError(err.message || 'Save failed');
      }
    }.bind(this));
  },

  destroy: function () {}
};
