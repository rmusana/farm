document.addEventListener('DOMContentLoaded', function () {
  try {
    document.querySelectorAll('.data-table').forEach(function (table) {
      const ths = Array.from(table.querySelectorAll('thead th')).map(function (th) {
        return th.textContent.trim();
      });
      if (!ths.length) return;
      table.querySelectorAll('tbody tr').forEach(function (row) {
        row.querySelectorAll('td').forEach(function (td, i) {
          if (!td.hasAttribute('data-label')) td.setAttribute('data-label', ths[i] || '');
        });
      });
      table.classList.add('stackable');
    });
  } catch (e) {
    // fail silently
    console.error('responsive-tables error', e);
  }
});
