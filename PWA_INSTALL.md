# LUK54 — Free App for Desktop & Mobile (no store)

## 1) Icons + Cache (done)
- `assets/icons/icon-192.png` (192) + `icon-512.png` (512) + `apple-touch-icon.png` generated from #1a5c3e "54"
- `manifest.json` references them, `sw.js` CACHE v1.2.0 includes them + prompts Update on next push

## 2) One-tap Install (done in Login)
- `pages/Login.js` adds `beforeinstallprompt` → shows **Install app — one tap** button in the 3D card
- Click → native install prompt → appears as app icon, standalone, offline via `sw.js`

## 3) Free wrappers (no store)

### Android APK (free, no Play Store)
1. Go to https://www.pwabuilder.com
2. Enter `https://rmusana.github.io/farm` → Analyze → **Package for Stores → Android**
3. Download `.apk` → share via WhatsApp/Drive → users tap to install (enable "Install unknown apps")
4. No fee, no review

### Desktop (free, no store)
**Option A — Electron (instant)**
```bash
cd electron
npm install
npm start        # run desktop app locally (loads local index.html, falls back to live)
npm run build    # builds .exe / .dmg / .AppImage in dist/ — share freely
```

**Option B — Tauri (lighter)**
```bash
npm create tauri-app@latest luk54 -- --template vanilla
# point frontendDist to ../ (or ../index.html) and devUrl to https://rmusana.github.io/farm
```

Users can also install directly from browser: Desktop Chrome/Edge → address bar → Install icon.

## Test installability
- Chrome DevTools → Application → Manifest (should show icons, no errors)
- Lighthouse → PWA → Installable ✓
- Hard refresh after deploy to update `sw.js v1.2.0`
