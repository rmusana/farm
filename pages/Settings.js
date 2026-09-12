/**
 * Settings – users, project, notifications, system, backup
 */
import { field, serializeForm, validateRequired } from '../components/Form.js';
import { renderDataTable } from '../components/DataTable.js';
import { openModal, closeModal, confirmDialog } from '../components/Modal.js';
import { toastSuccess, toastError } from '../components/Toast.js';
import { setState, getState } from '../js/state.js';
import { canApprove, getRole, hasRole, roleLabel } from '../js/auth.js';
import api from '../js/api.js';

const SECTIONS = [
  { id: 'project', label: 'Project', icon: 'building-2' },
  { id: 'contacts', label: 'Contacts', icon: 'phone' },
  { id: 'users', label: 'Users & Roles', icon: 'users' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'security', label: 'Security', icon: 'lock' },
  { id: 'system', label: 'System', icon: 'sliders' },
  { id: 'backup', label: 'Backup & Restore', icon: 'database' }
];

const ROLES = ['Investor', 'Administrator', 'OperationsManager', 'Viewer'];

function defaults() {
  return {
    project_id: 'LUK54',
    project_name: 'LUK54 Dedicated Flock',
    start_date: '2026-06-01',
    planned_birds: 2500,
    commercial_week: 25,
    commercial_laying_pct: 85,
    production_target_min: 88,
    production_target_max: 92,
    off_lay_pct: 80,
    off_lay_weeks: 4,
    statement_due_day: 10,
    // Contact directory – used by Reach out + alert emails
    investor_name: 'Robert Musana / Moses Odong',
    investor_emails: 'robert@luk54.com,moses@luk54.com',
    investor_phone: '',
    manager_name: 'Jalo Dream Farm',
    manager_emails: 'joseph@jalodreamfarm.com',
    manager_phone: '',
    alert_emails: 'robert@luk54.com,moses@luk54.com',
    email_critical: true,
    email_digest: false,
    theme_default: 'light',
    currency: 'UGX'
  };
}

function localSettings(value) {
  if (value === undefined) {
    try {
      return { ...defaults(), ...JSON.parse(localStorage.getItem('rmusana_settings') || '{}') };
    } catch {
      return defaults();
    }
  }
  localStorage.setItem('rmusana_settings', JSON.stringify(value));
}

async function loadSettings() {
  if (window.RMUSANA_API_URL) {
    const res = await api.settings.get();
    return { ...defaults(), ...(res.data || {}) };
  }
  return localSettings();
}

async function saveSettings(partial) {
  if (window.RMUSANA_API_URL) {
    await api.settings.update({ settings: partial });
  } else {
    localSettings({ ...localSettings(), ...partial });
  }
}

