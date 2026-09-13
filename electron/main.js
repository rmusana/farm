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
  // Note: service workers don't run on file:// — the wrapper still works
  // offline because it loads the bundled files directly from disk.
  win.loadFile(path.join(__dirname, '../index.html')).catch(()=> win.loadURL('https://rmusana.github.io/farm/'));
}
app.whenReady().then(createWindow);
app.on('activate', ()=> { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', ()=> { if(process.platform!=='darwin') app.quit(); });
