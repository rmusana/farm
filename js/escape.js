/**
 * Shared HTML-escaping helper (XSS boundary for innerHTML sinks).
 */
export function escapeHtml(value) {
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default { escapeHtml };
