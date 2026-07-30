/**
 * Form helpers and field builders
 */
export function field(opts) {
  const {
    name,
    label,
    type = 'text',
    required = false,
    placeholder = '',
    value = '',
    options = [],
    hint = '',
    rows = 3
  } = opts;

  const req = required ? '<span class="required">*</span>' : '';
  let control = '';

  if (type === 'select') {
    control = `
      <select class="form-select" name="${name}" id="field-${name}" ${required ? 'required' : ''}>
        <option value="">Select…</option>
        ${options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${l}</option>`;
        }).join('')}
      </select>`;
  } else if (type === 'textarea') {
    control = `<textarea class="form-textarea" name="${name}" id="field-${name}" rows="${rows}" placeholder="${placeholder}" ${required ? 'required' : ''}>${value}</textarea>`;
  } else {
    control = `<input class="form-input" type="${type}" name="${name}" id="field-${name}" value="${value}" placeholder="${placeholder}" ${required ? 'required' : ''} />`;
  }

  return `
    <div class="form-group">
      <label class="form-label" for="field-${name}">${label}${req}</label>
      ${control}
      ${hint ? `<div class="form-hint">${hint}</div>` : ''}
      <div class="form-error" data-error-for="${name}" hidden></div>
    </div>
  `;
}

export function serializeForm(formEl) {
  const data = {};
  const fd = new FormData(formEl);
  for (const [k, v] of fd.entries()) {
    data[k] = v;
  }
  return data;
}

export function showFieldError(formEl, name, message) {
  const err = formEl.querySelector(`[data-error-for="${name}"]`);
  if (err) {
    err.textContent = message;
    err.hidden = !message;
  }
  const input = formEl.querySelector(`[name="${name}"]`);
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

export function clearErrors(formEl) {
  formEl.querySelectorAll('[data-error-for]').forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
}

export function validateRequired(formEl, fields) {
  clearErrors(formEl);
  let ok = true;
  fields.forEach((name) => {
    const input = formEl.querySelector(`[name="${name}"]`);
    if (!input) return;
    const val = (input.value || '').trim();
    if (!val) {
      showFieldError(formEl, name, 'This field is required');
      ok = false;
    }
  });
  return ok;
}

export default { field, serializeForm, showFieldError, clearErrors, validateRequired };
