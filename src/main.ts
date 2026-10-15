import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import * as path from "path";
import * as zlib from "zlib";
import { registerAppBar, removeAppBar, setAppBarWidth } from "./appbar";

const PORTAL_URL = "https://ashlerick.github.io/BPO-Portal/";
const WIDTH = 300; // DIPs

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let docked = false;
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

// Reserve the right edge of the primary monitor and size the window to it. The AppBar API works in
// physical pixels, Electron in DIPs, so convert both ways.
function dock(): void {
  if (!win) return;
  const display = screen.getPrimaryDisplay();
  const monitor = screen.dipToScreenRect(null, display.bounds);
  const width = Math.round(WIDTH * display.scaleFactor);
  const rc = setAppBarWidth(hwnd, {
    left: monitor.x,
    top: monitor.y,
    right: monitor.x + monitor.width,
    bottom: monitor.y + monitor.height,
  }, width);
  win.setBounds(
    screen.screenToDipRect(null, { x: rc.left, y: rc.top, width: rc.right - rc.left, height: rc.bottom - rc.top })
  );
}

// Minimize: hide the panel and give the screen space back. Restoring takes the edge again.
function minimize(): void {
  if (!win || !docked) return;
  removeAppBar(hwnd);
  docked = false;
  win.hide();
}

function restore(): void {
  if (!win || docked) return;
  registerAppBar(hwnd);
  docked = true;
  dock();
  win.show();
}

function quit(): void {
  app.quit();
}

function createWindow(): void {
  win = new BrowserWindow({
    width: WIDTH,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: "#1a212b",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  hwnd = Number(win.getNativeWindowHandle().readBigUInt64LE(0));
  registerAppBar(hwnd);
  docked = true;
  dock();
  win.loadFile(path.join(__dirname, "..", "mockup", "index.html"), { query: { app: "1" } });
}

app.whenReady().then(() => {
  createWindow();

  tray = new Tray(trayIcon());
  tray.setToolTip("BPO Time");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show panel", click: restore },
      { label: "Open portal", click: () => shell.openExternal(PORTAL_URL) },
      { type: "separator" },
      { label: "Quit BPO Time", click: quit },
    ])
  );

  ipcMain.on("panel:minimize", minimize);
  tray.on("click", () => (docked ? minimize() : restore()));
  ipcMain.on("portal:open", () => shell.openExternal(PORTAL_URL));
  ipcMain.on("app:quit", quit);

  // Monitor plugged in, resolution or scale changed: take the edge again.
  screen.on("display-metrics-changed", () => docked && dock());
});

// Give the screen space back to Windows when we exit, otherwise it stays reserved until sign-out.
app.on("before-quit", () => {
  if (hwnd && docked) removeAppBar(hwnd);
});

app.on("window-all-closed", () => app.quit());
