/**
 * Reusable data table with optional row actions (e.g. Delete)
 */
function escapeHtml(value) {
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Reusable data table with optional row actions (e.g. Delete)
 */
export function renderDataTable(container, {
  columns,
  rows,
  emptyMessage = 'No records found.',
  onRowAction,
  actions,
  onAction
}) {
  if (!container) return;

  if (!rows || rows.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><p class="empty-state-title">' + escapeHtml(emptyMessage) + '</p></div>';
    return;
  }

  const hasActions = actions && actions.length && typeof onAction === 'function';
  const allCols = hasActions
    ? columns.concat([{ key: '_actions', label: '', align: 'right' }])
    : columns;

  const thead = allCols
    .map(function (c) {
      return (
        '<th style="' +
        (c.align === 'right' ? 'text-align:right' : '') +
        '">' +
        (c.label || '') +
        '</th>'
      );
    })
    .join('');

  const tbody = rows
    .map(function (row, idx) {
      const cells = columns
        .map(function (c) {
          let val = typeof c.accessor === 'function' ? c.accessor(row) : row[c.key];
          if (c.render) val = c.render(val, row);
          if (val == null || val === '') val = '—';
          // Only allow trusted HTML from explicit renderTrusted; otherwise escape
          const html = c.rawHtml ? String(val) : escapeHtml(val);
          return (
            '<td style="' +
            (c.align === 'right' ? 'text-align:right' : '') +
            '">' +
            html +
            '</td>'
          );
        })
        .join('');

      let actionCell = '';
      if (hasActions) {
        const btns = actions
          .map(function (a) {
            const cls = a.danger ? 'btn btn-ghost btn-sm u-text-danger' : 'btn btn-ghost btn-sm';
            return (
              '<button type="button" class="' +
              cls +
              '" data-action="' +
              a.id +
              '" data-row="' +
              idx +
              '" title="' +
              (a.label || a.id) +
              '">' +
              (a.icon
                ? '<i data-lucide="' + a.icon + '" style="width:14px;height:14px"></i> '
                : '') +
              (a.label || a.id) +
              '</button>'
            );
          })
          .join(' ');
        actionCell =
          '<td style="text-align:right;white-space:nowrap" class="table-actions">' +
          btns +
          '</td>';
      }

      return '<tr data-row="' + idx + '">' + cells + actionCell + '</tr>';
    })
    .join('');

  container.innerHTML =
    '<div class="table-wrap"><table class="data-table"><thead><tr>' +
    thead +
    '</tr></thead><tbody>' +
    tbody +
    '</tbody></table></div>';

  if (hasActions) {
    container.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const idx = Number(btn.dataset.row);
        onAction(btn.dataset.action, rows[idx], idx);
      });
    });
  }

  if (onRowAction) {
    container.querySelectorAll('tbody tr').forEach(function (tr) {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', function (e) {
        if (e.target.closest('[data-action]')) return;
        const idx = Number(tr.dataset.row);
        onRowAction(rows[idx], idx);
      });
    });
  }

  if (window.lucide) window.lucide.createIcons({ nodes: [container] });
}

export default { renderDataTable };
