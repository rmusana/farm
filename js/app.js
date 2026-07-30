/**
 * RMUSANA application entry point
 */
import { initTheme, setState, getState, subscribe } from './state.js';
import { loadSession, isAuthenticated, initGoogleSignIn } from './auth.js';
import { initRouter, register, navigate } from './router.js';
import { renderSidebar } from '../components/Sidebar.js';
import { renderTopbar } from '../components/Topbar.js';
import { initToasts } from '../components/Toast.js';

const pageLoaders = {
  dashboard: () => import('../pages/Dashboard.js'),
  operations: () => import('../pages/Operations.js'),
  finance: () => import('../pages/Finance.js'),
  reports: () => import('../pages/Reports.js'),
  alerts: () => import('../pages/Alerts.js'),
  documents: () => import('../pages/Documents.js'),
  settings: () => import('../pages/Settings.js'),
  login: () => import('../pages/Login.js')
};

async function boot() {
  initTheme();
  initToasts();

  Object.entries(pageLoaders).forEach(([path, loader]) => register(path, loader));

  await loadSession();

  renderSidebar(document.getElementById('sidebar-root'));
  renderTopbar(document.getElementById('topbar-root'));
  renderMobileNav();

  // Optional Google Identity Services client ID
  if (window.RMUSANA_GOOGLE_CLIENT_ID) {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => initGoogleSignIn(window.RMUSANA_GOOGLE_CLIENT_ID);
    document.head.appendChild(script);
  }

  initRouter();

  // Offline / online banner
  function syncOnlineStatus() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    banner.classList.toggle('visible', !navigator.onLine);
  }
  window.addEventListener('online', syncOnlineStatus);
  window.addEventListener('offline', syncOnlineStatus);
  syncOnlineStatus();


  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (e) {
      console.warn('SW registration failed', e);
    }
  }

  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      e.preventDefault();
      navigate(nav.dataset.nav);
      setState({ sidebarOpen: false });
      document.querySelector('.sidebar')?.classList.remove('open');
      document.querySelector('.sidebar-overlay')?.classList.remove('visible');
    }
  });

  subscribe('sidebarOpen', (open) => {
    document.querySelector('.sidebar')?.classList.toggle('open', open);
    document.querySelector('.sidebar-overlay')?.classList.toggle('visible', open);
  });

  subscribe('user', () => {
    renderTopbar(document.getElementById('topbar-root'));
  });

  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.addEventListener('click', () => setState({ sidebarOpen: false }));
  document.body.appendChild(overlay);

  setTimeout(() => {
    if (window.lucide) window.lucide.createIcons();
  }, 100);
}

function renderMobileNav() {
  const root = document.getElementById('mobile-nav');
  if (!root) return;
  root.innerHTML = `
    <button class="mobile-nav-item" data-route="dashboard" data-nav="dashboard">
      <i data-lucide="layout-dashboard"></i>
      <span>Home</span>
    </button>
    <button class="mobile-nav-item" data-route="operations" data-nav="operations">
      <i data-lucide="clipboard-list"></i>
      <span>Ops</span>
    </button>
    <button class="mobile-nav-item" data-route="finance" data-nav="finance">
      <i data-lucide="wallet"></i>
      <span>Finance</span>
    </button>
    <button class="mobile-nav-item" data-route="alerts" data-nav="alerts">
      <i data-lucide="bell"></i>
      <span>Alerts</span>
    </button>
    <button class="mobile-nav-item" data-route="settings" data-nav="settings">
      <i data-lucide="menu"></i>
      <span>More</span>
    </button>
  `;
}

boot().catch((err) => {
  console.error('Boot failed', err);
  const root = document.getElementById('page-root');
  if (root) {
    root.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-title">Application failed to start</p>
        <p class="empty-state-desc">${err.message}</p>
      </div>`;
  }
});
