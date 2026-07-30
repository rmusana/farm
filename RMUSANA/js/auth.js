/**
 * Authentication – session, roles, Google OAuth, credential login
 */
import { setState, getState } from './state.js';
import api from './api.js';

const PUBLIC_ROUTES = new Set(['login']);

const ROLE_PERMISSIONS = {
  Investor: ['dashboard', 'operations', 'finance', 'reports', 'alerts', 'documents', 'settings'],
  Administrator: ['dashboard', 'operations', 'finance', 'reports', 'alerts', 'documents', 'settings'],
  OperationsManager: ['dashboard', 'operations', 'alerts', 'documents', 'reports'],
  Viewer: ['dashboard', 'reports']
};

export function isAuthenticated() {
  return !!getState('user');
}

export function getRole() {
  return getState('role');
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
  const role = getRole();
  const allowed = ROLE_PERMISSIONS[role];
  if (!allowed) return false;
  const base = route.split('/')[0];
  return allowed.includes(base);
}

export function canWrite(module) {
  const role = getRole();
  if (role === 'Investor' || role === 'Administrator') return true;
  if (role === 'OperationsManager') {
    return ['operations', 'alerts', 'documents'].includes(module);
  }
  return false;
}

export function canApprove() {
  return hasRole('Investor', 'Administrator');
}

function persistSession(user, token) {
  sessionStorage.setItem('rmusana_token', token);
  sessionStorage.setItem('rmusana_user', JSON.stringify(user));
  setState({ user, role: user.role });
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

  // Local development / offline bootstrap users (matches Agreement parties)
  const bootstrap = getBootstrapUsers();
  const match = bootstrap.find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  );
  if (!match) {
    throw new Error('Invalid email or password');
  }
  const user = {
    id: match.id,
    email: match.email,
    name: match.name,
    role: match.role
  };
  const token = 'local_' + btoa(user.email + ':' + Date.now());
  persistSession(user, token);
  return user;
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
      id: 'usr_robert',
      email: 'robert@luk54.com',
      password: 'investor2026',
      name: 'Robert Musana',
      role: 'Investor'
    },
    {
      id: 'usr_moses',
      email: 'moses@luk54.com',
      password: 'investor2026',
      name: 'Moses Odong',
      role: 'Investor'
    },
    {
      id: 'usr_joseph',
      email: 'joseph@jalodreamfarm.com',
      password: 'ops2026',
      name: 'Joseph Sango',
      role: 'OperationsManager'
    },
    {
      id: 'usr_admin',
      email: 'admin@rmusana.com',
      password: 'admin2026',
      name: 'System Admin',
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
  canApprove,
  loadSession,
  loginWithCredentials,
  loginWithGoogleToken,
  logout,
  requireAuth,
  initGoogleSignIn
};
