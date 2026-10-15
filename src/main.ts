import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import * as path from "path";
import * as zlib from "zlib";
import { desktopState, sendToBottom, sendToTop } from "./winpos";
import * as auth from "./auth";
import * as attendance from "./attendance";

const PORTAL_URL = "https://ashlerick.github.io/BPO-Portal/";
const WIDTH = 300; // DIPs

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let shown = true;
let liftedForDesktop = false;
let hwnd = 0;

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// Tray icon drawn in code (no image tooling in the repo yet): a white clock face on a blue rounded
// square, 4x4 supersampled so the edges are smooth. Swap for real artwork before release.
function trayIcon(): Electron.NativeImage {
  const size = 32;
  const ss = 4;
  const c = (size - 1) / 2 + 0.5;
  const inRoundedSquare = (x: number, y: number): boolean => {
    const r = 7;
    const dx = Math.max(r - x, 0, x - (size - r));
    const dy = Math.max(r - y, 0, y - (size - r));
    return dx * dx + dy * dy <= r * r;
  };
  const isWhite = (x: number, y: number): boolean => {
    const d = Math.hypot(x - c, y - c);
    if (d >= 10 && d <= 12.5) return true; // ring
    if (d <= 2) return true; // centre
    if (Math.abs(x - c) <= 1.1 && y <= c && y >= c - 8.5) return true; // minute hand
    if (Math.abs(y - c) <= 1.1 && x >= c && x <= c + 6.5) return true; // hour hand
    return false;
  };
  const rows: Buffer[] = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = px + (sx + 0.5) / ss;
          const y = py + (sy + 0.5) / ss;
          if (inRoundedSquare(x, y)) {
            bg++;
            if (isWhite(x, y)) fg++;
          }
        }
      }
      const n = ss * ss;
      const o = 1 + px * 4;
      const t = bg ? fg / bg : 0;
      row[o] = Math.round(0x1f + (255 - 0x1f) * t);
      row[o + 1] = Math.round(0x5f + (255 - 0x5f) * t);
      row[o + 2] = Math.round(0xbf + (255 - 0xbf) * t);
      row[o + 3] = Math.round((bg / n) * 255);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return nativeImage.createFromBuffer(png, { scaleFactor: 2 });
}

// Full height of the right side of the main monitor, above the taskbar. Nothing is reserved, so desktop
// icons stay where they are and apps can be placed over the panel.
function place(): void {
  if (!win) return;
  const area = screen.getPrimaryDisplay().workArea;
  win.setBounds({ x: area.x + area.width - WIDTH, y: area.y, width: WIDTH, height: area.height });
  sendToBottom(hwnd);
}

// "Minimize" does not hide anything: it pushes the panel behind your apps. It stays on the desktop,
// so the bare desktop is never shown without it.
function minimize(): void {
  if (!win) return;
  sendToBottom(hwnd);
}

// Bring the panel in front of the other apps (from the tray). It drops back behind them as soon as you
// click another window, because it is not "always on top".
function raise(): void {
  if (!win) return;
  shown = true;
  place();
  win.showInactive();
  // Flip always-on-top on and off: that lifts it over everything, then it stays an ordinary window.
  win.setAlwaysOnTop(true);
  sendToTop(hwnd);
  win.setAlwaysOnTop(false);
  sendToTop(hwnd);
}

// "Show desktop" (Win+D or the corner button) lifts the desktop above every window, which would cover the
// panel. Put the panel back above it while that lasts, then back to the bottom when the apps return.
function keepAboveShownDesktop(): void {
  if (!win || !shown) return;
  const s = desktopState(hwnd);
  if (s.desktopOnTop && s.panelBelowDesktop) {
    // A plain raise cannot beat the desktop while it is lifted; always-on-top can.
    win.setAlwaysOnTop(true);
    sendToTop(hwnd);
    liftedForDesktop = true;
  } else if (!s.desktopOnTop && liftedForDesktop) {
    liftedForDesktop = false;
    win.setAlwaysOnTop(false);
    sendToBottom(hwnd);
  }
}

