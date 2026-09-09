/**
 * Login page – Google OAuth + email session
 */
import { setState } from '../js/state.js';
import { loginWithCredentials, loginWithGoogleToken } from '../js/auth.js';
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
            <p class="u-text-secondary u-text-sm">Farm operations & investment</p>
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

          <div class="login-divider"><span>or</span></div>

          <button type="button" class="btn btn-secondary u-w-full" id="google-signin-btn">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>

          <p class="login-footnote u-text-xs u-text-muted">
            Access is restricted to authorised Investment Partner and Operating Partner accounts.
          </p>
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

    root.querySelector('#google-signin-btn')?.addEventListener('click', async () => {
      try {
        if (window.google && window.google.accounts && window.google.accounts.id) {
          // GIS one-tap / button flow – token handled by callback registered in auth.js
          window.google.accounts.id.prompt();
        } else {
          // Fallback: open OAuth popup path via Apps Script when GIS not loaded
          toastError('Google Sign-In is not configured. Use email sign-in or set GOOGLE_CLIENT_ID.');
        }
      } catch (err) {
        toastError(err.message || 'Google Sign-In failed');
      }
    });
  },
  destroy() {}
};
