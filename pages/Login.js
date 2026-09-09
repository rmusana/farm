/**
 * Login page – email + password
 */
import { loginWithCredentials } from '../js/auth.js';
import { navigate } from '../js/router.js';
import { toastError, toastSuccess } from '../components/Toast.js';

export default {
  async render(root) {
    root.innerHTML = `
      <div class="login-page">
        <div class="login-card card">
          <div class="login-brand">
            <div class="sidebar-brand-mark" style="width:48px;height:48px;font-size:18px">L5</div>
            <h1>LUK54</h1>
            <p class="u-text-secondary u-text-sm">Sign in to continue</p>
          </div>

          <form id="login-form" class="login-form" novalidate>
            <div class="form-group">
              <label class="form-label" for="field-email">Email</label>
              <input class="form-input" type="email" name="email" id="field-email" placeholder="you@example.com" required autocomplete="username" />
              <div class="form-error" data-error-for="email" hidden></div>
            </div>
            <div class="form-group">
              <label class="form-label" for="field-password">Password</label>
              <input class="form-input" type="password" name="password" id="field-password" placeholder="••••••••" required autocomplete="current-password" />
              <div class="form-error" data-error-for="password" hidden></div>
            </div>
            <button type="submit" class="btn btn-primary u-w-full" id="login-submit">
              Sign in
            </button>
          </form>
        </div>
      </div>
    `;

    const form = root.querySelector('#login-form');
    const submitBtn = root.querySelector('#login-submit');

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
