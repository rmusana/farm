/**
 * Hash-based client router with auth guards
 */
import { setState } from './state.js';
import { requireAuth, isAuthenticated } from './auth.js';

const routes = new Map();
let currentPage = null;
let pageRoot = null;

export function register(path, loader) {
  routes.set(path, loader);
}

export function navigate(path) {
  const clean = path.replace(/^#\/?/, '').replace(/\/$/, '') || 'dashboard';
  window.location.hash = `#/${clean}`;
}

function setShellVisibility(isLogin) {
  const sidebar = document.getElementById('sidebar-root');
  const topbar = document.getElementById('topbar-root');
  const mobileNav = document.getElementById('mobile-nav');
  const mainWrapper = document.querySelector('.main-wrapper');

  if (isLogin) {
    if (sidebar) sidebar.style.display = 'none';
    if (topbar) topbar.style.display = 'none';
    if (mobileNav) mobileNav.style.display = 'none';
    if (mainWrapper) {
      mainWrapper.style.marginLeft = '0';
      mainWrapper.classList.add('login-mode');
    }
  } else {
    if (sidebar) sidebar.style.display = '';
    if (topbar) topbar.style.display = '';
    if (mobileNav) mobileNav.style.display = '';
    if (mainWrapper) {
      mainWrapper.classList.remove('login-mode');
      mainWrapper.style.marginLeft = '';
    }
  }
}

async function resolve() {
  const hash = window.location.hash.slice(1) || '/dashboard';
  const path = hash.replace(/^\//, '').split('?')[0] || 'dashboard';
  const base = path.split('/')[0];

  if (!requireAuth(base === 'login' ? 'login' : base)) {
    return;
  }

  const isLogin = base === 'login';
  setShellVisibility(isLogin);
  setState({ route: path, loading: true });

  const loader = routes.get(path) || routes.get(base);
  if (!loader) {
    renderNotFound();
    setState({ loading: false });
    return;
  }

  try {
    if (currentPage && typeof currentPage.destroy === 'function') {
      currentPage.destroy();
    }
    const mod = await loader();
    currentPage = mod.default || mod;
    if (!pageRoot) pageRoot = document.getElementById('page-root');
    pageRoot.innerHTML = '';
    if (typeof currentPage.render === 'function') {
      await currentPage.render(pageRoot, { path });
    } else if (typeof currentPage === 'function') {
      await currentPage(pageRoot, { path });
    }
    if (!isLogin) highlightNav(base);
  } catch (err) {
    console.error('Route error:', err);
    if (!pageRoot) pageRoot = document.getElementById('page-root');
    pageRoot.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-title">Unable to load page</p>
        <p class="empty-state-desc">${err.message || 'An unexpected error occurred.'}</p>
      </div>`;
  } finally {
    setState({ loading: false });
  }
}

function highlightNav(base) {
  document.querySelectorAll('.nav-item[data-route]').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === base);
  });
  document.querySelectorAll('.mobile-nav-item[data-route]').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === base);
  });
}

function renderNotFound() {
  if (!pageRoot) pageRoot = document.getElementById('page-root');
  pageRoot.innerHTML = `
    <div class="empty-state">
      <p class="empty-state-title">Page not found</p>
      <p class="empty-state-desc">The requested view does not exist.</p>
      <button class="btn btn-primary" data-nav="dashboard">Go to Dashboard</button>
    </div>`;
  pageRoot.querySelector('[data-nav]')?.addEventListener('click', () => navigate('dashboard'));
}

export function initRouter() {
  pageRoot = document.getElementById('page-root');
  window.addEventListener('hashchange', resolve);

  if (!window.location.hash) {
    window.location.hash = isAuthenticated() ? '#/dashboard' : '#/login';
  } else {
    resolve();
  }
}

export default { register, navigate, initRouter };
