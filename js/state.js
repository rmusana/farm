/**
 * Lightweight reactive state store for RMUSANA
 */
const listeners = new Map();
const state = {
  user: null,
  role: null,
  project: null,
  theme: localStorage.getItem('rmusana-theme') || 'light',
  sidebarCollapsed: localStorage.getItem('rmusana-sidebar') === '1',
  sidebarOpen: false,
  alerts: [],
  loading: false,
  route: 'dashboard'
};

export function getState(key) {
  if (key) return state[key];
  return { ...state };
}

export function setState(partial) {
  const keys = Object.keys(partial);
  Object.assign(state, partial);
  if (partial.theme !== undefined) {
    document.documentElement.setAttribute('data-theme', partial.theme);
    localStorage.setItem('rmusana-theme', partial.theme);
  }
  if (partial.sidebarCollapsed !== undefined) {
    localStorage.setItem('rmusana-sidebar', partial.sidebarCollapsed ? '1' : '0');
    document.body.classList.toggle('sidebar-collapsed', partial.sidebarCollapsed);
  }
  keys.forEach((k) => {
    const cbs = listeners.get(k);
    if (cbs) cbs.forEach((cb) => cb(state[k], state));
  });
  const all = listeners.get('*');
  if (all) all.forEach((cb) => cb(state));
}

export function subscribe(key, callback) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(callback);
  return () => listeners.get(key).delete(callback);
}

export function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  document.body.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
}

export default { getState, setState, subscribe, initTheme };
