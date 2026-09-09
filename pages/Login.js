/**
 * LUK54 Login — split screen, warm-white panel, premium product shell
 */
import { loginWithCredentials } from '../js/auth.js';
import { navigate } from '../js/router.js';
import { toastError, toastSuccess } from '../components/Toast.js';

export default {
  async render(root) {
    root.innerHTML = `
      <div class="login-page">
        <aside class="login-visual" aria-hidden="true">
          <div class="login-visual-shade"></div>
          <div class="login-visual-content">
            <p class="login-brand-name">LUK54</p>
            <p class="login-brand-sub">Jalo Dream Farm</p>
            <p class="login-brand-desc">Investment &amp; Farm Operations Platform</p>
          </div>
        </aside>

        <section class="login-panel">
          <div class="login-panel-inner">
            <header class="login-header">
              <h1 class="login-title">Welcome back</h1>
              <p class="login-subtitle">Sign in to your account to continue</p>
            </header>

            <form id="login-form" class="login-form" novalidate>
              <div class="form-group">
                <label class="form-label" for="field-email">Email</label>
                <input
                  class="form-input"
                  type="email"
                  name="email"
                  id="field-email"
                  placeholder="name@example.com"
                  required
                  autocomplete="username"
                  inputmode="email"
                  spellcheck="false"
                />
                <div class="form-error" data-error-for="email" hidden></div>
              </div>

              <div class="form-group">
                <label class="form-label" for="field-password">Password</label>
                <div class="password-field">
                  <input
                    class="form-input"
                    type="password"
                    name="password"
                    id="field-password"
                    placeholder="Enter your password"
                    required
                    autocomplete="current-password"
                  />
                  <button
                    type="button"
                    class="password-toggle"
                    id="password-toggle"
                    aria-label="Show password"
                    title="Show password"
                  >
                    <svg class="eye-open" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    <svg class="eye-closed" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" hidden>
                      <path d="M3 3l18 18"/>
                      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/>
                      <path d="M9.9 4.2A10.3 10.3 0 0 1 12 4c6.5 0 10 8 10 8a17.9 17.9 0 0 1-2.2 3.2"/>
                      <path d="M6.1 6.1C3.9 7.7 2 12 2 12s3.5 7 10 7a10.4 10.4 0 0 0 4.2-.9"/>
                    </svg>
                  </button>
                </div>
                <div class="form-error" data-error-for="password" hidden></div>
              </div>

              <div class="form-error form-error-global" id="login-error" hidden role="alert"></div>

              <button type="submit" class="btn btn-primary login-submit" id="login-submit">
                <span class="login-submit-label">Sign in</span>
                <span class="login-submit-spinner" hidden aria-hidden="true"></span>
              </button>
            </form>

            <p class="login-secure">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Authorized users only · Secure access
            </p>
          </div>
        </section>
      </div>
    `;

    const form = root.querySelector('#login-form');
    const submitBtn = root.querySelector('#login-submit');
    const labelEl = root.querySelector('.login-submit-label');
    const spinnerEl = root.querySelector('.login-submit-spinner');
    const globalError = root.querySelector('#login-error');
    const pwInput = root.querySelector('#field-password');
    const pwToggle = root.querySelector('#password-toggle');

    function clearErrors() {
      form.querySelectorAll('[data-error-for]').forEach((el) => {
        el.hidden = true;
        el.textContent = '';
      });
      if (globalError) {
        globalError.hidden = true;
        globalError.textContent = '';
      }
      form.querySelectorAll('.form-input').forEach((el) => el.classList.remove('is-invalid'));
    }

    function showFieldError(name, message) {
      const err = form.querySelector('[data-error-for="' + name + '"]');
      const input = form.querySelector('[name="' + name + '"]');
      if (err) {
        err.textContent = message;
        err.hidden = false;
      }
      if (input) input.classList.add('is-invalid');
    }

    function setLoading(loading) {
      submitBtn.disabled = loading;
      submitBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
      if (labelEl) labelEl.textContent = loading ? 'Signing in…' : 'Sign in';
      if (spinnerEl) spinnerEl.hidden = !loading;
    }

    if (pwToggle && pwInput) {
      pwToggle.addEventListener('click', () => {
        const showing = pwInput.type === 'text';
        pwInput.type = showing ? 'password' : 'text';
        pwToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        pwToggle.setAttribute('title', showing ? 'Show password' : 'Hide password');
        const open = pwToggle.querySelector('.eye-open');
        const closed = pwToggle.querySelector('.eye-closed');
        if (open) open.hidden = !showing;
        if (closed) closed.hidden = showing;
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();

      const email = form.email.value.trim();
      const password = form.password.value;
      let valid = true;

      if (!email) {
        showFieldError('email', 'Enter your email address');
        valid = false;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showFieldError('email', 'Enter a valid email address');
        valid = false;
      }
      if (!password) {
        showFieldError('password', 'Enter your password');
        valid = false;
      }
      if (!valid) {
        const first = form.querySelector('.is-invalid');
        if (first) first.focus();
        return;
      }

      setLoading(true);
      try {
        await loginWithCredentials(email, password);
        toastSuccess('Signed in successfully');
        navigate('dashboard');
      } catch (err) {
        const msg = err.message || 'Sign in failed. Check your email and password.';
        if (globalError) {
          globalError.textContent = msg;
          globalError.hidden = false;
        }
        toastError(msg);
        setLoading(false);
        form.password.focus();
      }
    });
  },
  destroy() {}
};
