/**
 * LUK54 — World-class 3D Login · farm investment platform
 * Clean, premium, farm earth tones · 3D tilt, depth, micro-interactions
 */
import { loginWithCredentials } from '../js/auth.js';
import { navigate } from '../js/router.js';
import { toastError, toastSuccess } from '../components/Toast.js';

export default {
  async render(root) {
    root.innerHTML = `
      <div class="login3d">
        <div class="login3d-bg" aria-hidden="true">
          <div class="login3d-orb login3d-orb--1"></div>
          <div class="login3d-orb login3d-orb--2"></div>
          <div class="login3d-orb login3d-orb--3"></div>
          <div class="login3d-grid"></div>
        </div>

        <div class="login3d-shell">
          <aside class="login3d-visual" aria-hidden="true">
            <div class="login3d-visual-inner">
              <div class="login3d-brand">
                <div class="login3d-logo">L</div>
                <div>
                  <div class="login3d-brand-name">LUK54</div>
                  <div class="login3d-brand-sub">Jalo Dream Farm</div>
                </div>
              </div>
              <h2 class="login3d-headline">Your flock.<br/>Your capital.<br/><span>One clear view.</span></h2>
              <p class="login3d-desc" style="opacity:0.82; max-width:28ch">Secure access for your farm operations.</p>
            </div>
          </aside>

          <section class="login3d-panel" id="login-panel">
            <div class="login3d-card" id="login-card">
              <header class="login3d-card-head">
                <h1>Welcome back</h1>
                <p>Sign in to continue to your farm</p>
              </header>

              <form id="login-form" class="login-form" novalidate>
                <div class="form-group">
                  <label class="form-label" for="field-email">Email</label>
                  <input class="form-input" type="email" name="email" id="field-email" placeholder="name@example.com" required autocomplete="username" inputmode="email" spellcheck="false" />
                  <div class="form-error" data-error-for="email" hidden></div>
                </div>
                <div class="form-group">
                  <label class="form-label" for="field-password">Password</label>
                  <div class="password-field">
                    <input class="form-input" type="password" name="password" id="field-password" placeholder="Enter your password" required autocomplete="current-password" />
                    <button type="button" class="password-toggle" id="password-toggle" aria-label="Show password"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><g id="eye-icon"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></g><path id="eye-slash" d="M3 3l18 18" hidden/></svg></button>
                  </div>
                  <div class="form-error" data-error-for="password" hidden></div>
                </div>

                <label style="display:flex;align-items:center;gap:8px; font-size:13px; color:var(--color-text-secondary); margin:2px 0 14px; cursor:pointer">
                  <input type="checkbox" id="remember-email" style="accent-color:var(--color-accent)" /> Remember email
                </label>

                <div class="form-error form-error-global" id="login-error" hidden role="alert"></div>
                <button type="submit" class="btn btn-primary login-submit" id="login-submit" style="width:100%; height:44px; font-size:15px; box-shadow:0 8px 20px rgba(26,92,62,0.18)">
                  <span class="login-submit-label">Sign in</span>
                  <span class="login-submit-spinner" hidden></span>
                </button>


              </form>

              <div class="login3d-trust">
                <span style="display:inline-flex;align-items:center;gap:5px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:block; flex-shrink:0;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Encrypted</span>
                <span>•</span><span>Role-based access</span>
              </div>

              <div id="install-wrap" style="display:none; margin-top:14px; text-align:center">
                <button class="btn btn-secondary" id="install-btn" style="width:100%; gap:8px; justify-content:center"><i data-lucide="download" style="width:14px;height:14px"></i> Install app — one tap</button>
                <div class="u-text-xs u-text-muted" style="margin-top:6px">Works offline · No store needed</div>
              </div>
            </div>

            <div style="text-align:center; margin-top:14px; font-size:12px; color:var(--color-text-muted)">Need access? Contact your administrator</div>
          </section>
        </div>
      </div>

      <style>
        .login3d{ position:relative; min-height:100dvh; background: var(--color-bg); overflow:hidden; display:flex; align-items:center; justify-content:center; padding:20px; }
        .login3d-bg{ position:absolute; inset:0; overflow:hidden; pointer-events:none; }
        .login3d-grid{ position:absolute; inset:0; background-image: linear-gradient(rgba(26,92,62,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(26,92,62,0.04) 1px, transparent 1px); background-size:32px 32px; mask-image: radial-gradient(800px 600px at 50% 20%, black, transparent 70%); }
        .login3d-orb{ position:absolute; border-radius:50%; filter: blur(18px); opacity:0.45; }
        .login3d-orb--1{ width:560px; height:560px; left:-120px; top:-120px; background: radial-gradient(circle at 30% 30%, #c8e6c9 0%, #a5d6a7 35%, transparent 70%); }
        .login3d-orb--2{ width:720px; height:720px; right:-160px; bottom:-180px; background: radial-gradient(circle at 50% 50%, #f2ede6 0%, #e8e0d6 45%, transparent 70%); }
        .login3d-orb--3{ width:420px; height:420px; left:48%; top:22%; background: radial-gradient(circle at 50% 50%, rgba(26,92,62,0.08), transparent 65%); }
        .login3d-shell{ position:relative; width:min(980px, 100%); max-height:min(640px, 92dvh); display:grid; grid-template-columns: 0.95fr 1.05fr; gap:0; background: var(--color-bg-elevated); border:1px solid var(--color-border); border-radius:20px; overflow:hidden; box-shadow: var(--shadow-lg); transform: translateZ(0); }
        .login3d-visual{ position:relative; background: linear-gradient(165deg, #0f2e22 0%, #1a5c3e 55%, #2f7d5e 100%); color:#fff; padding:28px; display:flex; flex-direction:column; overflow:hidden; }
        .login3d-visual::after{ content:""; position:absolute; right:-40px; bottom:-40px; width:320px; height:320px; background: radial-gradient(circle, rgba(255,255,255,0.08), transparent 60%); pointer-events:none; }
        .login3d-visual-inner{ position:relative; z-index:1; display:flex; flex-direction:column; height:100%; gap:14px; justify-content:center; }
        .login3d-brand{ display:flex; align-items:center; gap:12px; }
        .login3d-logo{ width:36px; height:36px; border-radius:10px; background: rgba(255,255,255,0.14); border:1px solid rgba(255,255,255,0.2); display:grid; place-items:center; font-weight:800; font-size:14px; backdrop-filter: blur(8px); }
        .login3d-brand-name{ font-weight:800; letter-spacing:-0.03em; font-size:15px; }
        .login3d-brand-sub{ font-size:11px; opacity:0.8; }
        .login3d-headline{ margin:6px 0 0; font-size:28px; line-height:1.08; letter-spacing:-0.03em; font-weight:800; }
        .login3d-headline span{ color:#c8f0d8; }
        .login3d-desc{ font-size:12px; line-height:1.5; opacity:0.82; max-width:28ch; }
        .login3d-preview{ display:grid; gap:12px; margin-top:auto; }
        .login3d-preview-card{ background: rgba(255,255,255,0.96); color:#141916; border-radius:14px; padding:14px; border:1px solid rgba(255,255,255,0.6); box-shadow: 0 12px 28px rgba(0,0,0,0.18); transform: translateZ(0); }
        .login3d-preview-card--secondary{ background: rgba(255,255,255,0.9); }
        .login3d-preview-row{ display:flex; justify-content:space-between; font-size:12px; padding:6px 0; border-bottom:1px solid #f0ebe4; }
        .login3d-preview-row:last-of-type{ border:none; }
        .login3d-preview-bar{ height:6px; background:#eee9e1; border-radius:999px; overflow:hidden; margin-top:8px; }
        .login3d-preview-bar span{ display:block; height:100%; background: var(--color-accent); border-radius:999px; }
        .login3d-preview-foot{ font-size:11px; color:var(--color-text-muted); margin-top:8px; }
        .login3d-footnote{ font-size:11px; opacity:0.7; margin-top:8px; }
        .login3d-panel{ padding:24px; display:flex; flex-direction:column; justify-content:center; background: var(--color-bg-elevated); }
        .login3d-card{ background: var(--color-bg-elevated); border-radius:16px; transform-style: preserve-3d; transition: transform 180ms ease, box-shadow 180ms ease; }
        .login3d-card-head h1{ margin:0 0 4px; font-size:20px; letter-spacing:-0.02em; }
        .login3d-card-head p{ margin:0 0 14px; color:var(--color-text-secondary); font-size:12px; }
        .login3d-trust{ display:flex; gap:8px; align-items:center; justify-content:center; margin-top:12px; font-size:11px; color:var(--color-text-muted); }
        @media (max-width: 900px){ .login3d{ padding:16px; } .login3d-shell{ grid-template-columns:1fr; max-height:none; } .login3d-visual{ min-height:auto; padding:22px; } .login3d-orb--2{ display:none; } }
        @media (max-width: 480px){ .login3d{ padding:12px; } .login3d-shell{ border-radius:16px; } .login3d-visual{ padding:18px; } .login3d-headline{ font-size:22px; } .login3d-panel{ padding:18px; } .login3d-card-head h1{ font-size:18px; } .login3d-orb--1{ display:none; } }
        @media (min-width: 1400px){ .login3d-shell{ width:min(1020px, 100%); } .login3d-visual{ padding:32px; } .login3d-headline{ font-size:30px; } }
        @media (prefers-reduced-motion: reduce){ .login3d-card{ transition:none; } }
        @media (hover: none){ .login3d-card{ transform:none !important; } }
      </style>
    `;

    const form = root.querySelector('#login-form');
    const submitBtn = root.querySelector('#login-submit');
    const labelEl = root.querySelector('.login-submit-label');
    const spinnerEl = root.querySelector('.login-submit-spinner');
    const globalError = root.querySelector('#login-error');
    const pwInput = root.querySelector('#field-password');
    const pwToggle = root.querySelector('#password-toggle');
    const card = root.querySelector('#login-card');
    const emailInput = root.querySelector('#field-email');
    const remember = root.querySelector('#remember-email');

    // 3D tilt
    if (card && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const panel = root.querySelector('#login-panel');
      panel.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `perspective(900px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateZ(0)`;
        card.style.boxShadow = `0 16px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.06)`;
      });
      panel.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(900px) rotateY(0) rotateX(0)';
      });
    }

    // remember email
    try {
      const saved = localStorage.getItem('luk54_remember_email');
      if (saved && emailInput) { emailInput.value = saved; if (remember) remember.checked = true; }
    } catch {}

    // PWA install — one tap (beforeinstallprompt)
    let deferredPrompt = null;
    const installWrap = root.querySelector('#install-wrap');
    const installBtn = root.querySelector('#install-btn');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (installWrap) installWrap.style.display = 'block';
      if (window.lucide) window.lucide.createIcons({ nodes: [installWrap] });
    });
    installBtn?.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null;
      if (installWrap) installWrap.style.display = 'none';
    });
    window.addEventListener('appinstalled', () => {
      if (installWrap) installWrap.style.display = 'none';
      deferredPrompt = null;
    });
    // iOS fallback: show if standalone already
    if (window.matchMedia('(display-mode: standalone)').matches && installWrap) {
      installWrap.style.display = 'none';
    }

    function clearErrors() {
      form.querySelectorAll('[data-error-for]').forEach((el) => { el.hidden = true; el.textContent = ''; });
      if (globalError) { globalError.hidden = true; globalError.textContent = ''; }
      form.querySelectorAll('.form-input').forEach((el) => el.classList.remove('is-invalid'));
    }
    function showFieldError(name, message) {
      const err = form.querySelector('[data-error-for="' + name + '"]');
      const input = form.querySelector('[name="' + name + '"]');
      if (err) { err.textContent = message; err.hidden = false; }
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
        const slash = pwToggle.querySelector('#eye-slash');
        if (slash) slash.hidden = !showing ? true : false;
        // single eye — just toggle slash, eye shape stays one
        const eye = pwToggle.querySelector('#eye-icon');
        if (eye) eye.style.opacity = showing ? '1' : '1';
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const email = form.email.value.trim();
      const password = form.password.value;
      let valid = true;
      if (!email) { showFieldError('email', 'Enter your email'); valid = false; }
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFieldError('email', 'Enter a valid email'); valid = false; }
      if (!password) { showFieldError('password', 'Enter your password'); valid = false; }
      if (!valid) { const first = form.querySelector('.is-invalid'); if (first) first.focus(); return; }
      // remember
      try {
        if (remember?.checked) localStorage.setItem('luk54_remember_email', email);
        else localStorage.removeItem('luk54_remember_email');
      } catch {}
      setLoading(true);
      try {
        await loginWithCredentials(email, password);
        toastSuccess('Signed in successfully');
        navigate('dashboard');
      } catch (err) {
        const msg = err.message || 'Sign in failed. Check your email and password.';
        if (globalError) { globalError.textContent = msg; globalError.hidden = false; }
        toastError(msg);
        setLoading(false);
        form.password.focus();
      }
    });
  },
  destroy() {}
};
