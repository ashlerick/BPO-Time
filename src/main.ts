import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from "electron";
import * as path from "path";
import * as zlib from "zlib";

const PORTAL_URL = "https://ashlerick.github.io/BPO-Portal/";
const WIDTH = 300;
const COLLAPSED_WIDTH = 56;
const HEIGHT = 640;
const COLLAPSED_HEIGHT = 130;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

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

function placeAtEdge(): void {
  if (!win) return;
  const area = screen.getPrimaryDisplay().workArea;
  const height = Math.min(HEIGHT, area.height);
  win.setBounds({ x: area.x + area.width - WIDTH, y: area.y + 40, width: WIDTH, height });
}

// Resize in place, keeping the right edge where the user dragged it.
function setCollapsed(collapsed: boolean): void {
  if (!win) return;
  const b = win.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const width = collapsed ? COLLAPSED_WIDTH : WIDTH;
  const height = collapsed ? COLLAPSED_HEIGHT : Math.min(HEIGHT, area.height);
  const x = b.x + b.width - width;
  const y = Math.min(b.y, area.y + area.height - height);
  win.setBounds({ x, y, width, height });
}

function createWindow(): void {
  win = new BrowserWindow({
    width: WIDTH,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#1a212b",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  placeAtEdge();
  win.loadFile(path.join(__dirname, "..", "mockup", "index.html"), { query: { app: "1" } });
  win.on("close", (e) => {
    // Closing hides to the tray; quit from the tray menu.
    if (!quitting) {
      e.preventDefault();
      win?.hide();
    }
  });
}

let quitting = false;

app.whenReady().then(() => {
  createWindow();

  tray = new Tray(trayIcon());
  tray.setToolTip("BPO Time");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show panel", click: () => win?.show() },
      { label: "Open portal", click: () => shell.openExternal(PORTAL_URL) },
      { type: "separator" },
      { label: "Quit BPO Time", click: () => { quitting = true; app.quit(); } },
    ])
  );
  tray.on("click", () => (win?.isVisible() ? win.hide() : win?.show()));

  ipcMain.on("panel:collapsed", (_e, collapsed: boolean) => setCollapsed(collapsed));
  ipcMain.on("panel:minimize", () => win?.minimize());
  ipcMain.on("portal:open", () => shell.openExternal(PORTAL_URL));
  ipcMain.on("app:quit", () => { quitting = true; app.quit(); });
});

app.on("window-all-closed", () => {});
