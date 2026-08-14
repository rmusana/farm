/**
 * Alerts module – list, filter, resolve, acknowledge, run engine
 */
import { toastSuccess, toastError } from '../components/Toast.js';
import { setState } from '../js/state.js';
import { canWrite } from '../js/auth.js';
import api from '../js/api.js';
import { formatDate, formatDateTime, todayEAT } from '../js/datetime.js';

const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function localStore(key, value) {
  if (value === undefined) {
    try { return JSON.parse(localStorage.getItem('rmusana_alerts_' + key) || '[]'); } catch { return []; }
  }
  localStorage.setItem('rmusana_alerts_' + key, JSON.stringify(value));
}

function runLocalEngine() {
  const alerts = localStore('list');
  const now = new Date().toISOString();
  const add = (priority, title, reason, action, type) => {
    if (alerts.some((a) => a.Title === title && a.Status === 'Open')) return;
    alerts.unshift({
      AlertID: 'local_' + Date.now() + Math.random().toString(36).slice(2, 6),
      Priority: priority,
      Title: title,
      Reason: reason,
      SuggestedAction: action,
      Type: type || 'System',
      Status: 'Open',
      CreatedAt: now,
      Deadline: ''
    });
  };

  // Missing daily
  const daily = JSON.parse(localStorage.getItem('rmusana_ops_daily') || '[]');
  if (daily.length) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    const found = daily.some((r) => String(r.Date || r.date || '').startsWith(yStr));
    if (!found) {
      add('Medium', 'Missing daily production entry', 'No production log found for ' + yStr, 'Complete the Daily Log for yesterday', 'Operations');
    }
  }

  // Abnormal mortality from latest daily
  if (daily.length) {
    const last = daily[0];
    const opening = Number(last.OpeningBirds || last.openingBirds || 0);
    const mort = Number(last.Mortality || last.mortality || 0);
    if (opening > 0 && mort / opening > 0.01) {
      add('Critical', 'Abnormal mortality', mort + ' birds lost on ' + (last.Date || last.date) + ' (' + Math.round(mort / opening * 1000) / 10 + '%)', 'Investigate causes and biosecurity', 'Mortality');
    }
  }

  // Low feed
  const feedInv = JSON.parse(localStorage.getItem('rmusana_ops_feedInv') || '[]');
  feedInv.forEach((item) => {
    const stock = Number(item.ClosingStock || 0);
    if (stock > 0 && stock < 50) {
      add('High', 'Low feed stock: ' + item.Product, item.Product + ' stock is ' + stock + ' kg', 'Record a feed purchase', 'Inventory');
    }
  });

  // Funding
  const capital = JSON.parse(localStorage.getItem('rmusana_fin_capital') || '[]');
  const totalCap = capital.reduce((s, r) => s + Number(r.Amount || r.amount || 0), 0);
  if (totalCap > 0 && totalCap < 20000000) {
    add('High', 'Funding required', 'Capital contributed is below estimated project requirement', 'Review capital plan with Investment Partner', 'Finance');
  }

  // Statement due (days 1–10)
  const day = new Date().getDate();
  if (day >= 1 && day <= 10) {
    add(day >= 10 ? 'Critical' : 'Medium', day >= 10 ? 'Monthly statement overdue' : 'Monthly statement due', 'Investment Statement is due by the 10th of the month', 'Generate Monthly Investment Statement from Reports', 'Reporting');
  }

  localStore('list', alerts);
  return alerts;
}

async function fetchAlerts(status) {
  if (window.RMUSANA_API_URL) {
    const res = await api.alerts.list();
    let data = res.data || [];
    if (status === 'Open') data = data.filter((a) => a.Status === 'Open' || a.Status === 'Acknowledged' || a.status === 'Open');
    if (status === 'Resolved') data = data.filter((a) => a.Status === 'Resolved' || a.status === 'Resolved');
    return data;
  }
  runLocalEngine();
  let list = localStore('list');
  if (status === 'Open') list = list.filter((a) => a.Status === 'Open' || a.Status === 'Acknowledged');
  if (status === 'Resolved') list = list.filter((a) => a.Status === 'Resolved');
  list.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.Priority] ?? 9;
    const pb = PRIORITY_ORDER[b.Priority] ?? 9;
    if (pa !== pb) return pa - pb;
    return new Date(b.CreatedAt) - new Date(a.CreatedAt);
  });
  return list;
}

function badgeClass(priority) {
  if (priority === 'Critical') return 'critical';
  if (priority === 'High') return 'caution';
  if (priority === 'Low') return 'neutral';
  return 'info';
}

