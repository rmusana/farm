import { getState, setState, subscribe } from '../js/state.js';
import { canAccess, getRole } from '../js/auth.js';

const NAV = [
  {
    section: 'Overview',
    items: [
      { route: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' }
    ]
  },
  {
    section: 'Operations',
    items: [
      { route: 'operations', label: 'Operations', icon: 'clipboard-list' }
    ]
  },
  {
    section: 'Finance',
    items: [
      { route: 'finance', label: 'Finance', icon: 'wallet' }
    ]
  },
  {
    section: 'Insights',
    items: [
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

    const filtered = NAV.map((sec) => ({
      ...sec,
      items: sec.items.filter((item) => canAccess(item.route))
    })).filter((sec) => sec.items.length > 0);

    root.innerHTML = `
      <aside class="sidebar ${collapsed ? 'collapsed' : ''}" id="sidebar" aria-label="Main navigation">
        <div class="sidebar-brand">
          <div class="sidebar-brand-mark" aria-hidden="true">
            <span>54</span>
          </div>
          <div class="sidebar-brand-copy">
            <span class="sidebar-brand-text">LUK54</span>
            <span class="sidebar-brand-sub">Jalo Dream Farm</span>
          </div>
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

    root.querySelector('#sidebar-collapse-btn')?.addEventListener('click', () => {
      setState({ sidebarCollapsed: !getState('sidebarCollapsed') });
    });

    root.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const route = btn.getAttribute('data-nav');
        if (route) window.location.hash = '#/' + route;
        if (window.matchMedia('(max-width: 900px)').matches) {
          setState({ sidebarOpen: false });
        }
      });
    });

    if (window.lucide) window.lucide.createIcons({ nodes: [root] });
  }

  paint();
  subscribe((key) => {
    if (key === 'sidebarCollapsed' || key === 'role' || key === 'user' || key === '*') paint();
  });
}

export default { renderSidebar };
