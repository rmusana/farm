/**
 * Executive Dashboard – full implementation
 */
import { renderKPI, formatUGX, formatPercent, formatNumber } from '../components/KPI.js';
import { renderLineChart, renderDoughnutChart } from '../components/Charts.js';
import { navigate } from '../js/router.js';
import { getRole, canWrite, canApprove } from '../js/auth.js';
import { getState } from '../js/state.js';
import api from '../js/api.js';
import { formatDate, formatDateTime, todayEAT } from '../js/datetime.js';
import { toastError } from '../components/Toast.js';

function emptySummary() {
  return {
    healthScore: null,
    totalInvestment: 0,
    totalExpenses: 0,
    revenue: 0,
    netProfit: 0,
    roi: 0,
    capitalRecovery: 0,
    cashPosition: 0,
    outstandingFunding: 0,
    budgetSpent: 0,
    budgetTotal: 52849172,
    productionPercent: null,
    productionTargetMin: 88,
    productionTargetMax: 92,
    commercialReached: false,
    daysToCommercial: null,
    currentWeek: null,
    birdCount: 2500,
    mortalityRate: null,
    feedDaysRemaining: null,
    openAlerts: 0,
    criticalAlerts: 0,
    eggTrend: [],
    mortalityTrend: []
  };
}

function localInsights(s) {
  const list = [];
  if (s.healthScore == null) {
    list.push({ severity: 'info', text: 'Awaiting operational data. Log daily production, feed and expenses to generate live intelligence.' });
  }
  if (!s.commercialReached) {
    list.push({ severity: 'info', text: 'Commercial production is expected at Week 25 from stocking (1 June 2026) or when laying reaches 85%.' });
  }
  list.push({ severity: 'info', text: 'Revenue allocation rules apply once commercial production levels are reached.' });
  if (s.outstandingFunding > 0) {
    list.push({ severity: 'caution', text: 'Estimated capital requirement remaining: ' + formatUGX(s.outstandingFunding) + '.' });
  }
  return list;
}

function healthLabel(score) {
  if (score == null) return { text: '—', cls: 'neutral' };
  if (score >= 80) return { text: 'Strong', cls: 'positive' };
  if (score >= 60) return { text: 'Moderate', cls: 'caution' };
  return { text: 'Weak', cls: 'critical' };
}

function severityIcon(sev) {
  if (sev === 'positive') return 'check-circle';
  if (sev === 'caution') return 'alert-triangle';
  if (sev === 'critical') return 'alert-octagon';
  return 'info';
}

