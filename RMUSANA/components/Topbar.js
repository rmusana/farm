import { getState, setState, subscribe } from '../js/state.js';
import { logout, isAuthenticated, getRole, canWrite } from '../js/auth.js';
import { navigate } from '../js/router.js';
import { confirmDialog } from './Modal.js';

export function renderTopbar(root) {
  if (!root) return;

  function paint() {
    const user = getState('user');
    const theme = getState('theme');
    const role = getRole();
    const initials = user?.name
      ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
      : 'RM';
    const showQuickLog = canWrite('operations');

    root.innerHTML = `
      <header class="topbar" role="banner">
        <div class="topbar-left">
          <button class="icon-btn" id="menu-toggle" aria-label="Open menu">
            <i data-lucide="menu"></i>
          </button>
          <div class="breadcrumb" id="top-breadcrumb">
            <span>RMUSANA</span>
          </div>
        </div>
        <div class="topbar-right">
          <button class="icon-btn" id="theme-toggle" aria-label="Toggle theme">
            <i data-lucide="${theme === 'dark' ? 'sun' : 'moon'}"></i>
          </button>
          <button class="icon-btn" id="notif-btn" aria-label="Notifications" data-nav="alerts">
            <i data-lucide="bell"></i>
            <span class="badge-dot" id="notif-dot" style="display:none"></span>
          </button>
          ${showQuickLog ? `
          <button class="btn btn-primary btn-sm" data-nav="operations" id="quick-log-btn">
            <i data-lucide="plus" style="width:16px;height:16px"></i>
            <span>Log Production</span>
          </button>` : ''}
          <div class="user-chip" id="user-menu" tabindex="0" role="button" aria-haspopup="true" aria-label="User menu">
            <div class="user-avatar">${initials}</div>
            <div class="user-meta">
              <span class="user-name">${user?.name || 'Guest'}</span>
              <span class="user-role">${role || '—'}</span>
            </div>
            <i data-lucide="chevron-down" style="width:16px;height:16px;color:var(--color-text-muted)"></i>
          </div>
        </div>
      </header>
    `;

    root.querySelector('#menu-toggle')?.addEventListener('click', () => {
      setState({ sidebarOpen: !getState('sidebarOpen') });
    });

    root.querySelector('#theme-toggle')?.addEventListener('click', () => {
      const next = getState('theme') === 'dark' ? 'light' : 'dark';
      setState({ theme: next });
      paint();
    });

    root.querySelector('#user-menu')?.addEventListener('click', async () => {
      if (!isAuthenticated()) {
        navigate('login');
        return;
      }
      const ok = await confirmDialog({
        title: 'Sign out',
        message: 'Sign out of RMUSANA? You will need to sign in again to access the platform.',
        confirmLabel: 'Sign out',
        danger: false
      });
      if (ok) logout();
    });

    if (window.lucide) window.lucide.createIcons({ nodes: [root] });
  }

  paint();
  subscribe('user', paint);
  subscribe('theme', paint);
  subscribe('alerts', (alerts) => {
    const dot = root.querySelector('#notif-dot');
    if (!dot) return;
    const open = (alerts || []).filter((a) => a.status === 'Open').length;
    dot.style.display = open > 0 ? 'block' : 'none';
  });
}

export default { renderTopbar };
