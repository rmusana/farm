import { getState, setState, subscribe } from '../js/state.js';
import { canAccess, getRole } from '../js/auth.js';

const NAV = [
  {
    section: 'Main',
    items: [
      { route: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
      { route: 'operations', label: 'Operations', icon: 'clipboard-list' },
      { route: 'finance', label: 'Finance', icon: 'wallet' },
      { route: 'reports', label: 'Reports', icon: 'file-bar-chart' },
      { route: 'alerts', label: 'Alerts', icon: 'bell', badge: true },
      { route: 'documents', label: 'Documents', icon: 'folder' }
    ]
  },
  {
    section: 'System',
    items: [
      { route: 'settings', label: 'Settings', icon: 'settings' }
    ]
  }
];

export function renderSidebar(root) {
  if (!root) return;

  function paint() {
    const collapsed = getState('sidebarCollapsed');
    const role = getRole();

    const filtered = NAV.map((sec) => ({
      ...sec,
      items: sec.items.filter((item) => canAccess(item.route))
    })).filter((sec) => sec.items.length > 0);

    root.innerHTML = `
      <aside class="sidebar ${collapsed ? 'collapsed' : ''}" id="sidebar" aria-label="Main navigation">
        <div class="sidebar-brand">
          <div class="sidebar-brand-mark">RM</div>
          <span class="sidebar-brand-text">RMUSANA</span>
        </div>
        <nav class="sidebar-nav">
          ${filtered.map((sec) => `
            <div class="nav-section">
              <div class="nav-section-title">${sec.section}</div>
              ${sec.items.map((item) => `
                <button class="nav-item" data-route="${item.route}" data-nav="${item.route}" aria-label="${item.label}">
                  <i data-lucide="${item.icon}" class="nav-icon"></i>
                  <span class="nav-label">${item.label}</span>
                  ${item.badge ? '<span class="nav-badge" id="alert-badge" style="display:none">0</span>' : ''}
                </button>
              `).join('')}
            </div>
          `).join('')}
        </nav>
        <div class="sidebar-footer">
          <button class="nav-item" id="sidebar-collapse-btn" aria-label="Collapse sidebar">
            <i data-lucide="panel-left-close" class="nav-icon"></i>
            <span class="nav-label">Collapse</span>
          </button>
        </div>
      </aside>
    `;

    const sidebar = root.querySelector('#sidebar');
    root.querySelector('#sidebar-collapse-btn')?.addEventListener('click', () => {
      const next = !getState('sidebarCollapsed');
      setState({ sidebarCollapsed: next });
      sidebar.classList.toggle('collapsed', next);
    });

    if (window.lucide) window.lucide.createIcons({ nodes: [root] });
  }

  paint();

  subscribe('sidebarCollapsed', (val) => {
    root.querySelector('#sidebar')?.classList.toggle('collapsed', val);
  });

  subscribe('user', paint);

  subscribe('alerts', (alerts) => {
    const badge = root.querySelector('#alert-badge');
    if (!badge) return;
    const open = (alerts || []).filter((a) => a.status === 'Open').length;
    if (open > 0) {
      badge.style.display = 'flex';
      badge.textContent = open > 99 ? '99+' : String(open);
    } else {
      badge.style.display = 'none';
    }
  });
}

export default { renderSidebar };
