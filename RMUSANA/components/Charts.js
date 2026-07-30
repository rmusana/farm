/**
 * Chart helpers (Chart.js)
 */
const chartInstances = new Map();

export function initIcons() {
  if (window.lucide) window.lucide.createIcons();
}

export function renderLineChart(canvas, { labels, datasets, options = {} }) {
  if (!canvas || !window.Chart) return null;
  destroyChart(canvas);
  const ctx = canvas.getContext('2d');
  const chart = new window.Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, position: 'top' },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted') }
        },
        y: {
          grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--color-border') },
          ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted') }
        }
      },
      ...options
    }
  });
  chartInstances.set(canvas, chart);
  return chart;
}

export function renderBarChart(canvas, { labels, datasets, options = {} }) {
  if (!canvas || !window.Chart) return null;
  destroyChart(canvas);
  const ctx = canvas.getContext('2d');
  const chart = new window.Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: getComputedStyle(document.documentElement).getPropertyValue('--color-border') } }
      },
      ...options
    }
  });
  chartInstances.set(canvas, chart);
  return chart;
}

export function renderDoughnutChart(canvas, { labels, data, colors, options = {} }) {
  if (!canvas || !window.Chart) return null;
  destroyChart(canvas);
  const ctx = canvas.getContext('2d');
  const chart = new window.Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors || ['#0d9488', '#2563eb', '#d97706', '#e11d48', '#64748b'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      cutout: '68%',
      ...options
    }
  });
  chartInstances.set(canvas, chart);
  return chart;
}

export function destroyChart(canvas) {
  const existing = chartInstances.get(canvas);
  if (existing) {
    existing.destroy();
    chartInstances.delete(canvas);
  }
}

export default { renderLineChart, renderBarChart, renderDoughnutChart, destroyChart, initIcons };
