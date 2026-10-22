import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, powerMonitor, screen, shell, Tray } from "electron";
import * as path from "path";
import * as zlib from "zlib";
import * as sync from "./sync";
import { desktopState, fitMaximizedBeside, openAppWindows, restoreFitted, sendToBottom, sendToTop, type Fitted } from "./winpos";
import * as auth from "./auth";
import * as attendance from "./attendance";
import * as counts from "./counts";
import * as feed from "./feed";
import * as updates from "./updates";

const PORTAL_URL = "https://ashlerick.github.io/BPO-Portal/";
const WIDTH = 300; // DIPs
// Pages the panel may open in the portal (quick links, cards). Anything else opens the portal home.
const PORTAL_PAGES = ["notifications", "announcements", "my-time", "leave", "calendar", "hr-requests", "documents", "freedom-wall", "profile"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let shown = true;
let liftedForDesktop = false;
// On a break the panel comes to the front and stays there, so the break timer is in view. It never moves by itself afterwards: the person
// puts it back with Minimize.
let stayOnTop = false;
let hwnd = 0;
// "Fit windows beside the panel" (a setting): when a break starts, maximized windows on this screen shrink to everything left of the
// panel; they go back when the break ends or Minimize is pressed. `fitted` is what we changed, so we put back only that.
let fitOn = false;
let fitted: Fitted[] = [];
// "Keep the panel in front during breaks" (a setting, on unless switched off).
let keepFront = true;

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

// Tray icon drawn in code (no image tooling in the repo yet): a gold clock face on a portal-green
// rounded square, 4x4 supersampled so the edges are smooth. Swap for real artwork before release.
function trayIcon(): Electron.NativeImage {
  const size = 32;
  const ss = 4;
  const c = (size - 1) / 2 + 0.5;
  const inRoundedSquare = (x: number, y: number): boolean => {
    const r = 9;
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
      // Portal green, lighter at the top left to deeper at the bottom right, with a gold clock.
      const g = (px + py) / (2 * (size - 1));
      const base = [0x1f + (0x0d - 0x1f) * g, 0xa7 + (0x47 - 0xa7) * g, 0x63 + (0x2e - 0x63) * g];
      const gold = [0xfb, 0xbf, 0x24];
      for (let k = 0; k < 3; k++) row[o + k] = Math.round(base[k] + (gold[k] - base[k]) * t);
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
  if (!stayOnTop) sendToBottom(hwnd);
}

function unfitWindows(): void {
  if (fitted.length === 0) return;
  restoreFitted(fitted);
  fitted = [];
}

function fitWindows(): void {
  if (!win || win.isDestroyed()) return;
  unfitWindows(); // never fit twice: put the first lot back before looking again
  // Windows are placed in real pixels, the panel in scaled ones.
  const panel = screen.dipToScreenRect(win, win.getBounds());
  const work = screen.dipToScreenRect(null, screen.getPrimaryDisplay().workArea);
  fitted = fitMaximizedBeside(hwnd, { left: work.x, top: work.y, right: panel.x, bottom: work.y + work.height });
}

// "Minimize" does not hide anything: it pushes the panel behind your apps. It stays on the desktop,
// so the bare desktop is never shown without it.
function minimize(): void {
  if (!win) return;
  unfitWindows();
  stayOnTop = false; // this is how the break's stay-on-top is ended: by hand
  win.setAlwaysOnTop(false);
  sendToBottom(hwnd);
}

// A break started: bring the panel in front of everything and keep it there until Minimize is pressed.
function holdOnTop(): void {
  if (!win) return;
  stayOnTop = true;
  shown = true;
  place();
  win.showInactive();
  win.setAlwaysOnTop(true);
  sendToTop(hwnd);
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
  if (stayOnTop) win.setAlwaysOnTop(true);
}

// "Show desktop" (Win+D or the corner button) lifts the desktop above every window, which would cover the
// panel. Put the panel back above it while that lasts, then back to the bottom when the apps return.
function keepAboveShownDesktop(): void {
  if (!win || win.isDestroyed() || !shown) return;
  const s = desktopState(hwnd);
  if (s.desktopOnTop && s.panelBelowDesktop) {
    // A plain raise cannot beat the desktop while it is lifted; always-on-top can.
    win.setAlwaysOnTop(true);
    sendToTop(hwnd);
    liftedForDesktop = true;
  } else if (!s.desktopOnTop && liftedForDesktop) {
    liftedForDesktop = false;
    win.setAlwaysOnTop(stayOnTop);
    if (!stayOnTop) sendToBottom(hwnd);
  }
}

// "Minimize" only means something when another app window is open to go behind. With nothing else open,
// the panel hides the button. Unsure (the check threw)? Show it: a button that does nothing beats a missing one.
let canMinimize = true;
function updateMinimizeAvailable(): void {
  if (!win || win.isDestroyed()) return;
  let next = true;
  try {
    next = openAppWindows(hwnd) > 0;
  } catch {
    next = true;
  }
  if (next !== canMinimize) {
    canMinimize = next;
    win.webContents.send("minimize:available", next);
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
  // Once the window is gone (quitting), forget it: the timers below and every `win?.` check then stop, instead of touching a
  // destroyed window ("Object has been destroyed").
  win.on("closed", () => {
    win = null;
  });
  hwnd = Number(win.getNativeWindowHandle().readBigUInt64LE(0));
  place();
  win.once("ready-to-show", () => sendToBottom(hwnd));
  win.on("minimize", () => {
    // Win+D (Show desktop) minimizes every window; the panel stays. Our own minimize uses hide().
    win?.showInactive();
    if (!stayOnTop) sendToBottom(hwnd);
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
// A run pointed at a test server (npm run start:staging) keeps its own sign-in and settings in a separate folder, so it
// can never overwrite the real portal's token or the installed app's data.
if (!app.isPackaged && process.env.BPO_API_BASE) app.setPath("userData", path.join(app.getPath("appData"), "bpo-time-staging"));

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
  tray.setToolTip("BPO Time " + app.getVersion());
  const buildTrayMenu = () => {
    const waiting = updates.ready();
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show panel", click: raise },
        { label: "Open portal", click: () => shell.openExternal(PORTAL_URL) },
        ...(waiting ? [{ label: `Restart to update to ${waiting}`, click: () => updates.installNow() }] : []),
        { label: "Sign out of this PC", click: signOut },
        { type: "separator" as const },
        { label: "Quit BPO Time", click: quit },
      ])
    );
  };
  buildTrayMenu();

  // Updates (released builds only): a newer version downloads in the background and installs on the next restart.
  ipcMain.handle("app:version", () => ({ version: app.getVersion(), updateReady: updates.ready(), testServer: auth.testServerHost() }));
  ipcMain.on("update:install", () => updates.installNow());
  // The setting from the panel (Settings, "Fit windows beside the panel"). Switching it off during a break puts the windows back.
  ipcMain.on("fit:set", (_e, on: unknown) => {
    fitOn = on === true;
    if (!fitOn) unfitWindows();
  });
  app.on("before-quit", unfitWindows);
  ipcMain.on("front:set", (_e, on: unknown) => {
    keepFront = on !== false;
  });
  // "Start with Windows": the choice lives in Windows itself, so it is read back from there, and the switch is off when the person has
  // switched BPO Time off in Task Manager's Startup apps. It works the same installed or run from source; from source, Windows is told to start Electron WITH this app's folder (the same
  // way the bpotime:// link is registered above), so it never starts a bare Electron.
  const loginOptions = () => (process.defaultApp && process.argv.length >= 2 ? { path: process.execPath, args: [path.resolve(process.argv[1])] } : {});
  // executableWillLaunchAtLogin is not used: in an installed build Electron reports it false even right after the entry was written
  // (launchItems comes back empty), so the switch snapped back off. openAtLogin says the entry exists; a launch item that Task
  // Manager has switched off still reports itself as disabled, and that is what turns the switch off.
  const startsAtLogin = () => {
    const s = app.getLoginItemSettings(loginOptions());
    return s.openAtLogin && !s.launchItems?.some((i) => i.enabled === false);
  };
  ipcMain.handle("startup:get", () => ({ on: startsAtLogin() }));
  ipcMain.handle("startup:set", (_e, on: unknown) => {
    app.setLoginItemSettings({ ...loginOptions(), openAtLogin: on === true });
    return startsAtLogin();
  });
  updates.start((version) => {
    buildTrayMenu();
    win?.webContents.send("update:ready", version);
    toast(`Version ${version} is ready. It installs when BPO Time restarts (More, Restart to update).`);
  });

  ipcMain.on("panel:minimize", minimize);
  tray.on("click", raise);
  tray.on("double-click", raise);
  // The panel may ask for a page by name; anything not listed opens the portal home.
  // An announcement id is only accepted when it looks like a real id, so a link can never carry anything else.
  ipcMain.on("portal:open", (_e, page?: string, id?: string) => {
    if (page === "announcements" && typeof id === "string" && UUID.test(id)) {
      void shell.openExternal(`${PORTAL_URL}announcements/${id}`);
    } else if (page === "connect") {
      // The "not signed in" button: the portal connects this PC by itself once the person is signed in there (no secret in the link).
      void shell.openExternal(`${PORTAL_URL}?connect=app`);
    } else {
      void shell.openExternal(page && PORTAL_PAGES.includes(page) ? PORTAL_URL + page : PORTAL_URL);
    }
  });
  ipcMain.on("app:quit", quit);
  ipcMain.handle("auth:get", () => auth.getState());
  ipcMain.on("auth:signout", signOut);
  // The sync label: when the panel last read everything from the portal (see sync.ts).
  sync.onChange((s) => win?.webContents.send("sync:state", s));
  ipcMain.handle("sync:get", () => sync.snapshot());
  // Read everything again when the PC wakes up or the panel is shown (at most every 15 seconds), so it is never a minute behind.
  let lastRefreshAll = 0;
  const refreshAll = () => {
    if (auth.getState().status !== "signedIn" || Date.now() - lastRefreshAll < 15_000) return;
    lastRefreshAll = Date.now();
    void attendance.refresh();
    void counts.refresh();
    void feed.refresh();
  };
  powerMonitor.on("resume", refreshAll);
  powerMonitor.on("unlock-screen", refreshAll);
  win?.on("show", refreshAll);
  auth.onChange((s) => {
    win?.webContents.send("auth:state", s);
    if (s.status !== "signedIn") sync.reset();
    attendance.follow(s);
    counts.follow(s);
    feed.follow(s);
  });
  feed.onChange((f) => win?.webContents.send("feed:state", f));
  ipcMain.handle("feed:get", () => feed.get());
  counts.onChange((c) => win?.webContents.send("counts:state", c));
  ipcMain.handle("counts:get", () => counts.get());
  // The refresh buttons in the panel: fetch now instead of waiting for the next automatic check.
  ipcMain.handle("counts:refresh", () => counts.refresh());
  ipcMain.handle("feed:refresh", () => feed.refresh());
  ipcMain.handle("attendance:refresh", () => attendance.refresh());
  // A break starts (it was not running a moment ago): the panel comes to the front and stays until Minimize.
  let wasOnBreak = false;
  attendance.onChange((a) => {
    win?.webContents.send("attendance:state", a);
    const onBreak = !!a && "breaks" in a && a.breaks.some((b) => b.status === "taken" && !!b.startedAt && !b.endedAt);
    if (onBreak && !wasOnBreak) {
      if (keepFront) holdOnTop();
      if (fitOn) fitWindows();
    } else if (!onBreak && wasOnBreak) {
      unfitWindows();
    }
    wasOnBreak = onBreak;
  });
  ipcMain.handle("attendance:get", () => attendance.get());
  // Clocking in copies "Good morning, clock in!" and clocking out copies "Good night, clock out!" (same on/off switch as
  // the break messages). Only when this press really changed something: pressing again while already in, or out, copies nothing.
  ipcMain.handle("attendance:clockIn", async (_e, copy: unknown) => {
    const before = attendance.get();
    const wasIn = !!(before && "checkedIn" in before && before.checkedIn);
    const r = await attendance.clockIn();
    if (r.ok && copy === true && !wasIn) {
      const text = "Good morning, clock in!";
      clipboard.writeText(text);
      return { ok: true, message: `${r.message} Copied “${text}” to your clipboard.` };
    }
    return r;
  });
  ipcMain.handle("attendance:clockOut", async (_e, copy: unknown) => {
    const before = attendance.get();
    const wasOut = !!(before && "checkedOut" in before && before.checkedOut);
    const r = await attendance.clockOut();
    if (r.ok && copy === true && !wasOut) {
      const text = "Good night, clock out!";
      clipboard.writeText(text);
      return { ok: true, message: `${r.message} Copied “${text}” to your clipboard.` };
    }
    return r;
  });
  // Starting a break can also copy a short message ("Taking my break" / "Taking my lunch") for pasting into a chat.
  // It is copied only after the portal has accepted the break, and only when the person has that switched on.
  ipcMain.handle("attendance:startBreak", async (_e, slot: unknown, copy: unknown) => {
    if (slot !== "morning" && slot !== "lunch" && slot !== "afternoon") return { ok: false, message: "That break is not one of the three." };
    const r = await attendance.startBreak(slot);
    if (r.ok && copy === true) {
      const text = slot === "lunch" ? "Taking my lunch" : "Taking my break";
      clipboard.writeText(text);
      return { ok: true, message: `${r.message} Copied \u201c${text}\u201d to your clipboard.` };
    }
    return r;
  });
  // Ending a break copies "Back from break" / "Back from lunch" the same way (same on/off switch in the panel).
  ipcMain.handle("attendance:endBreak", async (_e, copy: unknown) => {
    const current = attendance.get();
    const running = current && "breaks" in current ? current.breaks.find((b) => b.status === "taken" && b.startedAt && !b.endedAt) : undefined;
    const r = await attendance.endBreak();
    if (r.ok && copy === true && running) {
      const text = running.slot === "lunch" ? "Back from lunch" : "Back from break";
      clipboard.writeText(text);
      return { ok: true, message: `${r.message} Copied “${text}” to your clipboard.` };
    }
    return r;
  });

  // Signed in already? Verify quietly. Started by a bpotime:// link? Handle it once we know that.
  void auth.restore().then(() => {
    if (process.argv.some((a) => a.startsWith(PROTOCOL + "://"))) handleLink(process.argv);
  });

  // Monitor plugged in, resolution or scale changed: take the edge again.
  setInterval(keepAboveShownDesktop, 250);
  setInterval(updateMinimizeAvailable, 750);
  ipcMain.handle("minimize:get", () => canMinimize);
  screen.on("display-metrics-changed", () => shown && place());
});

app.on("window-all-closed", () => app.quit());