function signOut(): void {
  auth.signOut();
  win?.webContents.send("toast", "Signed out of this PC.", false);
}

function quit(): void {
  app.quit();
}

function createWindow(): void {
  win = new BrowserWindow({
    width: WIDTH,
    frame: false,
    resizable: false,
    minimizable: false, // Windows skips non-minimizable windows on Win+D (Show desktop)
    movable: false,
    focusable: false, // clicking it never raises it above the app you are working in
    alwaysOnTop: false,
    skipTaskbar: true,
    backgroundColor: "#1a212b",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  hwnd = Number(win.getNativeWindowHandle().readBigUInt64LE(0));
  place();
  win.once("ready-to-show", () => sendToBottom(hwnd));
  win.on("minimize", () => {
    // Win+D (Show desktop) minimizes every window; the panel stays. Our own minimize uses hide().
    win?.showInactive();
    sendToBottom(hwnd);
  });
  win.loadFile(path.join(__dirname, "..", "mockup", "index.html"), { query: { app: "1" } });
}

const PROTOCOL = "bpotime";

// Register bpotime:// with Windows so the portal's "Open app" button can start or focus the app. When
// running from source, Windows has to be told to launch electron.exe with this app's folder.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

function toast(message: string, error = false): void {
  win?.webContents.send("toast", message, error);
}

// A link is text from any web page, so only a short allowlist of actions is honoured, and nothing in it
// is used to open files, run commands or visit addresses. The whole link is never logged because
// "connect" carries a one-time code.
function handleLink(argv: string[]): void {
  const link = argv.find((a) => a.startsWith(PROTOCOL + "://"));
  if (!link) return raise();
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return raise();
  }
  raise();
  if (url.hostname === "connect") {
    void auth.connect(url.searchParams.get("code")).then((r) => toast(r.message, !r.ok));
  }
}

// A second launch (Start menu, or the portal's button) hands over to the running panel instead.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_e, argv) => handleLink(argv));
}

app.whenReady().then(() => {
  // The second launch is on its way out: it must not create a window or touch the sign-in.
  if (!gotLock) return;
  createWindow();

  tray = new Tray(trayIcon());
  tray.setToolTip("BPO Time");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show panel", click: raise },
      { label: "Open portal", click: () => shell.openExternal(PORTAL_URL) },
      { label: "Sign out of this PC", click: signOut },
      { type: "separator" },
      { label: "Quit BPO Time", click: quit },
    ])
  );

  ipcMain.on("panel:minimize", minimize);
  tray.on("click", raise);
  tray.on("double-click", raise);
  ipcMain.on("portal:open", () => shell.openExternal(PORTAL_URL));
  ipcMain.on("app:quit", quit);
  ipcMain.handle("auth:get", () => auth.getState());
  ipcMain.on("auth:signout", signOut);
  auth.onChange((s) => {
    win?.webContents.send("auth:state", s);
    attendance.follow(s);
  });
  attendance.onChange((a) => win?.webContents.send("attendance:state", a));
  ipcMain.handle("attendance:get", () => attendance.get());
  ipcMain.handle("attendance:clockIn", () => attendance.clockIn());
  ipcMain.handle("attendance:clockOut", () => attendance.clockOut());

  // Signed in already? Verify quietly. Started by a bpotime:// link? Handle it once we know that.
  void auth.restore().then(() => {
    if (process.argv.some((a) => a.startsWith(PROTOCOL + "://"))) handleLink(process.argv);
  });

  // Monitor plugged in, resolution or scale changed: take the edge again.
  setInterval(keepAboveShownDesktop, 250);
  screen.on("display-metrics-changed", () => shown && place());
});

app.on("window-all-closed", () => app.quit());
