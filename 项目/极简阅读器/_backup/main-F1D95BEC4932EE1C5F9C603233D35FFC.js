'use strict';

/* 极致阅读器 —— Electron 主进程
   Electron 22.3.27：最后一个还支持 Windows 7/8 的版本（Chromium 102）。
   页面走自定义协议 app:// 而不是 file://：
   - app:// 是安全上下文，浏览器才会给出"记住上次目录"那套文件选择器能力；
   - standard:true 让 localStorage / IndexedDB 能正常持久化（阅读进度、笔记草稿）。 */

const { app, BrowserWindow, protocol, screen, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
      stream: true
    }
  }
]);

/* ---- 笔记保存：原生通道 ----
   File System Access 的权限在 Electron 里跨会话留不住，页面每次保存都要重新选目录、
   还要再授权一次（两次弹框）。这里改成主进程用 fs 直接写：文件夹路径存在 userData 里，
   选过一次就一直有效，之后保存完全静默。 */

function cfgPath() {
  return path.join(app.getPath('userData'), 'note-dir.json');
}

function readCfg() {
  try { return JSON.parse(fs.readFileSync(cfgPath(), 'utf8')) || {}; }
  catch (e) { return {}; }
}
function writeCfg(cfg) {
  try {
    fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
    fs.writeFileSync(cfgPath(), JSON.stringify(cfg || {}), 'utf8');
  } catch (e) {}
}
function safeName(n) {
  return String(n || 'notes').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
}

function logLine(msg) {
  try {
    fs.appendFileSync(path.join(path.dirname(cfgPath()), 'app-log.txt'),
      new Date().toISOString() + '  ' + msg + '\r\n', 'utf8');
  } catch (e) {}
}

// 建议目录：文档\极简阅读器笔记（弹框时预先停在这里，用户想换就换）
function defaultDir() {
  const base = app.getPath('documents') || app.getPath('home') || '.';
  return path.join(base, '\u6781\u7B80\u9605\u8BFB\u5668\u7B14\u8BB0');
}

/* 规则（v1.2）：
   - 记住的目录里已经存在「书名.md」：直接覆盖，一声不吭；
   - 目录里找不到这个文件（这本书头一次存，或者目录换过/选错了）：弹一次系统保存框，
     默认停在记住的目录；压根没记住过就停在建议目录「文档\极简阅读器笔记」；
   - 用户选完位置，把所在文件夹记下来，这本书以后都走静默覆盖。 */

ipcMain.handle('note:getDir', function () {
  const cfg = readCfg();
  const d = (cfg.dir && fs.existsSync(cfg.dir)) ? cfg.dir : '';
  logLine('note:getDir  dir=' + (d || '(none)') + '  suggest=' + defaultDir());
  return { dir: d, suggest: defaultDir() };
});

ipcMain.handle('note:clearDir', function () {
  const c = readCfg();
  delete c.dir;
  writeCfg(c);
  logLine('note:clearDir');
  return { ok: true };
});

ipcMain.handle('note:pickDir', async function () {
  const r = await dialog.showOpenDialog(win || undefined, {
    title: '选择笔记保存文件夹',
    defaultPath: readCfg().dir || defaultDir(),
    properties: ['openDirectory', 'createDirectory']
  });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) { logLine('note:pickDir canceled'); return { ok: false }; }
  const c = readCfg();
  c.dir = r.filePaths[0];                              // 只改笔记目录，别把 bookDir 冲掉
  writeCfg(c);
  logLine('note:pickDir -> ' + c.dir);
  return { ok: true, dir: c.dir };
});

