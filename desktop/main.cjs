// Desktop (Windows) shell for The Training Grounds.
// Serves the built web app from ./web over a private app:// origin so its absolute
// asset paths work and saved tracks (localStorage) persist between launches.
const { app, BrowserWindow, protocol, net, shell, Menu, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WEB_ROOT = path.join(__dirname, 'web');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#070a12',
    title: 'Training Grounds',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Links to other sites open in the normal browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL('app://local/index.html');

  // Self-check used during development: TG_SMOKE=<png path> saves a screenshot and quits
  if (process.env.TG_SMOKE) {
    win.webContents.on('console-message', (e) => {
      if (e.level === 'error') console.log('[page error]', e.message);
    });
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const info = await win.webContents.executeJavaScript(
          "({ title: document.title, rendered: document.getElementById('root').children.length > 0, header: document.body.innerText.slice(0, 80) })"
        );
        console.log('[smoke]', JSON.stringify(info));
        const img = await win.webContents.capturePage();
        require('node:fs').writeFileSync(process.env.TG_SMOKE, img.toPNG());
        app.quit();
      }, 4000);
    });
  }
}

// Single window: a second launch focuses the existing one
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    // Early builds registered a service worker that can't load app:// files; clear it
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers'] }).catch(() => {});
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url);
      let rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.normalize(path.join(WEB_ROOT, rel));
      // Never serve anything outside the bundled web folder
      if (!file.startsWith(WEB_ROOT)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
