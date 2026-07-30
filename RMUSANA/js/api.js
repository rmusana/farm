/**
 * API client – all communication goes through Google Apps Script Web App.
 * Set window.RMUSANA_API_URL to the deployed Web App URL.
 *
 * Apps Script CORS: use text/plain body so the browser skips OPTIONS preflight.
 */
const DEFAULT_TIMEOUT = 30000;

function getBaseUrl() {
  return window.RMUSANA_API_URL || '';
}

async function request(path, options = {}) {
  const base = getBaseUrl();
  if (!base) {
    const err = new Error('API not configured');
    err.code = 'NO_API';
    throw err;
  }

  const url = base;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);

  // text/plain avoids CORS preflight (OPTIONS) which Apps Script does not handle.
  // Token and path travel in the JSON body, not custom headers.
  const headers = {
    'Content-Type': 'text/plain;charset=utf-8',
    ...(options.headers || {})
  };

  const token = sessionStorage.getItem('rmusana_token');

  const bodyObj = {
    path: path,
    ...(options.body || {})
  };
  if (token) bodyObj.token = token;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyObj),
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  }
}

function ops(resource, action, payload = {}) {
  return request('/operations', {
    body: { module: 'operations', resource, action, projectId: 'LUK54', ...payload }
  });
}

export const api = {
  request,
  auth: {
    me: () => request('/auth', { body: { action: 'me', module: 'auth' } }),
    login: (payload) => request('/auth', { body: { module: 'auth', action: 'login', ...payload } }),
    logout: () => request('/auth', { body: { action: 'logout', module: 'auth' } })
  },
  dashboard: {
    summary: () => request('/dashboard', { body: { action: 'summary', module: 'dashboard' } }),
    insights: () => request('/dashboard', { body: { action: 'insights', module: 'dashboard' } }),
    activity: () => request('/dashboard', { body: { action: 'activity', module: 'dashboard' } })
  },
  operations: {
    dailyList: (p) => ops('daily', 'list', p),
    dailyCreate: (p) => ops('daily', 'create', p),
    flockStatus: (p) => ops('flock', 'status', p),
    flockList: (p) => ops('flock', 'list', p),
    flockCreate: (p) => ops('flock', 'create', p),
    feedList: (p) => ops('feed', 'list', p),
    feedPurchase: (p) => ops('feed', 'purchase', p),
    feedInventory: (p) => ops('feed', 'inventory', p),
    salesList: (p) => ops('sales', 'list', p),
    salesCreate: (p) => ops('sales', 'create', p),
    healthList: (p) => ops('health', 'list', p),
    healthCreate: (p) => ops('health', 'create', p),
    healthSchedule: (p) => ops('health', 'schedule', p),
    mortalityList: (p) => ops('mortality', 'list', p),
    inventoryList: (p) => ops('inventory', 'list', p),
    inventoryAdjust: (p) => ops('inventory', 'adjust', p),
    notesList: (p) => ops('notes', 'list', p),
    notesCreate: (p) => ops('notes', 'create', p)
  },
  finance: {
    capitalList: (params) =>
      request('/finance', { body: { action: 'list', module: 'finance', resource: 'capital', ...params } }),
    capitalCreate: (params) =>
      request('/finance', { body: { action: 'create', module: 'finance', resource: 'capital', ...params } }),
    expensesList: (params) =>
      request('/finance', { body: { action: 'list', module: 'finance', resource: 'expenses', ...params } }),
    expensesCreate: (params) =>
      request('/finance', { body: { action: 'create', module: 'finance', resource: 'expenses', ...params } }),
    budgetStatus: (params) =>
      request('/finance', { body: { action: 'budgetStatus', module: 'finance', ...params } }),
    budgetSeed: (params) =>
      request('/finance', { body: { action: 'budgetSeed', module: 'finance', ...params } }),
    summary: (params) =>
      request('/finance', { body: { action: 'summary', module: 'finance', ...params } }),
    allocation: (params) =>
      request('/finance', { body: { action: 'allocation', module: 'finance', ...params } }),
    distributions: (params) =>
      request('/finance', { body: { action: 'distributions', module: 'finance', ...params } }),
    forecast: (params) =>
      request('/finance', { body: { action: 'forecast', module: 'finance', ...params } })
  },
  reports: {
    generate: (params) => request('/reports', { body: { module: 'reports', action: 'generate', ...params } }),
    list: () => request('/reports', { body: { module: 'reports', action: 'list' } }),
    history: (params) => request('/reports', { body: { module: 'reports', action: 'history', ...params } }),
    email: (params) => request('/reports', { body: { module: 'reports', action: 'email', ...params } })
  },
  alerts: {
    list: () => request('/alerts', { body: { action: 'list', module: 'alerts' } }),
    resolve: (id) => request('/alerts', { body: { action: 'resolve', module: 'alerts', alertId: id } }),
    acknowledge: (id) => request('/alerts', { body: { action: 'acknowledge', module: 'alerts', alertId: id } }),
    run: () => request('/alerts', { body: { action: 'run', module: 'alerts' } })
  },
  documents: {
    list: (params) => request('/documents', { body: { action: 'list', module: 'documents', ...params } }),
    upload: (params) => request('/documents', { body: { action: 'upload', module: 'documents', ...params } }),
    get: (params) => request('/documents', { body: { action: 'get', module: 'documents', ...params } }),
    delete: (params) => request('/documents', { body: { action: 'delete', module: 'documents', ...params } })
  },
  settings: {
    get: () => request('/settings', { body: { action: 'get', module: 'settings' } }),
    update: (payload) => request('/settings', { body: { action: 'update', module: 'settings', ...payload } }),
    users: () => request('/settings', { body: { action: 'users', module: 'settings' } }),
    backup: () => request('/settings', { body: { action: 'backup', module: 'settings' } })
  }
};

export default api;
