/**
 * API client – all communication goes through Google Apps Script Web App.
 * Set window.RMUSANA_API_URL to the deployed Web App URL.
 */
const DEFAULT_TIMEOUT = 15000;
const CACHE_TTL_MS = 30000;
const pending = new Map();
const cache = new Map();

function cacheKey(path, body) {
  try { return path + '|' + JSON.stringify(body || {}); } catch { return path; }
}
function isCacheable(path, body) {
  const action = (body && body.action) || '';
  return action === 'list' || action === 'get' || action === 'summary' || action === 'insights' || action === 'activity' || action === 'status' || action === 'compute' || action === 'inventory' || action === 'users';
}
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

  const bodyForKey = options.body || {};
  const key = cacheKey(path, bodyForKey);
  const now = Date.now();
  // serve cached GET-like reads
  if (!options.noCache && isCacheable(path, bodyForKey)) {
    const hit = cache.get(key);
    if (hit && now - hit.t < CACHE_TTL_MS) return hit.v;
    const pend = pending.get(key);
    if (pend) return pend;
  }

  const exec = (async () => {
    const url = `${base}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);
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
      // cache successful reads
      if (isCacheable(path, bodyForKey)) {
        cache.set(key, { v: data, t: Date.now() });
      } else {
        // invalidate lists on writes
        cache.clear();
      }
      return data;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw new Error('Request timed out');
      throw err;
    } finally {
      pending.delete(key);
    }
  })();

  if (isCacheable(path, bodyForKey) && !options.noCache) pending.set(key, exec);
  return exec;
}

export function clearApiCache() { cache.clear(); pending.clear(); }

function ops(resource, action, payload = {}) {
  return request('/operations', {
    body: { module: 'operations', resource, action, projectId: 'LUK54', ...payload }
  });
}

export const api = {
  request,
  auth: {
    me: () => request('/auth', { body: { action: 'me', module: 'auth' } }),
    login: (payload) => request('/auth', { body: { module: 'auth', ...payload } }),
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
    capitalList: (params) => request('/finance', { body: { action: 'list', module: 'finance', resource: 'capital', ...params } }),
    expensesList: (params) => request('/finance', { body: { action: 'list', module: 'finance', resource: 'expenses', ...params } })
  },
  reports: {
    generate: (params) => request('/reports', { body: { module: 'reports', ...params } })
  },
  alerts: {
    list: () => request('/alerts', { body: { action: 'list', module: 'alerts' } }),
    resolve: (id) => request('/alerts', { body: { action: 'resolve', module: 'alerts', alertId: id } })
  },
  documents: {
    list: (params) => request('/documents', { body: { action: 'list', module: 'documents', ...params } })
  },
  settings: {
    get: () => request('/settings', { body: { action: 'get', module: 'settings' } }),
    update: (payload) => request('/settings', { body: { action: 'update', module: 'settings', ...payload } })
  }
};

export default api;
