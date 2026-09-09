/**
 * Login – split screen (image + form panel)
 */
import { loginWithCredentials } from '../js/auth.js';
import { navigate } from '../js/router.js';
import { toastError, toastSuccess } from '../components/Toast.js';

export default {
  async render(root) {
    root.innerHTML = `
      <div class="login-page">
        <aside class="login-visual" aria-hidden="true">
          <div class="login-visual-overlay"></div>
          <div class="login-visual-content">
            <div class="login-visual-mark">L5</div>
            <p class="login-visual-title">LUK54</p>
            <p class="login-visual-tagline">See the flock. Know the numbers.</p>
          </div>
        </aside>
        <section class="login-panel">
          <div class="login-panel-inner">
            <div class="login-brand">
              <div class="sidebar-brand-mark login-panel-mark">L5</div>
              <h1>Welcome back</h1>
              <p class="u-text-secondary u-text-sm">Sign in with your email</p>
            </div>
            <form id="login-form" class="login-form" novalidate>
              <div class="form-group">
                <label class="form-label" for="field-email">Email</label>
                <input class="form-input" type="email" name="email" id="field-email" placeholder="you@example.com" required autocomplete="username" />
                <div class="form-error" data-error-for="email" hidden></div>
              </div>
              <div class="form-group">
                <label class="form-label" for="field-password">Password</label>
                <div class="password-field">
                  <input class="form-input" type="password" name="password" id="field-password" placeholder="••••••••" required autocomplete="current-password" />
                  <button type="button" class="password-toggle" id="password-toggle" aria-label="Show password" title="Show password">
                    <svg class="eye-open" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg class="eye-closed" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" hidden><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  </button>
                </div>
                <div class="form-error" data-error-for="password" hidden></div>
              </div>
              <button type="submit" class="btn btn-primary u-w-full" id="login-submit">
                Sign in
              </button>
            </form>
          </div>
        </section>
      </div>
    `;

    const form = root.querySelector('#login-form');
    const submitBtn = root.querySelector('#login-submit');
    const pwInput = root.querySelector('#field-password');
    const pwToggle = root.querySelector('#password-toggle');

    if (pwToggle && pwInput) {
      pwToggle.addEventListener('click', () => {
        const showing = pwInput.type === 'text';
        pwInput.type = showing ? 'password' : 'text';
        pwToggle.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
        pwToggle.setAttribute('title', showing ? 'Show password' : 'Hide password');
        const open = pwToggle.querySelector('.eye-open');
        const closed = pwToggle.querySelector('.eye-closed');
        if (open && closed) {
          open.hidden = !showing;
          closed.hidden = showing;
        }
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      const password = form.password.value;

      form.querySelectorAll('[data-error-for]').forEach((el) => { el.hidden = true; });

      if (!email) {
        const err = form.querySelector('[data-error-for="email"]');
        err.textContent = 'Email is required';
        err.hidden = false;
        return;
      }
      if (!password) {
        const err = form.querySelector('[data-error-for="password"]');
        err.textContent = 'Password is required';
        err.hidden = false;
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in…';

      try {
        await loginWithCredentials(email, password);
        toastSuccess('Welcome back');
        navigate('dashboard');
      } catch (err) {
        toastError(err.message || 'Sign in failed');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign in';
      }
    });
  },
  destroy() {}
};