export default {
  _charts: [],

  async render(root) {
    root.innerHTML = `
      <div class="page-header">
        <div class="page-header-title">
          <div class="breadcrumb"><span>Main</span><span>/</span><span>Dashboard</span></div>
          <h1>Dashboard</h1>
          <p class="u-text-secondary u-text-sm">How healthy is this investment today?</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-secondary btn-sm" id="dash-refresh">
            <i data-lucide="refresh-cw" style="width:14px;height:14px"></i>
            Refresh
          </button>
        </div>
      </div>

      <div id="dash-health" class="card card-glass" style="padding:var(--space-5);margin-bottom:var(--space-6)">
        <div class="skeleton" style="height:72px;width:100%"></div>
      </div>

      <div class="kpi-grid" id="dash-kpis" style="margin-bottom:var(--space-6)"></div>

      <div class="grid-2" style="margin-bottom:var(--space-6)">
        <div class="card">
          <div class="card-header">
            <h3>Egg Production Trend</h3>
            <span class="badge badge-neutral" id="prod-badge">—</span>
          </div>
          <div class="card-body">
            <div class="chart-container"><canvas id="chart-eggs"></canvas></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Executive Insights</h3></div>
          <div class="card-body" id="dash-insights">
            <div class="skeleton" style="height:120px"></div>
          </div>
        </div>
      </div>

      <div class="grid-3" style="margin-bottom:var(--space-6)">
        <div class="card">
          <div class="card-header"><h3>Capital Mix</h3></div>
          <div class="card-body">
            <div class="chart-container" style="height:220px"><canvas id="chart-capital"></canvas></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Recent Activity</h3></div>
          <div class="card-body" id="dash-activity" style="max-height:280px;overflow-y:auto">
            <div class="skeleton" style="height:100px"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-header">
            <h3>Active Alerts</h3>
            <button class="btn btn-ghost btn-sm" data-nav="alerts">View all</button>
          </div>
          <div class="card-body" id="dash-alerts">
            <div class="skeleton" style="height:100px"></div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:var(--space-6)">
        <div class="card-header"><h3>Quick Actions</h3></div>
        <div class="card-body" id="dash-actions" style="display:flex;flex-wrap:wrap;gap:var(--space-2)"></div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons({ nodes: [root] });

    root.querySelector('#dash-refresh')?.addEventListener('click', async () => {
      const btn = root.querySelector('#dash-refresh');
      if (btn) {
        if (btn.disabled) return;
        btn.disabled = true;
        const label = btn.innerHTML;
        btn.innerHTML = '<span>Refreshing…</span>';
        try {
          await this.load(root);
        } finally {
          btn.disabled = false;
          btn.innerHTML = label;
          if (window.lucide) window.lucide.createIcons({ nodes: [btn] });
        }
      } else {
        await this.load(root);
      }
    });

    await this.load(root);
  },

  async load(root) {
    // Destroy previous charts so refresh does not stack instances
    if (this._charts && this._charts.length) {
      this._charts.forEach(function (c) {
        try { if (c && typeof c.destroy === 'function') c.destroy(); } catch (e) {}
      });
      this._charts = [];
    }

    let summary = emptySummary();
    let insights = [];
    let activity = [];
    let alerts = [];

    try {
      if (window.RMUSANA_API_URL) {
        const [sumRes, insRes, actRes, alertRes] = await Promise.all([
          api.dashboard.summary(),
          api.dashboard.insights(),
          api.dashboard.activity().catch(() => ({ data: [] })),
          api.alerts.list().catch(() => ({ data: [] }))
        ]);
        if (sumRes.data) summary = { ...summary, ...sumRes.data };
        insights = insRes.data || [];
        activity = actRes.data || [];
        alerts = (alertRes.data || []).filter((a) => a.status === 'Open' || a.Status === 'Open').slice(0, 5);
      } else {
        insights = localInsights(summary);
      }
    } catch (err) {
      console.warn('Dashboard fetch failed, using empty state', err);
      insights = localInsights(summary);
      if (err.code !== 'NO_API') toastError(err.message || 'Could not load dashboard data');
    }

    this.renderHealth(root.querySelector('#dash-health'), summary);
    this.renderKPIs(root.querySelector('#dash-kpis'), summary);
    this.renderInsights(root.querySelector('#dash-insights'), insights);
    this.renderActivity(root.querySelector('#dash-activity'), activity);
    this.renderAlerts(root.querySelector('#dash-alerts'), alerts, summary);
    this.renderActions(root.querySelector('#dash-actions'));
    this.renderCharts(root, summary);

    const badge = root.querySelector('#prod-badge');
    if (badge) {
      if (summary.productionPercent != null) {
        badge.textContent = summary.productionPercent + '%';
        badge.className = 'badge ' + (
          summary.productionPercent >= 88 ? 'badge-positive' :
          summary.productionPercent >= 80 ? 'badge-caution' : 'badge-critical'
        );
      } else {
        badge.textContent = 'No data';
        badge.className = 'badge badge-neutral';
      }
    }

    if (window.lucide) window.lucide.createIcons({ nodes: [root] });
  },

  renderHealth(el, s) {
    if (!el) return;
    const hl = healthLabel(s.healthScore);
    const score = s.healthScore != null ? s.healthScore : '—';
    const ringColor = hl.cls === 'positive' ? 'var(--color-positive)' :
      hl.cls === 'caution' ? 'var(--color-caution)' :
      hl.cls === 'critical' ? 'var(--color-critical)' : 'var(--color-text-muted)';

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:var(--space-6);flex-wrap:wrap">
        <div style="position:relative;width:88px;height:88px;flex-shrink:0">
          <svg viewBox="0 0 36 36" style="width:88px;height:88px;transform:rotate(-90deg)">
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none" stroke="var(--color-border)" stroke-width="3"/>
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none" stroke="${ringColor}" stroke-width="3"
              stroke-dasharray="${s.healthScore != null ? s.healthScore : 0}, 100"
              stroke-linecap="round"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column">
            <span style="font-size:var(--text-xl);font-weight:700;letter-spacing:var(--tracking-tight)">${score}</span>
          </div>
        </div>
        <div style="flex:1;min-width:200px">
          <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-1)">
            <h2 style="font-size:var(--text-lg)">Investment Health</h2>
            <span class="badge badge-${hl.cls === 'neutral' ? 'neutral' : hl.cls}">${hl.text}</span>
          </div>
          <p class="u-text-sm u-text-secondary" style="max-width:560px;line-height:var(--leading-relaxed)">
            ${s.healthScore != null
              ? 'Composite of production performance, mortality, feed efficiency, budget adherence, capital recovery and alert status.'
              : 'Score will populate once production, feed and financial records are available for the LUK54 Flock.'}
          </p>
          <div style="display:flex;gap:var(--space-4);margin-top:var(--space-3);flex-wrap:wrap">
            <span class="u-text-xs u-text-muted">Week ${s.currentWeek ?? '—'} · ${formatNumber(s.birdCount)} birds</span>
            <span class="u-text-xs u-text-muted">${s.commercialReached ? 'Commercial production active' : (s.daysToCommercial != null ? '~' + s.daysToCommercial + ' days to commercial' : 'Building toward commercial')}</span>
          </div>
        </div>
      </div>
    `;
  },

  renderKPIs(el, s) {
    if (!el) return;
    const items = [
      {
        label: 'Total Investment',
        value: formatUGX(s.totalInvestment),
        insight: 'Total capital contributed'
      },
      {
        label: 'Total Expenses',
        value: formatUGX(s.totalExpenses),
        insight: 'Cumulative operational expenditure'
      },
      {
        label: 'Gross Revenue',
        value: formatUGX(s.revenue),
        insight: s.commercialReached ? 'Egg sales attributable to LUK54' : 'Allocation not yet active'
      },
      {
        label: 'Net Profit (Investor)',
        value: formatUGX(s.netProfit),
        insight: 'After feed allocation and operator share'
      },
      {
        label: 'ROI',
        value: formatPercent(s.roi),
        trend: s.roi > 0 ? { direction: 'up', label: 'vs capital' } : s.roi < 0 ? { direction: 'down', label: 'vs capital' } : null,
        insight: 'Net profit ÷ total capital'
      },
      {
        label: 'Capital Recovery',
        value: formatPercent(s.capitalRecovery),
        insight: 'Share of capital returned via net profit'
      },
      {
        label: 'Cash Position',
        value: formatUGX(s.cashPosition),
        insight: 'Capital − expenses + realised net profit'
      },
      {
        label: 'Outstanding Funding',
        value: formatUGX(s.outstandingFunding),
        insight: s.outstandingFunding > 0 ? 'Additional capital may be required' : 'Within estimated capital envelope'
      },
      {
        label: 'Production',
        value: s.productionPercent != null ? formatPercent(s.productionPercent) : '—',
        insight: 'Target band 88–92% · Commercial at ≥85%'
      },
      {
        label: 'Mortality Rate',
        value: s.mortalityRate != null ? formatPercent(s.mortalityRate) : '—',
        insight: 'Cumulative vs peak flock size'
      },
      {
        label: 'Feed Days Remaining',
        value: s.feedDaysRemaining != null ? String(s.feedDaysRemaining) : '—',
        insight: s.feedDaysRemaining != null && s.feedDaysRemaining < 7 ? 'Reorder soon' : 'Based on 7-day average consumption'
      },
      {
        label: 'Budget Performance',
        value: s.budgetTotal ? formatPercent(s.budgetSpent && s.budgetTotal ? (s.budgetSpent / s.budgetTotal) * 100 : 0) : '—',
        insight: 'Actual spend vs estimated capital requirements'
      }
    ];
    renderKPI(el, items);
  },

  renderInsights(el, insights) {
    if (!el) return;
    if (!insights.length) {
      el.innerHTML = `<div class="empty-state" style="padding:var(--space-6)"><p class="empty-state-desc">No insights yet.</p></div>`;
      return;
    }
    el.innerHTML = insights.map((ins) => `
      <div class="insight-card ${ins.severity || 'info'}" style="margin-bottom:var(--space-3)">
        <div class="insight-icon"><i data-lucide="${severityIcon(ins.severity)}" style="width:18px;height:18px"></i></div>
        <div class="insight-text">${ins.text}</div>
      </div>
    `).join('');
  },

  renderActivity(el, activity) {
    if (!el) return;
    if (!activity.length) {
      el.innerHTML = `
        <div class="empty-state" style="padding:var(--space-4)">
          <p class="empty-state-desc">No recent activity. Daily logs, contributions and sales will appear here.</p>
        </div>`;
      return;
    }
    el.innerHTML = activity.map((a) => `
      <div style="display:flex;gap:var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--color-border)">
        <div style="width:32px;height:32px;border-radius:var(--radius-md);background:var(--color-bg-subtle);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--color-text-secondary)">
          <i data-lucide="${a.icon || 'circle'}" style="width:16px;height:16px"></i>
        </div>
        <div style="min-width:0">
          <div class="u-text-sm u-font-medium u-truncate">${a.title}</div>
          <div class="u-text-xs u-text-muted">${a.detail || ''}</div>
          <div class="u-text-xs u-text-muted">${a.date ? new Date(a.date).toLocaleDateString() : ''}</div>
        </div>
      </div>
    `).join('');
  },

  renderAlerts(el, alerts, summary) {
    if (!el) return;
    if (!alerts.length) {
      const hint = summary.criticalAlerts > 0
        ? `${summary.criticalAlerts} critical on record`
        : 'No open alerts';
      el.innerHTML = `
        <div class="empty-state" style="padding:var(--space-4)">
          <i data-lucide="bell-off" class="empty-state-icon" style="width:32px;height:32px"></i>
          <p class="empty-state-desc">${hint}</p>
        </div>`;
      return;
    }
    el.innerHTML = alerts.map((a) => {
      const pri = (a.priority || a.Priority || 'Medium').toLowerCase();
      const badgeCls = pri === 'critical' ? 'critical' : pri === 'high' ? 'caution' : 'neutral';
      return `
        <div style="padding:var(--space-2) 0;border-bottom:1px solid var(--color-border)">
          <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:2px">
            <span class="badge badge-${badgeCls}">${a.priority || a.Priority || 'Medium'}</span>
            <span class="u-text-sm u-font-medium u-truncate">${a.title || a.Title || 'Alert'}</span>
          </div>
          <div class="u-text-xs u-text-muted">${a.reason || a.Reason || a.suggestedAction || a.SuggestedAction || ''}</div>
        </div>`;
    }).join('');
  },

  renderActions(el) {
    if (!el) return;
    const actions = [];
    if (canWrite('operations')) {
      actions.push({ label: 'Log Daily Production', nav: 'operations', icon: 'clipboard-list', primary: true });
      actions.push({ label: 'Record Mortality', nav: 'operations', icon: 'activity' });
      actions.push({ label: 'Log Feed Issue', nav: 'operations', icon: 'package' });
    }
    if (canApprove()) {
      actions.push({ label: 'Add Capital', nav: 'finance', icon: 'banknote', primary: true });
      actions.push({ label: 'Review Funding', nav: 'finance', icon: 'wallet' });
    }
    actions.push({ label: 'View Reports', nav: 'reports', icon: 'file-bar-chart' });
    actions.push({ label: 'Open Alerts', nav: 'alerts', icon: 'bell' });

    el.innerHTML = actions.map((a) => `
      <button class="btn ${a.primary ? 'btn-primary' : 'btn-secondary'} btn-sm" data-nav="${a.nav}">
        <i data-lucide="${a.icon}" style="width:14px;height:14px"></i>
        ${a.label}
      </button>
    `).join('');
  },

  renderCharts(root, s) {
    const eggCanvas = root.querySelector('#chart-eggs');
    const capCanvas = root.querySelector('#chart-capital');
    if (!eggCanvas || !window.Chart) return;

    const trend = s.eggTrend || [];
    const labels = trend.length
      ? trend.map((t) => {
          const d = new Date(t.date);
          return isNaN(d) ? String(t.date) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        })
      : ['—'];
    const eggs = trend.length ? trend.map((t) => t.eggs) : [0];
    const pcts = trend.length ? trend.map((t) => t.percent) : [0];

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#0d9488';

    renderLineChart(eggCanvas, {
      labels,
      datasets: [
        {
          label: 'Eggs',
          data: eggs,
          borderColor: accent,
          backgroundColor: 'transparent',
          tension: 0.3,
          pointRadius: 2,
          yAxisID: 'y'
        },
        {
          label: 'Laying %',
          data: pcts,
          borderColor: '#2563eb',
          backgroundColor: 'transparent',
          borderDash: [4, 4],
          tension: 0.3,
          pointRadius: 0,
          yAxisID: 'y1'
        }
      ],
      options: {
        scales: {
          y: { position: 'left', title: { display: true, text: 'Eggs' } },
          y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: '%' } }
        }
      }
    });

    if (capCanvas) {
      const inv = s.totalInvestment || 0;
      const exp = s.totalExpenses || 0;
      const profit = Math.max(0, s.netProfit || 0);
      const remaining = Math.max(0, inv - exp);
      renderDoughnutChart(capCanvas, {
        labels: ['Expenses', 'Unspent capital', 'Net profit'],
        data: [exp, remaining, profit],
        colors: ['#64748b', accent, '#059669']
      });
    }
  },

  destroy() {
    this._charts = [];
  }
};
