/**
 * Toast notification system
 */
let root = null;

export function initToasts() {
  root = document.getElementById('toast-root');
}

export function toast({ title, message, type = 'info', duration = 4000 }) {
  if (!root) root = document.getElementById('toast-root');
  if (!root) return;

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="toast-content">
      ${title ? `<div class="toast-title">${title}</div>` : ''}
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button class="icon-btn" style="width:28px;height:28px" aria-label="Dismiss">
      <i data-lucide="x" style="width:14px;height:14px"></i>
    </button>
  `;

  const dismiss = () => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 200);
  };

  el.querySelector('button')?.addEventListener('click', dismiss);
  root.appendChild(el);
  if (window.lucide) window.lucide.createIcons({ nodes: [el] });

  if (duration > 0) setTimeout(dismiss, duration);
}

export function toastSuccess(message, title = 'Success') {
  toast({ title, message, type: 'success' });
}

export function toastError(message, title = 'Error') {
  toast({ title, message, type: 'error', duration: 6000 });
}

export function toastWarning(message, title = 'Warning') {
  toast({ title, message, type: 'warning' });
}

export function toastInfo(message, title = 'Info') {
  toast({ title, message, type: 'info' });
}

export default { initToasts, toast, toastSuccess, toastError, toastWarning, toastInfo };
