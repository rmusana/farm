/**
 * Authentication – session, roles, Google OAuth, credential login
 */
import { setState, getState } from './state.js';
import api from './api.js';

const PUBLIC_ROUTES = new Set(['login']);

const ROLE_PERMISSIONS = {
  /* Full system control */
  Administrator: ['dashboard', 'operations', 'finance', 'reports', 'alerts', 'documents', 'settings'],
  /* Capital, returns, statements, high-level flock health — not daily data entry */
  Investor: ['dashboard', 'operations', 'finance', 'reports', 'alerts', 'documents'],
  /* Day-to-day flock, records, expenses, sales, supporting documents */
  OperationsManager: ['dashboard', 'operations', 'finance', 'reports', 'alerts', 'documents'],
  OperatingPartner: ['dashboard', 'operations', 'finance', 'reports', 'alerts', 'documents'],
  Viewer: ['dashboard', 'reports', 'alerts']
};

const ROLE_LABELS = {
  Administrator: 'Administrator',
  Investor: 'Investment Partner',
  OperationsManager: 'Operating Partner',
  OperatingPartner: 'Operating Partner',
  Viewer: 'Viewer'
};

/** Finance tabs visible per role */
const FINANCE_SECTIONS_BY_ROLE = {
  Administrator: ['summary', 'capital', 'disbursed', 'revenue', 'expenses', 'allocation', 'profit', 'cashflow', 'forecast'],
  Investor: ['summary', 'capital', 'disbursed', 'revenue', 'expenses', 'allocation', 'profit', 'cashflow', 'forecast'],
  OperationsManager: ['summary', 'revenue', 'expenses'],
  OperatingPartner: ['summary', 'revenue', 'expenses'],
  Viewer: ['summary']
};

/** Normalize backend / legacy role strings to a known key */
export function normalizeRole(role) {
  if (!role) return 'Viewer';
  const r = String(role).trim();
  const map = {
    Administrator: 'Administrator',
    Admin: 'Administrator',
    admin: 'Administrator',
    administrator: 'Administrator',
    Investor: 'Investor',
    investor: 'Investor',
    'Investment Partner': 'Investor',
    InvestmentPartner: 'Investor',
    OperationsManager: 'OperationsManager',
    OperatingPartner: 'OperationsManager',
    'Operating Partner': 'OperationsManager',
    'operations manager': 'OperationsManager',
    Viewer: 'Viewer',
    viewer: 'Viewer'
  };
  if (map[r]) return map[r];
  const lower = r.toLowerCase();
  if (lower.includes('admin')) return 'Administrator';
  if (lower.includes('invest')) return 'Investor';
  if (lower.includes('operat')) return 'OperationsManager';
  return r;
}

export function roleLabel(role) {
  const key = normalizeRole(role);
  return ROLE_LABELS[key] || key || '—';
}

export function isAuthenticated() {
  return !!getState('user');
}

export function getRole() {
  return normalizeRole(getState('role'));
}

export function getUser() {
  return getState('user');
}

export function hasRole(...roles) {
  const role = getRole();
  return roles.includes(role);
}

export function canAccess(route) {
  if (PUBLIC_ROUTES.has(route)) return true;
  if (!isAuthenticated()) return false;
  const role = normalizeRole(getRole());
  // Administrator always has full nav including settings
  if (role === 'Administrator') return true;
  const allowed = ROLE_PERMISSIONS[role];
  if (!allowed) return false;
  const base = route.split('/')[0];
  return allowed.includes(base);
}

export function canWrite(module) {
  const role = getRole();
  if (role === 'Administrator') return true;
  /* Investor: view ops; write only on finance (capital etc.) and documents */
  if (role === 'Investor') {
    return ['finance', 'documents', 'reports'].includes(module);
  }
  if (role === 'OperationsManager' || role === 'OperatingPartner') {
    return ['operations', 'finance', 'alerts', 'documents'].includes(module);
  }
  return false;
}

/** Ops can post expenses/sales; not capital, allocation, profit distributions */
export function canWriteFinanceSection(sectionId) {
  const role = getRole();
  if (role === 'Administrator' || role === 'Investor') return true;
  if (role === 'OperationsManager' || role === 'OperatingPartner') {
    return ['expenses', 'revenue', 'summary'].includes(sectionId);
  }
  return false;
}

export function financeSectionsForRole() {
  const role = getRole() || 'Viewer';
  return FINANCE_SECTIONS_BY_ROLE[role] || FINANCE_SECTIONS_BY_ROLE.Viewer;
}

/** Investor is read-only on Operations data entry */
export function canWriteOperations() {
  const role = getRole();
  return role === 'Administrator' || role === 'OperationsManager' || role === 'OperatingPartner';
}

export function canApprove() {
  return hasRole('Investor', 'Administrator');
}

