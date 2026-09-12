const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow(){
  const win = new BrowserWindow({
    width: 1280, height: 800,
    icon: path.join(__dirname, '../assets/icons/icon-512.png'),
    title: "LUK54 — Jalo Dream Farm",
    backgroundColor: "#faf8f5",
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });
  // Load local PWA (offline) or live GitHub Pages
  const local = `file://${path.join(__dirname, '../index.html')}`;
  // Prefer local for offline; fallback to live if not found
  win.loadURL(local).catch(()=> win.loadURL('https://rmusana.github.io/farm/'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', ()=> { if(process.platform!=='darwin') app.quit(); });