export default {
  section: 'project',
  settings: defaults(),

  async render(root) {
    this.root = root;
    this.settings = await loadSettings();

    root.innerHTML = `
      <div class="page-header">
        <div class="page-header-title">
          <div class="breadcrumb"><span>System</span><span>/</span><span>Settings</span></div>
          <h1>Settings</h1>
          <p class="u-text-secondary u-text-sm">Project parameters, users and system preferences</p>
        </div>
      </div>

      <div class="grid-2" style="align-items:start">
        <div class="card" style="padding:var(--space-2)">
          ${SECTIONS.map((s) => `
            <button class="nav-item ${s.id === this.section ? 'active' : ''}" data-sec="${s.id}" style="width:100%">
              <i data-lucide="${s.icon}" class="nav-icon"></i>
              <span class="nav-label">${s.label}</span>
            </button>
          `).join('')}
        </div>
        <div class="card">
          <div class="card-body" id="settings-panel"><div class="skeleton" style="height:200px"></div></div>
        </div>
      </div>
    `;

    root.querySelectorAll('[data-sec]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.section = btn.dataset.sec;
        root.querySelectorAll('[data-sec]').forEach((b) => b.classList.toggle('active', b.dataset.sec === this.section));
        this.renderPanel();
      });
    });

    await this.renderPanel();
    if (window.lucide) window.lucide.createIcons({ nodes: [root] });
  },

  async renderPanel() {
    const panel = this.root.querySelector('#settings-panel');
    if (!panel) return;
    const map = {
      project: () => this.panelProject(panel),
      contacts: () => this.panelContacts(panel),
      users: () => this.panelUsers(panel),
      notifications: () => this.panelNotifications(panel),
      security: () => this.panelSecurity(panel),
      system: () => this.panelSystem(panel),
      backup: () => this.panelBackup(panel)
    };
    await (map[this.section] || map.project)();
    if (window.lucide) window.lucide.createIcons({ nodes: [panel] });
  },

  panelProject(panel) {
    const s = this.settings;
    const canEdit = canApprove();
    panel.innerHTML = `
      <h3 style="margin-bottom:var(--space-4)">Project settings</h3>
      <form id="form-project">
        ${field({ name: 'project_name', label: 'Project name', value: s.project_name || '' })}
        ${field({ name: 'project_id', label: 'Project ID', value: s.project_id || 'LUK54', hint: 'Used as ProjectID in all records' })}
        ${field({ name: 'start_date', label: 'Stocking / start date', type: 'date', value: s.start_date || '2026-06-01' })}
        ${field({ name: 'planned_birds', label: 'Planned birds', type: 'number', value: String(s.planned_birds || 2500) })}
        <div class="form-row">
          ${field({ name: 'commercial_week', label: 'Commercial week', type: 'number', value: String(s.commercial_week || 25) })}
          ${field({ name: 'commercial_laying_pct', label: 'Commercial laying %', type: 'number', value: String(s.commercial_laying_pct || 85) })}
        </div>
        <div class="form-row">
          ${field({ name: 'production_target_min', label: 'Target min %', type: 'number', value: String(s.production_target_min || 88) })}
          ${field({ name: 'production_target_max', label: 'Target max %', type: 'number', value: String(s.production_target_max || 92) })}
        </div>
        <div class="form-row">
          ${field({ name: 'off_lay_pct', label: 'Off-lay threshold %', type: 'number', value: String(s.off_lay_pct || 80) })}
          ${field({ name: 'off_lay_weeks', label: 'Off-lay consecutive weeks', type: 'number', value: String(s.off_lay_weeks || 4) })}
        </div>
        ${field({ name: 'statement_due_day', label: 'Statement due day of month', type: 'number', value: String(s.statement_due_day || 10) })}
        ${canEdit ? `<button type="submit" class="btn btn-primary">Save project settings</button>` : '<p class="u-text-xs u-text-muted">Only Investor / Administrator can edit.</p>'}
      </form>
    `;
    if (canEdit) {
      panel.querySelector('#form-project')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = serializeForm(e.target);
        const partial = {
          project_name: data.project_name,
          project_id: data.project_id,
          start_date: data.start_date,
          planned_birds: Number(data.planned_birds),
          commercial_week: Number(data.commercial_week),
          commercial_laying_pct: Number(data.commercial_laying_pct),
          production_target_min: Number(data.production_target_min),
          production_target_max: Number(data.production_target_max),
          off_lay_pct: Number(data.off_lay_pct),
          off_lay_weeks: Number(data.off_lay_weeks),
          statement_due_day: Number(data.statement_due_day)
        };
        try {
          await saveSettings(partial);
          this.settings = { ...this.settings, ...partial };
          toastSuccess('Project settings saved');
        } catch (err) {
          toastError(err.message || 'Save failed');
        }
      });
    }
  },

  panelContacts(panel) {
    const s = this.settings;
    const canEdit = canApprove();
    panel.innerHTML = `
      <h3 style="margin-bottom:var(--space-4)">Contacts</h3>
      <p class="u-text-sm u-text-secondary" style="margin-bottom:var(--space-4)">
        These addresses power the <strong>Reach out</strong> button in the top bar and default alert recipients.
        Change them anytime for testing or production.
      </p>
      <form id="form-contacts">
        <h4 class="u-text-sm u-font-semibold" style="margin-bottom:var(--space-3)">Investment Partner</h4>
        ${field({ name: 'investor_name', label: 'Name(s)', value: s.investor_name || '' })}
        ${field({ name: 'investor_emails', label: 'Email(s)', value: s.investor_emails || '', hint: 'Comma-separated' })}
        ${field({ name: 'investor_phone', label: 'Phone / WhatsApp', value: s.investor_phone || '', hint: 'Optional, with country code' })}
        <h4 class="u-text-sm u-font-semibold" style="margin:var(--space-5) 0 var(--space-3)">Operating Partner</h4>
        ${field({ name: 'manager_name', label: 'Name', value: s.manager_name || '' })}
        ${field({ name: 'manager_emails', label: 'Email(s)', value: s.manager_emails || '', hint: 'Comma-separated' })}
        ${field({ name: 'manager_phone', label: 'Phone / WhatsApp', value: s.manager_phone || '', hint: 'Optional, with country code' })}
        ${canEdit ? `<button type="submit" class="btn btn-primary">Save contacts</button>` : '<p class="u-text-xs u-text-muted">Only Investor / Administrator can edit.</p>'}
      </form>
    `;
    if (canEdit) {
      panel.querySelector('#form-contacts')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = serializeForm(e.target);
        const partial = {
          investor_name: data.investor_name,
          investor_emails: data.investor_emails,
          investor_phone: data.investor_phone,
          manager_name: data.manager_name,
          manager_emails: data.manager_emails,
          manager_phone: data.manager_phone
        };
        if (!this.settings.alert_emails || this.settings.alert_emails === defaults().alert_emails) {
          partial.alert_emails = data.investor_emails;
        }
        try {
          await saveSettings(partial);
          this.settings = { ...this.settings, ...partial };
          toastSuccess('Contacts saved');
        } catch (err) {
          toastError(err.message || 'Save failed');
        }
      });
    }
  },

  async panelUsers(panel) {
    panel.innerHTML = `<div class="skeleton" style="height:120px"></div>`;
    let users = [];
    try {
      if (window.RMUSANA_API_URL) {
        const res = await api.request('/settings', { body: { module: 'settings', action: 'users' } });
        users = res.data || [];
      } else {
        users = [
          { UserID: 'usr_robert', Email: 'robert@luk54.com', Name: 'Investment Partner', Role: 'Investor', Active: true },
          { UserID: 'usr_moses', Email: 'moses@luk54.com', Name: 'Investment Partner', Role: 'Investor', Active: true },
          { UserID: 'usr_joseph', Email: 'joseph@jalodreamfarm.com', Name: 'Operating Partner', Role: 'OperationsManager', Active: true },
          { UserID: 'usr_admin', Email: 'admin@rmusana.com', Name: 'Administrator', Role: 'Administrator', Active: true }
        ];
      }
    } catch (err) {
      panel.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${err.message}</p></div>`;
      return;
    }

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4)">
        <h3>Users & roles</h3>
        ${canApprove() ? `<button class="btn btn-primary btn-sm" id="btn-add-user"><i data-lucide="plus" style="width:14px;height:14px"></i> Add user</button>` : ''}
      </div>
      <div id="users-table"></div>
      <p class="u-text-xs u-text-muted" style="margin-top:var(--space-3)">
        Roles: Investor / Administrator (full access) · Operating Partner (ops write) · Viewer (read-only)
      </p>
    `;

    renderDataTable(panel.querySelector('#users-table'), {
      columns: [
        { key: 'Name', label: 'Name', accessor: function (r) { return r.Name || r.name || '—'; } },
        { key: 'Email', label: 'Email', accessor: function (r) { return r.Email || r.email || '—'; } },
        { key: 'Role', label: 'Role', accessor: function (r) { return roleLabel(r.Role || r.role); } },
        { key: 'Active', label: 'Active', accessor: function (r) {
          return (r.Active === true || r.Active === 'TRUE' || r.Active === 'Yes') ? 'Yes' : 'No';
        } }
      ],
      rows: users,
      emptyMessage: 'No users found.',
      actions: canApprove() ? [{ id: 'edit', label: 'Edit', icon: 'pencil' }] : null,
      onAction: function (action, row) {
        if (action === 'edit') this.openEditUser(row);
      }.bind(this)
    });

    panel.querySelector('#btn-add-user')?.addEventListener('click', () => this.formUser());
  },

  formUser() {
    const html = `<form id="form-user">
      ${field({ name: 'name', label: 'Name', required: true })}
      ${field({ name: 'email', label: 'Email', type: 'email', required: true })}
      ${field({ name: 'role', label: 'Role', type: 'select', required: true, options: ROLES })}
      ${field({ name: 'password', label: 'Temporary password', type: 'password', required: true })}
    </form>`;
    openModal({
      title: 'Add user',
      content: html,
      footer: `<button class="btn btn-secondary" data-modal-close>Cancel</button><button class="btn btn-primary" id="save-user">Create</button>`
    });
    document.getElementById('save-user')?.addEventListener('click', async () => {
      const form = document.getElementById('form-user');
      if (!validateRequired(form, ['name', 'email', 'role', 'password'])) return;
      try {
        if (window.RMUSANA_API_URL) {
          await api.request('/settings', { body: { module: 'settings', action: 'userCreate', ...serializeForm(form) } });
        }
        toastSuccess('User created');
        closeModal();
        this.renderPanel();
      } catch (err) {
        toastError(err.message || 'Create failed');
      }
    });
  },

  openEditUser(row) {
    const id = row.UserID || row.userId || row.id;
    const name = row.Name || row.name || '';
    const email = row.Email || row.email || '';
    const role = row.Role || row.role || 'Viewer';
    const active = row.Active === true || row.Active === 'TRUE' || row.Active === 'Yes';
    openModal({
      title: 'Edit user',
      content: `
        <form id="form-edit-user">
          ${field({ name: 'name', label: 'Display name', value: name, required: true })}
          ${field({ name: 'email', label: 'Email (login)', type: 'email', value: email, required: true })}
          ${field({ name: 'role', label: 'Role', type: 'select', required: true, value: role, options: ROLES })}
          <div class="form-group">
            <label class="form-label" style="display:flex;align-items:center;gap:var(--space-2)">
              <input type="checkbox" name="active" ${active ? 'checked' : ''} />
              Active account
            </label>
          </div>
          ${field({ name: 'password', label: 'New password (optional)', type: 'password', hint: 'Leave blank to keep the current password. Minimum 6 characters if set.' })}
        </form>
      `,
      footer: `
        <button type="button" class="btn btn-secondary" data-modal-close>Cancel</button>
        <button type="button" class="btn btn-primary" id="btn-save-user">Save changes</button>
      `
    });
    document.getElementById('btn-save-user')?.addEventListener('click', async () => {
      const form = document.getElementById('form-edit-user');
      if (!validateRequired(form, ['name', 'email', 'role'])) return;
      const data = serializeForm(form);
      const activeChecked = form.querySelector('[name="active"]')?.checked;
      if (data.password && String(data.password).length > 0 && String(data.password).length < 6) {
        toastError('Password must be at least 6 characters');
        return;
      }
      const btn = document.getElementById('btn-save-user');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
      try {
        await api.request('/settings', {
          body: {
            module: 'settings',
            action: 'userUpdate',
            userId: id,
            name: data.name,
            email: data.email,
            role: data.role,
            active: !!activeChecked,
            password: data.password || undefined
          }
        });
        toastSuccess('User updated');
        closeModal();
        this.renderPanel();
      } catch (err) {
        if (btn) { btn.disabled = false; btn.textContent = 'Save changes'; }
        toastError(err.message || 'Update failed');
      }
    });
  },

  panelNotifications(panel) {
    const s = this.settings;
    const canEdit = canApprove();
    panel.innerHTML = `
      <h3 style="margin-bottom:var(--space-4)">Notification settings</h3>
      <p class="u-text-sm u-text-secondary" style="margin-bottom:var(--space-4)">
        Use your own email here while testing. Critical alerts are sent to these addresses via Gmail (Apps Script).
      </p>
      <form id="form-notif">
        ${field({ name: 'alert_emails', label: 'Alert email recipients', value: s.alert_emails || '', hint: 'Comma-separated — put your personal email to test' })}
        <div class="form-group">
          <label class="form-label" style="display:flex;align-items:center;gap:var(--space-2)">
            <input type="checkbox" name="email_critical" ${s.email_critical !== false ? 'checked' : ''} />
            Email on Critical alerts
          </label>
        </div>
        <div class="form-group">
          <label class="form-label" style="display:flex;align-items:center;gap:var(--space-2)">
            <input type="checkbox" name="email_digest" ${s.email_digest ? 'checked' : ''} />
            Weekly executive digest
          </label>
        </div>
        ${field({ name: 'statement_due_day', label: 'Statement due day', type: 'number', value: String(s.statement_due_day || 10) })}
        ${canEdit ? `<button type="submit" class="btn btn-primary">Save notification settings</button>` : ''}
      </form>
    `;
    if (canEdit) {
      panel.querySelector('#form-notif')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const partial = {
          alert_emails: form.alert_emails.value,
          email_critical: form.email_critical.checked,
          email_digest: form.email_digest.checked,
          statement_due_day: Number(form.statement_due_day.value)
        };
        try {
          await saveSettings(partial);
          this.settings = { ...this.settings, ...partial };
          toastSuccess('Notification settings saved');
        } catch (err) {
          toastError(err.message || 'Save failed');
        }
      });
    }
  },


  panelSecurity(panel) {
    panel.innerHTML = `
      <h3 style="margin-bottom:var(--space-4)">Change password</h3>
      <p class="u-text-sm u-text-secondary" style="margin-bottom:var(--space-4)">
        Update the password for your signed-in account. Minimum 6 characters.
      </p>
      <form id="form-password">
        ${field({ name: 'currentPassword', label: 'Current password', type: 'password', required: true })}
        ${field({ name: 'newPassword', label: 'New password', type: 'password', required: true })}
        ${field({ name: 'confirmPassword', label: 'Confirm new password', type: 'password', required: true })}
        <button type="submit" class="btn btn-primary">Update password</button>
      </form>
    `;
    panel.querySelector('#form-password')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = serializeForm(e.target);
      if (!data.currentPassword || !data.newPassword) {
        toastError('Fill all fields');
        return;
      }
      if (data.newPassword !== data.confirmPassword) {
        toastError('New passwords do not match');
        return;
      }
      if (String(data.newPassword).length < 6) {
        toastError('Password must be at least 6 characters');
        return;
      }
      try {
        if (window.RMUSANA_API_URL) {
          await api.request('/auth', {
            body: {
              module: 'auth',
              action: 'changePassword',
              currentPassword: data.currentPassword,
              newPassword: data.newPassword
            }
          });
        } else {
          toastError('Connect the API to change password on the server');
          return;
        }
        toastSuccess('Password updated');
        e.target.reset();
      } catch (err) {
        toastError(err.message || 'Password change failed');
      }
    });
  },
  panelSystem(panel) {
    const theme = getState('theme') || 'light';
    panel.innerHTML = `
      <h3 style="margin-bottom:var(--space-4)">System preferences</h3>
      <div class="form-group">
        <label class="form-label">Theme</label>
        <div style="display:flex;gap:var(--space-2)">
          <button class="btn btn-sm ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}" id="theme-light">Light</button>
          <button class="btn btn-sm ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}" id="theme-dark">Dark</button>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Currency</label>
        <input class="form-input" value="UGX" disabled />
      </div>
      <p class="u-text-xs u-text-muted">API URL is set via <code>window.RMUSANA_API_URL</code> at deploy time. Google Client ID via <code>window.RMUSANA_GOOGLE_CLIENT_ID</code>.</p>
      <p class="u-text-xs u-text-muted" style="margin-top:var(--space-2)">Signed in as: ${getState('user')?.email || '—'} (${getRole() || '—'})</p>
    `;
    panel.querySelector('#theme-light')?.addEventListener('click', () => {
      setState({ theme: 'light' });
      this.renderPanel();
    });
    panel.querySelector('#theme-dark')?.addEventListener('click', () => {
      setState({ theme: 'dark' });
      this.renderPanel();
    });
  },

  panelBackup(panel) {
    panel.innerHTML = `
      <h3 style="margin-bottom:var(--space-4)">Backup & restore</h3>
      <p class="u-text-sm u-text-secondary" style="margin-bottom:var(--space-4)">
        Export all project sheets to JSON (stored on Drive when configured). Restore replaces sheet data.
      </p>
      <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
        <button class="btn btn-primary" id="btn-backup">Create backup</button>
        <button class="btn btn-secondary" id="btn-export-local">Export local data</button>
        <label class="btn btn-secondary" style="cursor:pointer">
          Import local JSON
          <input type="file" id="import-file" accept="application/json" hidden />
        </label>
      </div>
      <pre id="backup-result" class="u-text-xs u-text-muted" style="margin-top:var(--space-4);white-space:pre-wrap"></pre>
    `;

    panel.querySelector('#btn-backup')?.addEventListener('click', async () => {
      try {
        if (window.RMUSANA_API_URL) {
          const res = await api.request('/settings', { body: { module: 'settings', action: 'backup' } });
          panel.querySelector('#backup-result').textContent = JSON.stringify(res.data, null, 2);
          toastSuccess('Backup created');
        } else {
          toastError('Apps Script required for full sheet backup');
        }
      } catch (err) {
        toastError(err.message || 'Backup failed');
      }
    });

    panel.querySelector('#btn-export-local')?.addEventListener('click', () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        local: {}
      };
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('rmusana_')) {
          try { payload.local[k] = JSON.parse(localStorage.getItem(k)); }
          catch { payload.local[k] = localStorage.getItem(k); }
        }
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'rmusana_local_backup_' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      toastSuccess('Local backup downloaded');
    });

    panel.querySelector('#import-file')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        if (payload.local) {
          const ok = await confirmDialog({
            title: 'Import local data',
            message: 'This will overwrite local RMUSANA data in this browser. Continue?',
            confirmLabel: 'Import',
            danger: true
          });
          if (!ok) return;
          Object.keys(payload.local).forEach((k) => {
            localStorage.setItem(k, JSON.stringify(payload.local[k]));
          });
          toastSuccess('Local data imported');
        } else if (payload.sheets && window.RMUSANA_API_URL) {
          await api.request('/settings', { body: { module: 'settings', action: 'restore', payload } });
          toastSuccess('Sheet restore submitted');
        } else {
          toastError('Unrecognized backup format');
        }
      } catch (err) {
        toastError(err.message || 'Import failed');
      }
    });
  },

  destroy() {}
};
