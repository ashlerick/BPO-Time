import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import * as path from "path";
import * as zlib from "zlib";
import { registerAppBar, removeAppBar, setAppBarWidth } from "./appbar";

const PORTAL_URL = "https://ashlerick.github.io/BPO-Portal/";
const WIDTH = 300; // DIPs
const COLLAPSED_WIDTH = 56;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let collapsed = false;
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

// Plain blue 16x16 square, enough for a tray icon until there is real artwork.
function trayIcon(): Electron.NativeImage {
  const size = 16;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.concat([Buffer.from([0]), Buffer.concat(Array(size).fill(Buffer.from([0x1f, 0x5f, 0xbf, 0xff])))]);
  const raw = Buffer.concat(Array(size).fill(row));
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return nativeImage.createFromBuffer(png);
}

// Reserve the right edge of the primary monitor and size the window to it. The AppBar API works in
// physical pixels, Electron in DIPs, so convert both ways.
function dock(): void {
  if (!win) return;
  const display = screen.getPrimaryDisplay();
  const monitor = screen.dipToScreenRect(null, display.bounds);
  const width = Math.round((collapsed ? COLLAPSED_WIDTH : WIDTH) * display.scaleFactor);
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
  dock();
  win.loadFile(path.join(__dirname, "..", "mockup", "index.html"), { query: { app: "1" } });
}

app.whenReady().then(() => {
  createWindow();

  tray = new Tray(trayIcon());
  tray.setToolTip("BPO Time");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open portal", click: () => shell.openExternal(PORTAL_URL) },
      { type: "separator" },
      { label: "Quit BPO Time", click: quit },
    ])
  );

  ipcMain.on("panel:collapsed", (_e, value: boolean) => {
    collapsed = value;
    dock();
  });
  ipcMain.on("portal:open", () => shell.openExternal(PORTAL_URL));
  ipcMain.on("app:quit", quit);

  // Monitor plugged in, resolution or scale changed: take the edge again.
  screen.on("display-metrics-changed", dock);
});

// Give the screen space back to Windows when we exit, otherwise it stays reserved until sign-out.
app.on("before-quit", () => {
  if (hwnd) removeAppBar(hwnd);
});

app.on("window-all-closed", () => app.quit());
