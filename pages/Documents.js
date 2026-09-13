/**
 * Documents module – upload, list, preview, download, link metadata
 */
import { field, serializeForm, validateRequired, setBusy } from '../components/Form.js';
import { openModal, closeModal, confirmDialog } from '../components/Modal.js';
import { toastSuccess, toastError } from '../components/Toast.js';
import { escapeHtml } from '../js/escape.js';
import { canWrite } from '../js/auth.js';
import api from '../js/api.js';

const CATEGORIES = ['General', 'Receipt', 'Invoice', 'Photo', 'Production', 'Statement', 'Contract', 'Vaccination', 'Other'];

function localStore(key, value) {
  if (value === undefined) {
    try { return JSON.parse(localStorage.getItem('rmusana_docs_' + key) || '[]'); } catch { return []; }
  }
  localStorage.setItem('rmusana_docs_' + key, JSON.stringify(value));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      const base64 = String(result).split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isImage(mime) {
  return (mime || '').startsWith('image/');
}

function isPdf(mime) {
  return mime === 'application/pdf';
}

function iconFor(mime, name) {
  if (isImage(mime)) return 'image';
  if (isPdf(mime)) return 'file-text';
  if ((name || '').match(/\.(xlsx?|csv)$/i)) return 'sheet';
  return 'file';
}

async function listDocs(category) {
  if (window.RMUSANA_API_URL) {
    const res = await api.documents.list({ category: category || undefined });
    return res.data || [];
  }
  let list = localStore('list');
  if (category && category !== 'all') {
    list = list.filter((d) => (d.ParentType || d.parentType) === category);
  }
  list.sort((a, b) => new Date(b.UploadedAt || b.uploadedAt) - new Date(a.UploadedAt || a.uploadedAt));
  return list;
}

export default {
  filter: 'all',

  async render(root) {
    this.root = root;
    const writable = canWrite('operations') || canWrite('documents');

    root.innerHTML = `
      <div class="page-header">
        <div class="page-header-title">
          <div class="breadcrumb"><span>Main</span><span>/</span><span>Documents</span></div>
          <h1>Documents</h1>
          <p class="u-text-secondary u-text-sm">Receipts, invoices, photos and supporting evidence</p>
        </div>
        <div class="page-header-actions">
          ${writable ? `<button class="btn btn-primary btn-sm" id="btn-upload"><i data-lucide="upload" style="width:14px;height:14px"></i> Upload</button>` : ''}
        </div>
      </div>

      <div class="card" style="padding:14px; margin-bottom:14px; background: linear-gradient(135deg, var(--color-bg-elevated), var(--color-bg-subtle)); border:1px solid var(--color-border); display:flex; gap:12px; align-items:center">
        <div style="width:40px;height:40px; border-radius:10px; background: var(--color-accent-soft); color:var(--color-accent); display:grid; place-items:center"><i data-lucide="folder-open" style="width:20px;height:20px"></i></div>
        <div><div style="font-weight:700; font-size:13px">Evidence — every UGX has a receipt</div><div class="u-text-xs u-text-muted">Photos, invoices, statements. Linked to daily, expense or sale.</div></div>
        <div style="margin-left:auto; font-size:11px; color:var(--color-text-muted)">Premium gallery • Hover to preview</div>
      </div>

      <style>
        #docs-grid .card{ transition: transform 160ms var(--ease-out), box-shadow 160ms; }
        #docs-grid .card:hover{ transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--color-accent); }
      </style>

      <div style="display:flex;gap:var(--space-1);flex-wrap:wrap;margin-bottom:var(--space-4)" id="doc-filters">
        <button class="btn btn-sm btn-primary" data-cat="all">All</button>
        ${CATEGORIES.map((c) => `<button class="btn btn-sm btn-ghost" data-cat="${c}">${c}</button>`).join('')}
      </div>

      <div id="docs-grid"><div class="skeleton" style="height:180px"></div></div>
    `;

    root.querySelector('#btn-upload')?.addEventListener('click', () => this.openUpload());

    root.querySelectorAll('[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.filter = btn.dataset.cat;
        root.querySelectorAll('[data-cat]').forEach((b) => {
          b.classList.toggle('btn-primary', b.dataset.cat === this.filter);
          b.classList.toggle('btn-ghost', b.dataset.cat !== this.filter);
        });
        this.load();
      });
    });

    await this.load();
    if (window.lucide) window.lucide.createIcons({ nodes: [root] });
  },

  async load() {
    const el = this.root.querySelector('#docs-grid');
    if (!el) return;
    const silent = !el.querySelector('.skeleton') && el.innerHTML.trim() !== '';
    if (!silent) el.innerHTML = `<div class="skeleton" style="height:140px"></div>`;
    const prog = silent ? document.getElementById('route-progress') : null;
    if (prog) prog.hidden = false;
    try {
      const docs = await listDocs(this.filter === 'all' ? null : this.filter);
      if (!docs.length) {
        el.innerHTML = `
          <div class="card"><div class="card-body">
            <div class="empty-state">
              <i data-lucide="folder-open" class="empty-state-icon"></i>
              <p class="empty-state-title">No documents yet</p>
              <p class="empty-state-desc">Receipts, invoices, photos and statements will appear here once uploaded.</p>
            </div>
          </div></div>`;
        if (window.lucide) window.lucide.createIcons({ nodes: [el] });
        if (prog) prog.hidden = true;
        return;
      }

      el.innerHTML = `<div class="kpi-grid">${docs.map((d) => {
        const mime = d.MimeType || d.mimeType || '';
        const name = d.FileName || d.fileName || 'File';
        const id = d.DocumentID || d.id;
        const preview = d.previewDataUrl || d.dataUrl || null;
        return `
          <div class="card" style="padding:var(--space-4);cursor:pointer" data-doc="${id}">
            <div style="display:flex;gap:var(--space-3);align-items:flex-start">
              ${preview && isImage(mime) ? `
                <img src="${preview}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:var(--radius-md);flex-shrink:0" />
              ` : `
                <div style="width:56px;height:56px;border-radius:var(--radius-md);background:var(--color-bg-subtle);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--color-text-secondary)">
                  <i data-lucide="${iconFor(mime, name)}" style="width:24px;height:24px"></i>
                </div>
              `}
              <div style="min-width:0;flex:1">
                <div class="u-font-semibold u-text-sm u-truncate">${escapeHtml(name)}</div>
                <div class="u-text-xs u-text-muted">${escapeHtml(d.ParentType || d.parentType || 'General')}</div>
                <div class="u-text-xs u-text-muted">${d.UploadedAt ? new Date(d.UploadedAt).toLocaleDateString() : ''} · ${escapeHtml(d.UploadedBy || d.uploadedBy || '')}</div>
              </div>
            </div>
          </div>`;
      }).join('')}</div>`;

      el.querySelectorAll('[data-doc]').forEach((card) => {
        card.addEventListener('click', () => this.preview(card.dataset.doc, docs));
      });
      if (window.lucide) window.lucide.createIcons({ nodes: [el] });
      if (prog) prog.hidden = true;
    } catch (err) {
      if (prog) prog.hidden = true;
      el.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${escapeHtml(err.message)}</p></div>`;
    }
  },

  openUpload() {
    const html = `
      <form id="form-upload">
        ${field({ name: 'parentType', label: 'Category', type: 'select', options: CATEGORIES, value: 'Receipt' })}
        ${field({ name: 'parentId', label: 'Linked record ID (optional)', hint: 'e.g. expense or daily log ID' })}
        <div class="form-group">
          <label class="form-label">File <span class="required">*</span></label>
          <input class="form-input" type="file" id="upload-file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv" required />
          <div class="form-hint">Images, PDF, or office documents. Max practical size depends on Apps Script limits (~5–10 MB encoded).</div>
        </div>
      </form>
    `;
    openModal({
      title: 'Upload document',
      content: html,
      footer: `<button class="btn btn-secondary" data-modal-close>Cancel</button><button class="btn btn-primary" id="save-upload">Upload</button>`
    });

    document.getElementById('save-upload')?.addEventListener('click', async () => {
      const form = document.getElementById('form-upload');
      const fileInput = document.getElementById('upload-file');
      const file = fileInput?.files?.[0];
      if (!file) {
        toastError('Select a file');
        return;
      }
      const data = serializeForm(form);
      const btn = document.getElementById('save-upload');
      btn.disabled = true;
      btn.textContent = 'Uploading…';

      try {
        const base64 = await fileToBase64(file);
        if (window.RMUSANA_API_URL) {
          await api.request('/documents', {
            body: {
              module: 'documents',
              action: 'upload',
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
              contentBase64: base64,
              parentType: data.parentType || 'General',
              parentId: data.parentId || ''
            }
          });
        } else {
          const list = localStore('list');
          const id = 'local_doc_' + Date.now();
          // Keep offline copies small: previews for images only, capped at ~500KB.
          // Full file bytes always go to Drive once the API is configured.
          const approxBytes = Math.floor(base64.length * 0.75);
          const dataUrl = (isImage(file.type) && approxBytes <= 500000)
            ? `data:${file.type};base64,${base64}`
            : null;
          list.unshift({
            DocumentID: id,
            FileName: file.name,
            MimeType: file.type,
            ParentType: data.parentType || 'General',
            ParentID: data.parentId || '',
            UploadedAt: new Date().toISOString(),
            UploadedBy: 'local',
            previewDataUrl: dataUrl,
            dataUrl: dataUrl
          });
          try {
            localStore('list', list);
          } catch (e) {
            list.shift();
            throw new Error('File too large to keep offline — connect the API to upload to Drive.');
          }
        }
        toastSuccess('Document uploaded');
        closeModal();
        this.load();
      } catch (err) {
        toastError(err.message || 'Upload failed');
        btn.disabled = false;
        btn.textContent = 'Upload';
      }
    });
  },

  async preview(id, docs) {
    let doc = (docs || []).find((d) => (d.DocumentID || d.id) === id);
    if (!doc && window.RMUSANA_API_URL) {
      try {
        const res = await api.request('/documents', { body: { module: 'documents', action: 'get', documentId: id } });
        doc = res.data;
      } catch (e) {}
    }
    if (!doc) {
      toastError('Document not found');
      return;
    }

    const mime = doc.MimeType || doc.mimeType || '';
    const name = doc.FileName || doc.fileName || 'Document';
    const url = doc.url || doc.previewDataUrl || doc.dataUrl || null;
    // Only render http(s) links and image/pdf data URLs — blocks javascript: schemes
    const safeUrl = url && /^(https?:|data:image\/|data:application\/pdf)/i.test(url) ? url : null;

    let body = `
      <p class="u-text-sm u-text-secondary" style="margin-bottom:var(--space-3)">
        <span class="badge badge-neutral">${escapeHtml(doc.ParentType || 'General')}</span>
        ${doc.UploadedAt ? ' · ' + new Date(doc.UploadedAt).toLocaleString() : ''}
        ${doc.UploadedBy ? ' · ' + escapeHtml(doc.UploadedBy) : ''}
      </p>`;

    if (safeUrl && isImage(mime)) {
      body += `<img src="${safeUrl}" alt="${escapeHtml(name)}" style="max-width:100%;border-radius:var(--radius-md);margin-bottom:var(--space-3)" />`;
    } else if (safeUrl && isPdf(mime)) {
      body += `<iframe src="${safeUrl}" style="width:100%;height:360px;border:1px solid var(--color-border);border-radius:var(--radius-md)"></iframe>`;
    } else if (safeUrl) {
      body += `<p class="u-text-sm"><a href="${safeUrl}" target="_blank" rel="noopener">Open / download file</a></p>`;
    } else if (doc.DriveFileID) {
      body += `<p class="u-text-sm"><a href="https://drive.google.com/file/d/${escapeHtml(doc.DriveFileID)}/view" target="_blank" rel="noopener">Open file</a></p>`;
    } else {
      body += `<p class="u-text-sm u-text-muted">Preview not available offline for this file type. Re-upload after connecting Apps Script + Drive.</p>`;
    }

    const footer = `
      ${safeUrl ? `<a class="btn btn-secondary" href="${safeUrl}" download="${escapeHtml(name)}" target="_blank">Download</a>` : ''}
      ${canWrite('operations') ? `<button class="btn btn-danger" id="btn-del-doc">Delete</button>` : ''}
      <button class="btn btn-primary" data-modal-close>Close</button>
    `;

    openModal({ title: name, content: body, footer, size: 'lg' });

    document.getElementById('btn-del-doc')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      const ok = await confirmDialog({
        title: 'Delete document',
        message: 'Delete this document? This cannot be undone.',
        confirmLabel: 'Delete',
        danger: true
      });
      if (!ok) return;
      setBusy(btn, true, 'Deleting…');
      try {
        if (window.RMUSANA_API_URL) {
          await api.request('/documents', { body: { module: 'documents', action: 'delete', documentId: id } });
        } else {
          localStore('list', localStore('list').filter((d) => (d.DocumentID || d.id) !== id));
        }
        toastSuccess('Document deleted');
        closeModal();
        this.load();
      } catch (err) {
        setBusy(btn, false, null, 'Delete');
        toastError(err.message || 'Delete failed');
      }
    });
  },

  destroy() {}
};
