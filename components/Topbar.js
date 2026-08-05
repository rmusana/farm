import { getState, setState, subscribe } from '../js/state.js';
import { logout, isAuthenticated, getRole, canWrite } from '../js/auth.js';
import { navigate } from '../js/router.js';
import { openModal, closeModal, confirmDialog } from './Modal.js';
import { toastSuccess, toastError } from './Toast.js';
import api from '../js/api.js';

const CONTACT_DEFAULTS = {
  investor_name: 'Robert Musana / Moses Odong',
  investor_emails: 'robert@luk54.com,moses@luk54.com',
  investor_phone: '',
  manager_name: 'Jalo Dream Farm',
  manager_emails: 'joseph@jalodreamfarm.com',
  manager_phone: ''
};

async function loadContacts() {
  try {
    if (window.RMUSANA_API_URL) {
      const res = await api.settings.get();
      return { ...CONTACT_DEFAULTS, ...(res.data || {}) };
    }
  } catch (e) {}
  try {
    const local = JSON.parse(localStorage.getItem('rmusana_settings') || '{}');
    return { ...CONTACT_DEFAULTS, ...local };
  } catch {
    return { ...CONTACT_DEFAULTS };
  }
}

function firstEmail(list) {
  return String(list || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)[0] || '';
}

function allEmails(list) {
  return String(list || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',');
}

function openReachOut(contacts) {
  const role = getRole();
  const user = getState('user');
  const isOps = role === 'OperationsManager';
  const isInvestor = role === 'Investor' || role === 'Administrator';

  // Default target: ops reaches investor; investor reaches manager
  const defaultTarget = isOps ? 'investor' : 'manager';

  const html = `
    <p class="u-text-sm u-text-secondary" style="margin-bottom:var(--space-4)">
      Contact the other party about production, funding, mortality, or any operational issue.
      Addresses come from <strong>Settings → Contacts</strong>.
    </p>
    <div class="form-group">
      <label class="form-label">Reach out to</label>
      <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
        <label class="btn btn-sm ${defaultTarget === 'investor' ? 'btn-primary' : 'btn-secondary'}" style="cursor:pointer">
          <input type="radio" name="reach_target" value="investor" ${defaultTarget === 'investor' ? 'checked' : ''} style="margin-right:6px" />
          Investment Partner
        </label>
        <label class="btn btn-sm ${defaultTarget === 'manager' ? 'btn-primary' : 'btn-secondary'}" style="cursor:pointer">
          <input type="radio" name="reach_target" value="manager" ${defaultTarget === 'manager' ? 'checked' : ''} style="margin-right:6px" />
          Operating Partner
        </label>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Subject</label>
      <input class="form-input" id="reach-subject" value="LUK54 — need your attention" />
    </div>
    <div class="form-group">
      <label class="form-label">Message</label>
      <textarea class="form-input" id="reach-body" rows="5" placeholder="Describe the situation and what you need…">Hello,

This is ${user?.name || 'a LUK54 user'} (${role || 'user'}) regarding the LUK54 flock.

[Write your message here]

— Sent from LUK54</textarea>
    </div>
    <p class="u-text-xs u-text-muted" id="reach-preview"></p>
  `;

  openModal({
    title: 'Reach out',
    content: html,
    footer: `
      <button class="btn btn-secondary" data-modal-close>Cancel</button>
      <button class="btn btn-secondary" id="reach-whatsapp" style="display:none">WhatsApp</button>
      <button class="btn btn-primary" id="reach-email">Open email</button>
    `,
    size: 'md'
  });

  function currentTarget() {
    return document.querySelector('input[name="reach_target"]:checked')?.value || defaultTarget;
  }

  function updatePreview() {
    const t = currentTarget();
    const emails = t === 'investor' ? contacts.investor_emails : contacts.manager_emails;
    const name = t === 'investor' ? contacts.investor_name : contacts.manager_name;
    const phone = t === 'investor' ? contacts.investor_phone : contacts.manager_phone;
    const preview = document.getElementById('reach-preview');
    if (preview) {
      preview.textContent = `To: ${name || '—'} · ${emails || '(no email set — update Settings → Contacts)'}`;
    }
    const wa = document.getElementById('reach-whatsapp');
    if (wa) {
      wa.style.display = phone ? 'inline-flex' : 'none';
      wa.dataset.phone = phone || '';
    }
    // Toggle button styles
    document.querySelectorAll('input[name="reach_target"]').forEach((inp) => {
      const label = inp.closest('label');
      if (!label) return;
      label.classList.toggle('btn-primary', inp.checked);
      label.classList.toggle('btn-secondary', !inp.checked);
    });
  }

  document.querySelectorAll('input[name="reach_target"]').forEach((inp) => {
    inp.addEventListener('change', updatePreview);
  });
  updatePreview();

  document.getElementById('reach-email')?.addEventListener('click', () => {
    const t = currentTarget();
    const to = allEmails(t === 'investor' ? contacts.investor_emails : contacts.manager_emails);
    if (!to) {
      toastError('No email configured. Set it under Settings → Contacts.');
      return;
    }
    const subject = encodeURIComponent(document.getElementById('reach-subject')?.value || 'RMUSANA');
    const body = encodeURIComponent(document.getElementById('reach-body')?.value || '');
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    toastSuccess('Opening email client');
    closeModal();
  });

  document.getElementById('reach-whatsapp')?.addEventListener('click', () => {
    const phone = (document.getElementById('reach-whatsapp')?.dataset.phone || '').replace(/\D/g, '');
    if (!phone) {
      toastError('No phone number set for this contact.');
      return;
    }
    const text = encodeURIComponent(document.getElementById('reach-body')?.value || '');
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener');
    closeModal();
  });
}

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
            <span>LUK54</span>
          </div>
        </div>
        <div class="topbar-right">
          <button class="btn btn-secondary btn-sm" id="reach-out-btn" title="Contact Investor or Manager">
            <i data-lucide="message-circle" style="width:16px;height:16px"></i>
            <span class="reach-label">Reach out</span>
          </button>
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

    root.querySelector('#reach-out-btn')?.addEventListener('click', async () => {
      try {
        const contacts = await loadContacts();
        openReachOut(contacts);
      } catch (err) {
        toastError(err.message || 'Could not load contacts');
      }
    });

    root.querySelector('#user-menu')?.addEventListener('click', async () => {
      if (!isAuthenticated()) {
        navigate('login');
        return;
      }
      const ok = await confirmDialog({
        title: 'Sign out',
        message: 'Sign out of LUK54? You will need to sign in again to access the platform.',
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
    const open = (alerts || []).filter((a) => (a.Status || a.status) === 'Open').length;
    dot.style.display = open > 0 ? 'block' : 'none';
  });
}

export default { renderTopbar };