export default {
  filter: 'Open',

  async render(root) {
    this.root = root;
    root.innerHTML = `
      <div class="page-header">
        <div class="page-header-title">
          <div class="breadcrumb"><span>Main</span><span>/</span><span>Alerts</span></div>
          <h1>Alerts</h1>
          <p class="u-text-secondary u-text-sm">Proactive notifications and recommended actions</p>
        </div>
        <div class="page-header-actions">
          <div style="display:flex;gap:var(--space-1)">
            <button class="btn btn-sm ${this.filter === 'Open' ? 'btn-primary' : 'btn-ghost'}" data-filter="Open">Open</button>
            <button class="btn btn-sm ${this.filter === 'Resolved' ? 'btn-primary' : 'btn-ghost'}" data-filter="Resolved">Resolved</button>
            <button class="btn btn-sm ${this.filter === 'all' ? 'btn-primary' : 'btn-ghost'}" data-filter="all">All</button>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-run-engine">
            <i data-lucide="refresh-cw" style="width:14px;height:14px"></i>
            Run engine
          </button>
        </div>
      </div>
      <div id="alerts-list"><div class="skeleton" style="height:200px"></div></div>
    `;

    root.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.filter;
        root.querySelectorAll('[data-filter]').forEach((b) => {
          b.classList.toggle('btn-primary', b.dataset.filter === this.filter);
          b.classList.toggle('btn-ghost', b.dataset.filter !== this.filter);
        });
        this.load();
      });
    });

    root.querySelector('#btn-run-engine')?.addEventListener('click', async () => {
      try {
        if (window.RMUSANA_API_URL) {
          await api.request('/alerts', { body: { module: 'alerts', action: 'run' } });
        } else {
          runLocalEngine();
        }
        toastSuccess('Alert engine ran');
        await this.load();
      } catch (err) {
        toastError(err.message || 'Engine failed');
      }
    });

    await this.load();
    if (window.lucide) window.lucide.createIcons({ nodes: [root] });
  },

  async load() {
    const el = this.root.querySelector('#alerts-list');
    if (!el) return;
    el.innerHTML = `<div class="skeleton" style="height:160px"></div>`;
    try {
      const alerts = await fetchAlerts(this.filter);
      setState({ alerts: alerts.filter((a) => (a.Status || a.status) === 'Open') });

      if (!alerts.length) {
        el.innerHTML = `
          <div class="card"><div class="card-body">
            <div class="empty-state">
              <i data-lucide="bell-off" class="empty-state-icon"></i>
              <p class="empty-state-title">No alerts</p>
              <p class="empty-state-desc">The engine watches vaccination due dates, feed stock, mortality, production, funding and statement deadlines.</p>
            </div>
          </div></div>`;
        if (window.lucide) window.lucide.createIcons({ nodes: [el] });
        return;
      }

      el.innerHTML = alerts.map((a) => {
        const priority = a.Priority || a.priority || 'Medium';
        const status = a.Status || a.status || 'Open';
        const id = a.AlertID || a.id;
        return `
          <div class="card" style="padding:var(--space-4);margin-bottom:var(--space-3)" data-alert-id="${id}">
            <div style="display:flex;justify-content:space-between;gap:var(--space-3);flex-wrap:wrap">
              <div style="flex:1;min-width:200px">
                <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);flex-wrap:wrap">
                  <span class="badge badge-${badgeClass(priority)}">${priority}</span>
                  <span class="badge badge-neutral">${a.Type || a.type || 'System'}</span>
                  <span class="badge badge-${status === 'Resolved' ? 'positive' : status === 'Acknowledged' ? 'info' : 'caution'}">${status}</span>
                </div>
                <div class="u-font-semibold" style="margin-bottom:4px">${a.Title || a.title}</div>
                <p class="u-text-sm u-text-secondary" style="margin-bottom:4px">${a.Reason || a.reason || ''}</p>
                <p class="u-text-xs u-text-muted"><strong>Action:</strong> ${a.SuggestedAction || a.suggestedAction || '—'}</p>
                ${a.Deadline || a.deadline ? `<p class="u-text-xs u-text-muted">Deadline: ${a.Deadline || a.deadline}</p>` : ''}
                <p class="u-text-xs u-text-muted" style="margin-top:4px">${a.CreatedAt ? new Date(a.CreatedAt).toLocaleString() : ''}</p>
              </div>
              ${status !== 'Resolved' && canWrite('operations') ? `
              <div style="display:flex;flex-direction:column;gap:var(--space-2)">
                ${status === 'Open' ? `<button class="btn btn-secondary btn-sm" data-ack="${id}">Acknowledge</button>` : ''}
                <button class="btn btn-primary btn-sm" data-resolve="${id}">Resolve</button>
              </div>` : ''}
            </div>
          </div>`;
      }).join('');

      el.querySelectorAll('[data-resolve]').forEach((btn) => {
        btn.addEventListener('click', () => this.resolve(btn.dataset.resolve));
      });
      el.querySelectorAll('[data-ack]').forEach((btn) => {
        btn.addEventListener('click', () => this.acknowledge(btn.dataset.ack));
      });

      if (window.lucide) window.lucide.createIcons({ nodes: [el] });
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
    }
  },

  async resolve(id) {
    try {
      if (window.RMUSANA_API_URL) {
        await api.alerts.resolve(id);
      } else {
        const list = localStore('list');
        const item = list.find((a) => a.AlertID === id);
        if (item) {
          item.Status = 'Resolved';
          item.ResolvedAt = new Date().toISOString();
          localStore('list', list);
        }
      }
      toastSuccess('Alert resolved');
      await this.load();
    } catch (err) {
      toastError(err.message || 'Resolve failed');
    }
  },

  async acknowledge(id) {
    try {
      if (window.RMUSANA_API_URL) {
        await api.request('/alerts', { body: { module: 'alerts', action: 'acknowledge', alertId: id } });
      } else {
        const list = localStore('list');
        const item = list.find((a) => a.AlertID === id);
        if (item) item.Status = 'Acknowledged';
        localStore('list', list);
      }
      toastSuccess('Alert acknowledged');
      await this.load();
    } catch (err) {
      toastError(err.message || 'Acknowledge failed');
    }
  },

  destroy() {}
};
