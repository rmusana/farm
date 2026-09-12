/**
 * Modal component
 */
let activeModal = null;

export function openModal({ title, content, footer, size = 'md', onClose }) {
  // immediate cleanup if a modal is still animating out — prevents race where old timeout wipes new modal
  if (activeModal) {
    try { activeModal.backdrop.remove(); } catch {}
    if (activeModal.esc) document.removeEventListener('keydown', activeModal.esc);
    activeModal = null;
  }
  const root = document.getElementById('modal-root');
  if (!root) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${size === 'lg' ? 'modal-lg' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 id="modal-title">${title || ''}</h2>
        <button class="icon-btn" data-modal-close aria-label="Close">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">${typeof content === 'string' ? content : ''}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
    </div>
  `;

  root.appendChild(backdrop);
  activeModal = { backdrop, onClose };

  if (typeof content !== 'string' && content instanceof HTMLElement) {
    backdrop.querySelector('.modal-body').appendChild(content);
  }

  requestAnimationFrame(() => backdrop.classList.add('open'));

  // direct buttons
  backdrop.querySelectorAll('[data-modal-close]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
    });
  });
  // delegated: handles lucide-replaced SVGs and footer buttons
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeModal();
      return;
    }
    var closer = e.target.closest && e.target.closest('[data-modal-close]');
    if (closer && backdrop.contains(closer)) {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
    }
  });

  const esc = (e) => {
    if (e.key === 'Escape') closeModal();
  };
  document.addEventListener('keydown', esc);
  activeModal.esc = esc;

  if (window.lucide) window.lucide.createIcons({ nodes: [backdrop] });
  return backdrop;
}

export function closeModal() {
  if (!activeModal) return;
  const current = activeModal;
  const { backdrop, onClose, esc } = current;
  backdrop.classList.remove('open');
  // capture current reference; only clear if still current (race-safe)
  setTimeout(() => {
    try { backdrop.remove(); } catch {}
    if (esc) document.removeEventListener('keydown', esc);
    if (typeof onClose === 'function') {
      try { onClose(); } catch {}
    }
    if (activeModal === current) activeModal = null;
  }, 220);
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const footer = `
      <button class="btn btn-secondary" data-cancel>Cancel</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${confirmLabel}</button>
    `;
    const backdrop = openModal({
      title,
      content: `<p style="color:var(--color-text-secondary)">${message}</p>`,
      footer,
      onClose: () => resolve(false)
    });
    backdrop.querySelector('[data-cancel]')?.addEventListener('click', () => {
      closeModal();
      resolve(false);
    });
    backdrop.querySelector('[data-confirm]')?.addEventListener('click', () => {
      closeModal();
      resolve(true);
    });
  });
}

export default { openModal, closeModal, confirmDialog };
