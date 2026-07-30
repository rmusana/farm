# RMUSANA — Deployment Guide

## 1. Google Sheet setup

1. Create a Google Spreadsheet named `RMUSANA LUK54`.
2. Note the Spreadsheet ID from the URL (`/d/SPREADSHEET_ID/edit`).
3. Create a Google Drive folder `RMUSANA Documents` and note its folder ID.

### Recommended sheets (auto-created on first write)

Projects, Users, CapitalContributions, Expenses, DailyProduction, Sales, FeedInventory, FeedPurchases, HealthEvents, VaccinationSchedule, Inventory, BudgetLines, RevenueAllocation, ProfitDistributions, Alerts, Documents, StaffNotes, FlockEvents, Settings, MonthlyInvestmentStatements, AuditLog

### Seed Users

In Apps Script editor, set `SPREADSHEET_ID`, then run `setupAuth()` once to seed Users with hashed passwords.

Bootstrap accounts (before seed, plain passwords work against bootstrap list):

| Email | Password | Role |
|-------|----------|------|
| robert@luk54.com | investor2026 | Investor |
| moses@luk54.com | investor2026 | Investor |
| joseph@jalodreamfarm.com | ops2026 | OperationsManager |
| admin@rmusana.com | admin2026 | Administrator |

## 2. Apps Script deployment

1. Open [script.google.com](https://script.google.com) → New project `RMUSANA API`.
2. Copy every file from `/apps-script/` into the project (`Code.gs`, `Auth.gs`, `Dashboard.gs`, `Operations.gs`, `Finance.gs`, `Reports.gs`, `Alerts.gs`, `Drive.gs`, `Settings.gs`, `Utils.gs`).
3. In `Code.gs` set:

```javascript
var SPREADSHEET_ID = 'YOUR_SHEET_ID';
var DRIVE_ROOT_FOLDER_ID = 'YOUR_FOLDER_ID';
```

4. Deploy → New deployment → Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (or your Google Workspace domain)
5. Copy the Web App URL.

## 3. Frontend (GitHub Pages)

1. Push the `RMUSANA/` folder contents to a GitHub repository.
2. Settings → Pages → Deploy from branch `main` / root (or `/docs`).
3. Set API URL in `js/config.js`:

```javascript
window.RMUSANA_API_URL = 'https://script.google.com/macros/s/XXXX/exec';
```

4. Optional Google Sign-In:

```javascript
window.RMUSANA_GOOGLE_CLIENT_ID = 'xxxxx.apps.googleusercontent.com';
```

5. Visit `https://<user>.github.io/<repo>/`.

### Local testing without API

Open `index.html` via a static server (`npx serve`). Auth works with bootstrap accounts; data persists in `localStorage`.

## 4. Production checklist

- [ ] Spreadsheet ID and Drive folder ID set in `Code.gs`
- [ ] `setupAuth()` run; passwords hashed
- [ ] Web App deployed; URL in `config.js`
- [ ] CORS: Apps Script web apps accept POST from browser origins
- [ ] Test login as Investor and OperationsManager
- [ ] Seed budget (Finance → Budget → Seed from budget doc)
- [ ] Seed vaccination schedule (Operations → Health — auto on first schedule load)
- [ ] Projects row: ProjectID `LUK54`, StartDate `2026-06-01`, PlannedBirds `2500`
- [ ] PWA: manifest + service worker register without errors
- [ ] Dark mode toggle works
- [ ] Offline banner appears when network is cut
- [ ] Monthly Investment Statement generates and prints
- [ ] Critical alerts email recipients set in Settings
- [ ] Change default passwords after first login

## 5. Architecture reminder

```
Browser (GitHub Pages)
  → Apps Script Web App API
    → Google Sheets (data)
    → Google Drive (attachments)
    → Gmail (notifications)
```

Frontend never accesses Sheets/Drive directly.