export function isAdmin() {
  return hasRole('Administrator');
}

export function isInvestor() {
  return hasRole('Investor');
}

export function isOps() {
  return hasRole('OperationsManager', 'OperatingPartner');
}

function persistSession(user, token) {
  const normalized = { ...user, role: normalizeRole(user.role || user.Role) };
  sessionStorage.setItem('rmusana_token', token);
  sessionStorage.setItem('rmusana_user', JSON.stringify(normalized));
  setState({ user: normalized, role: normalized.role });
}

function clearSession() {
  sessionStorage.removeItem('rmusana_token');
  sessionStorage.removeItem('rmusana_user');
  setState({ user: null, role: null });
}

export async function loadSession() {
  try {
    const token = sessionStorage.getItem('rmusana_token');
    const stored = sessionStorage.getItem('rmusana_user');
    if (!token || !stored) {
      clearSession();
      return null;
    }

    // Validate with backend when API is configured
    if (window.RMUSANA_API_URL) {
      try {
        const res = await api.auth.me();
        if (res.success && res.data) {
          persistSession(res.data, token);
          return res.data;
        }
        clearSession();
        return null;
      } catch {
        // Offline / API unavailable – trust stored session until next online check
        const user = JSON.parse(stored);
        setState({ user, role: user.role });
        return user;
      }
    }

    const user = JSON.parse(stored);
    setState({ user, role: user.role });
    return user;
  } catch {
    clearSession();
    return null;
  }
}

export async function loginWithCredentials(email, password) {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  // When Apps Script is deployed, call the API
  if (window.RMUSANA_API_URL) {
    const res = await api.auth.login({ action: 'login', email, password });
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Invalid credentials');
    }
    persistSession(res.data.user, res.data.token);
    return res.data.user;
  }

  // Local-only bootstrap (never used when API URL is set)
  throw new Error('API is not configured. Set RMUSANA_API_URL to sign in.');
}

export async function loginWithGoogleToken(credential) {
  if (!credential) throw new Error('Missing Google credential');

  if (window.RMUSANA_API_URL) {
    const res = await api.auth.login({ action: 'google', credential });
    if (!res.success || !res.data) {
      throw new Error(res.error || 'Google authentication failed');
    }
    persistSession(res.data.user, res.data.token);
    return res.data.user;
  }

  throw new Error('Google Sign-In requires the Apps Script backend to be configured');
}

export function logout() {
  if (window.RMUSANA_API_URL) {
    api.auth.logout().catch(() => {});
  }
  clearSession();
  window.location.hash = '#/login';
}

export function requireAuth(route) {
  const base = (route || '').split('/')[0] || 'dashboard';
  if (PUBLIC_ROUTES.has(base)) {
    if (isAuthenticated() && base === 'login') {
      window.location.hash = '#/dashboard';
      return false;
    }
    return true;
  }
  if (!isAuthenticated()) {
    window.location.hash = '#/login';
    return false;
  }
  if (!canAccess(base)) {
    window.location.hash = '#/dashboard';
    return false;
  }
  return true;
}

/**
 * Bootstrap accounts aligned with Agreement parties.
 * Replace with Users sheet data once Apps Script is live.
 */
function getBootstrapUsers() {
  return [
    {
      id: 'usr_investor_a',
      email: 'robert@luk54.com',
      password: 'investor2026',
      name: 'Investment Partner',
      role: 'Investor'
    },
    {
      id: 'usr_investor_b',
      email: 'moses@luk54.com',
      password: 'investor2026',
      name: 'Investment Partner',
      role: 'Investor'
    },
    {
      id: 'usr_ops',
      email: 'joseph@jalodreamfarm.com',
      password: 'ops2026',
      name: 'Operating Partner',
      role: 'OperationsManager'
    },
    {
      id: 'usr_admin',
      email: 'admin@rmusana.com',
      password: 'admin2026',
      name: 'Administrator',
      role: 'Administrator'
    }
  ];
}

export function initGoogleSignIn(clientId) {
  if (!clientId || !window.google?.accounts?.id) return;
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: async (response) => {
      try {
        await loginWithGoogleToken(response.credential);
        window.location.hash = '#/dashboard';
      } catch (err) {
        console.error(err);
        const { toastError } = await import('../components/Toast.js');
        toastError(err.message || 'Google Sign-In failed');
      }
    },
    auto_select: false
  });
}

export default {
  isAuthenticated,
  getRole,
  getUser,
  hasRole,
  canAccess,
  canWrite,
  canWriteFinanceSection,
  canWriteOperations,
  financeSectionsForRole,
  canApprove,
  isAdmin,
  isInvestor,
  isOps,
  normalizeRole,
  roleLabel,
  loadSession,
  loginWithCredentials,
  loginWithGoogleToken,
  logout,
  requireAuth,
  initGoogleSignIn
};
