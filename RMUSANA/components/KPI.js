/**
 * KPI card component
 */
export function renderKPI(container, items) {
  if (!container) return;
  container.className = 'kpi-grid';
  container.innerHTML = items.map((item) => `
    <div class="card card-glass kpi-card">
      <div class="kpi-label">${item.label}</div>
      <div class="kpi-value">${item.value ?? '—'}</div>
      ${item.trend ? `
        <div class="kpi-trend ${item.trend.direction || 'neutral'}">
          <i data-lucide="${item.trend.direction === 'up' ? 'trending-up' : item.trend.direction === 'down' ? 'trending-down' : 'minus'}" style="width:14px;height:14px"></i>
          <span>${item.trend.label || ''}</span>
        </div>
      ` : ''}
      ${item.insight ? `<div class="kpi-insight">${item.insight}</div>` : ''}
    </div>
  `).join('');
  if (window.lucide) window.lucide.createIcons({ nodes: [container] });
}

export function formatUGX(n) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0
  }).format(n);
}

export function formatPercent(n, digits = 1) {
  if (n == null || isNaN(n)) return '—';
  return `${Number(n).toFixed(digits)}%`;
}

export function formatNumber(n, digits = 0) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-UG', { maximumFractionDigits: digits }).format(n);
}

export default { renderKPI, formatUGX, formatPercent, formatNumber };
