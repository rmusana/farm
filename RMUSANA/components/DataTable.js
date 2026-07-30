/**
 * Reusable data table
 */
export function renderDataTable(container, { columns, rows, emptyMessage = 'No records found.', onRowAction }) {
  if (!container) return;

  if (!rows || rows.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-state-title">${emptyMessage}</p>
      </div>`;
    return;
  }

  const thead = columns.map((c) => `<th style="${c.align === 'right' ? 'text-align:right' : ''}">${c.label}</th>`).join('');
  const tbody = rows.map((row, idx) => {
    const cells = columns.map((c) => {
      let val = typeof c.accessor === 'function' ? c.accessor(row) : row[c.key];
      if (c.render) val = c.render(val, row);
      return `<td style="${c.align === 'right' ? 'text-align:right' : ''}">${val ?? '—'}</td>`;
    }).join('');
    return `<tr data-row="${idx}">${cells}</tr>`;
  }).join('');

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;

  if (onRowAction) {
    container.querySelectorAll('tbody tr').forEach((tr) => {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        const idx = Number(tr.dataset.row);
        onRowAction(rows[idx], idx);
      });
    });
  }
}

export default { renderDataTable };