ipcMain.handle('note:save', async function (e, p) {
  const name = safeName(p && p.name);
  const text = '\ufeff' + String((p && p.text) || '');   // BOM：记事本也按 UTF-8 打开
  const cfg = readCfg();
  const remembered = (cfg.dir && fs.existsSync(cfg.dir)) ? cfg.dir : '';
  logLine('note:save  name=' + name + '  remembered=' + (remembered || '(none)'));

  // ① 记住的目录里有这本书的文件 → 静默覆盖，不弹任何框
  if (remembered) {
    const fp = path.join(remembered, name);
    if (fs.existsSync(fp)) {
      try {
        fs.writeFileSync(fp, text, 'utf8');
        logLine('note:save  overwrite OK ' + fp);
        return { ok: true, silent: true, overwrite: true, path: fp, dir: remembered };
      } catch (err) {
        logLine('note:save  overwrite FAILED ' + String(err && err.message || err));
        return { ok: false, error: String(err && err.message || err) };
      }
    }
  }

  // ② 目录里没这个文件（新书 / 目录换过）→ 弹一次保存框让用户定位置
  let start = remembered;
  if (!start) {                                  // 从没选过：建议「文档\极简阅读器笔记」
    start = defaultDir();
    try { fs.mkdirSync(start, { recursive: true }); }
    catch (e) { start = app.getPath('documents') || app.getPath('home') || ''; }
  }
  logLine('note:save  ask user, start=' + start + (remembered ? '' : ' (default suggest)'));
  try {
    const r = await dialog.showSaveDialog(win || undefined, {
      title: remembered ? '这本书还没存过笔记 —— 确认保存位置' : '选择笔记保存位置',
      defaultPath: path.join(start, name),
      filters: [{ name: '读书笔记', extensions: ['md', 'txt'] }]
    });
    if (r.canceled || !r.filePath) { logLine('note:save  dialog canceled'); return { canceled: true }; }
    fs.writeFileSync(r.filePath, text, 'utf8');
    const dir = path.dirname(r.filePath);
    const c = readCfg();
    c.dir = dir;                                       // 记下这次的文件夹，这本书以后静默覆盖
    writeCfg(c);
    logLine('note:save  dialog-save OK ' + r.filePath + '  dir=' + dir);
    return { ok: true, silent: false, first: true, path: r.filePath, dir: dir };
  } catch (err) {
    logLine('note:save  dialog-save FAILED ' + String(err && err.stack || err));
    return { ok: false, error: String(err && err.message || err) };
  }
});

/* ---- 打开书：同样绕开 FSA ----
   系统对话框给出真实路径，主进程直接 fs.readFileSync 把字节交给页面。
   路径记在 localStorage 里，下次点历史记录按路径静默重开，不再弹框。 */

const BOOK_EXT = ['epub', 'mobi', 'azw', 'azw3', 'pdb', 'pdf', 'txt', 'text'];

function readBookFile(p) {
  return {
    ok: true,
    name: path.basename(p),
    path: p,
    data: new Uint8Array(fs.readFileSync(p))
  };
}

ipcMain.handle('book:open', async function () {
  const r = await dialog.showOpenDialog(win || undefined, {
    title: '打开电子书',
    defaultPath: readCfg().bookDir || app.getPath('documents'),
    properties: ['openFile'],
    filters: [{ name: '电子书', extensions: BOOK_EXT }]
  });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return { canceled: true };
  const p = r.filePaths[0];
  try {
    const cfg = readCfg();
    cfg.bookDir = path.dirname(p);              // 下次打开书还从这个文件夹开始
    writeCfg(cfg);
    return readBookFile(p);
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

ipcMain.handle('book:openPath', async function (e, p) {
  try {
    if (!p || !fs.existsSync(p)) return { ok: false, missing: true };
    return readBookFile(p);
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
});

let win = null;

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const w = Math.min(1280, Math.max(900, Math.round(area.width * 0.82)));
  const h = Math.min(900, Math.max(620, Math.round(area.height * 0.88)));

  win = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 720,
    minHeight: 480,
    title: '极简阅读器',
    backgroundColor: '#fafbfc',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,                    // Electron 20+ 默认沙箱会掐掉 preload 的 require，桥接会静默失效
      spellcheck: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.removeMenu();                       // Win7 上藏掉菜单栏，界面更干净
  win.loadURL('app://./index.html');
  win.once('ready-to-show', function () { win.show(); });

  // 页面里的外链交给系统浏览器，别在应用里跳
  win.webContents.on('will-navigate', function (e, url) {
    if (url && url.indexOf('app://') !== 0) { e.preventDefault(); shell.openExternal(url); }
  });
  win.webContents.setWindowOpenHandler(function (details) {
    if (details && details.url) shell.openExternal(details.url);
    return { action: 'deny' };
  });

  win.on('closed', function () { win = null; });
}

app.whenReady().then(function () {
  logLine('app start  main=' + __filename);
  // 构建标记：只要这个文件出现，就说明跑的是带原生通道的新版主程序
  try {
    fs.mkdirSync(path.dirname(cfgPath()), { recursive: true });
    fs.writeFileSync(path.join(path.dirname(cfgPath()), 'build.json'),
      JSON.stringify({ build: 'v1.2-first-ask', at: new Date().toISOString() }), 'utf8');
  } catch (e) {}

  protocol.registerFileProtocol('app', function (req, cb) {
    let p = decodeURIComponent(req.url.replace(/^app:\/\//i, '').split('?')[0].split('#')[0]);
    if (p === '' || p === '/' || p === './') p = 'index.html';
    if (p.indexOf('./') === 0) p = p.slice(2);
    cb({ path: path.join(__dirname, p) });
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () { app.quit(); });
