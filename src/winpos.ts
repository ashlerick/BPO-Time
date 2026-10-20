// Window z-order helper (Windows only; no-op elsewhere). Electron has no "send to back".
import koffi from "koffi";

const HWND_TOP = 0;
const HWND_BOTTOM = 1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;

const user32 = process.platform === "win32" ? koffi.load("user32.dll") : null;
const SetWindowPos = user32
  ? user32.func("bool __stdcall SetWindowPos(intptr hWnd, intptr hWndInsertAfter, int x, int y, int cx, int cy, uint32 flags)")
  : null;

/** Put the window at the very bottom of the normal window stack, above the desktop and its icons. */
export function sendToBottom(hwnd: number): void {
  SetWindowPos?.(hwnd, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
}

/** Put the window above every normal window without activating it. */
export function sendToTop(hwnd: number): void {
  SetWindowPos?.(hwnd, HWND_TOP, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
}

const dwmapi = process.platform === "win32" ? koffi.load("dwmapi.dll") : null;
const MonitorFromWindow = user32 ? user32.func("intptr __stdcall MonitorFromWindow(intptr hWnd, uint32 flags)") : null;
const GetTopWindow = user32 ? user32.func("intptr __stdcall GetTopWindow(intptr hWnd)") : null;
const GetWindow = user32 ? user32.func("intptr __stdcall GetWindow(intptr hWnd, uint32 cmd)") : null;
const IsWindowVisible = user32 ? user32.func("bool __stdcall IsWindowVisible(intptr hWnd)") : null;
const IsIconic = user32 ? user32.func("bool __stdcall IsIconic(intptr hWnd)") : null;
const GetWindowTextLengthW = user32 ? user32.func("int __stdcall GetWindowTextLengthW(intptr hWnd)") : null;
const GetClassNameW = user32 ? user32.func("int __stdcall GetClassNameW(intptr hWnd, _Out_ void *buf, int max)") : null;
const DwmGetWindowAttribute = dwmapi
  ? dwmapi.func("int __stdcall DwmGetWindowAttribute(intptr hWnd, uint32 attr, _Out_ int32 *value, uint32 size)")
  : null;

const GW_HWNDNEXT = 2;
const MONITOR_DEFAULTTONEAREST = 2;
const DWMWA_CLOAKED = 14;

function className(hwnd: number): string {
  const buf = Buffer.alloc(512);
  const n = GetClassNameW?.(hwnd, buf, 256) ?? 0;
  return buf.toString("utf16le", 0, n * 2);
}

function isCloaked(hwnd: number): boolean {
  const out = [0];
  DwmGetWindowAttribute?.(hwnd, DWMWA_CLOAKED, out, 4);
  return out[0] !== 0;
}

// A real app window: visible, not minimized, has a title, not cloaked by Windows (hidden system windows,
// other virtual desktops), and not the desktop's own helper window. Taskbars have no title, so they never count.
function isAppWindow(hwnd: number, cls: string): boolean {
  return !!(
    IsWindowVisible?.(hwnd) &&
    !IsIconic?.(hwnd) &&
    (GetWindowTextLengthW?.(hwnd) ?? 0) > 0 &&
    !isCloaked(hwnd) &&
    cls !== "WorkerW"
  );
}

/**
 * How many other app windows are open on the SAME monitor as the panel (the panel itself excluded). Zero means
 * nothing could go in front of the panel or behind it there, so "Minimize" has nothing to do. Windows on
 * another screen do not count. Walks the window stack down to the desktop.
 */
export function openAppWindows(panel: number): number {
  const panelMonitor = MonitorFromWindow?.(panel, MONITOR_DEFAULTTONEAREST) ?? 0;
  let count = 0;
  let hwnd = GetTopWindow?.(0) ?? 0;
  for (let i = 0; hwnd && i < 500; i++) {
    if (hwnd !== panel) {
      const cls = className(hwnd);
      if (cls === "Progman") break;
      // a window belongs to the monitor that holds most of it
      if (isAppWindow(hwnd, cls) && (MonitorFromWindow?.(hwnd, MONITOR_DEFAULTTONEAREST) ?? 0) === panelMonitor) count++;
    }
    hwnd = GetWindow?.(hwnd, GW_HWNDNEXT) ?? 0;
  }
  return count;
}

/**
 * Where the panel sits relative to the desktop. "Show desktop" lifts the desktop window (Progman) above the
 * other windows, which covers the panel without minimizing it.
 *  - desktopOnTop: no normal app window is above the desktop, i.e. Show desktop is active (or nothing is open)
 *  - panelBelowDesktop: the desktop is currently covering the panel
 */
export function desktopState(panel: number): { desktopOnTop: boolean; panelBelowDesktop: boolean } {
  let appsAbove = 0;
  let panelAbove = false;
  let hwnd = GetTopWindow?.(0) ?? 0;
  for (let i = 0; hwnd && i < 500; i++) {
    if (hwnd === panel) {
      panelAbove = true;
    } else {
      const cls = className(hwnd);
      if (cls === "Progman") return { desktopOnTop: appsAbove === 0, panelBelowDesktop: !panelAbove };
      if (isAppWindow(hwnd, cls)) appsAbove++;
    }
    hwnd = GetWindow?.(hwnd, GW_HWNDNEXT) ?? 0;
  }
  return { desktopOnTop: false, panelBelowDesktop: false };
}

// ---- Fit maximized windows beside the panel (an option in Settings, used when a break starts) ----
// A maximized window on the panel's monitor is shrunk to everything left of the panel, and put back, exactly as it was, when
// the break ends (or the panel is minimized). Nothing is touched that cannot be moved (an administrator app, true full screen):
// if the window is still maximized after we ask it to restore, we leave it alone.

const RECT = koffi.struct("RECT", { left: "int32", top: "int32", right: "int32", bottom: "int32" });
const POINT = koffi.struct("POINT", { x: "int32", y: "int32" });
const WINDOWPLACEMENT = koffi.struct("WINDOWPLACEMENT", {
  length: "uint32",
  flags: "uint32",
  showCmd: "uint32",
  ptMinPosition: POINT,
  ptMaxPosition: POINT,
  rcNormalPosition: RECT,
});

const IsZoomed = user32 ? user32.func("bool __stdcall IsZoomed(intptr hWnd)") : null;
const IsWindow = user32 ? user32.func("bool __stdcall IsWindow(intptr hWnd)") : null;
const ShowWindow = user32 ? user32.func("bool __stdcall ShowWindow(intptr hWnd, int cmd)") : null;
const GetWindowRect = user32 ? user32.func("bool __stdcall GetWindowRect(intptr hWnd, _Out_ RECT *rect)") : null;
const GetWindowPlacement = user32 ? user32.func("bool __stdcall GetWindowPlacement(intptr hWnd, _Inout_ WINDOWPLACEMENT *wp)") : null;
const SetWindowPlacement = user32 ? user32.func("bool __stdcall SetWindowPlacement(intptr hWnd, WINDOWPLACEMENT *wp)") : null;
const DwmGetFrameBounds = dwmapi ? dwmapi.func("DwmGetWindowAttribute", "int", ["intptr", "uint32", koffi.out(koffi.pointer(RECT)), "uint32"]) : null;

const SW_RESTORE = 9;
const SWP_NOZORDER = 0x0004;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A window we made narrower: how it was before (to put back) and the frame we gave it (to tell whether it is still there). */
export interface Fitted {
  hwnd: number;
  before: unknown;
  placed: Box;
}

const rectOf = (hwnd: number): Box | null => {
  const r = { left: 0, top: 0, right: 0, bottom: 0 };
  return GetWindowRect?.(hwnd, r) ? r : null;
};

const sameBox = (a: Box, b: Box, tolerance = 3) =>
  Math.abs(a.left - b.left) <= tolerance && Math.abs(a.top - b.top) <= tolerance && Math.abs(a.right - b.right) <= tolerance && Math.abs(a.bottom - b.bottom) <= tolerance;

/**
 * Shrink every maximized app window on the panel's monitor so it fills `target` (physical pixels: the screen up to the panel).
 * Returns the windows that were changed. Windows that cannot be moved are skipped without any error.
 */
export function fitMaximizedBeside(panel: number, target: Box): Fitted[] {
  if (!SetWindowPos || !IsZoomed || !ShowWindow || !GetWindowPlacement) return [];
  const panelMonitor = MonitorFromWindow?.(panel, MONITOR_DEFAULTTONEAREST) ?? 0;
  const fitted: Fitted[] = [];
  let hwnd = GetTopWindow?.(0) ?? 0;
  const candidates: number[] = [];
  for (let i = 0; hwnd && i < 500; i++) {
    if (hwnd !== panel) {
      const cls = className(hwnd);
      if (cls === "Progman") break;
      if (isAppWindow(hwnd, cls) && IsZoomed(hwnd) && (MonitorFromWindow?.(hwnd, MONITOR_DEFAULTTONEAREST) ?? 0) === panelMonitor) candidates.push(hwnd);
    }
    hwnd = GetWindow?.(hwnd, GW_HWNDNEXT) ?? 0;
  }
  for (const win of candidates) {
    try {
      const before = { length: 44, flags: 0, showCmd: 0, ptMinPosition: { x: 0, y: 0 }, ptMaxPosition: { x: 0, y: 0 }, rcNormalPosition: { left: 0, top: 0, right: 0, bottom: 0 } };
      if (!GetWindowPlacement(win, before)) continue;
      ShowWindow(win, SW_RESTORE);
      if (IsZoomed(win)) continue; // would not restore (an administrator app, for instance): leave it alone
      const outer = rectOf(win);
      const seen = { left: 0, top: 0, right: 0, bottom: 0 };
      if (!outer || DwmGetFrameBounds?.(win, DWMWA_EXTENDED_FRAME_BOUNDS, seen, 16) !== 0) {
        SetWindowPlacement?.(win, before);
        continue;
      }
      // Windows draws an invisible border around a window; ask for the outer frame that makes the VISIBLE part fill the target.
      const x = target.left - (seen.left - outer.left);
      const y = target.top - (seen.top - outer.top);
      const w = target.right - target.left + (outer.right - outer.left - (seen.right - seen.left));
      const h = target.bottom - target.top + (outer.bottom - outer.top - (seen.bottom - seen.top));
      if (!SetWindowPos(win, 0, x, y, w, h, SWP_NOZORDER | SWP_NOACTIVATE)) {
        SetWindowPlacement?.(win, before);
        continue;
      }
      const placed = rectOf(win);
      if (placed) fitted.push({ hwnd: win, before, placed });
    } catch {
      // a window that disappears or misbehaves must never break the break
    }
  }
  return fitted;
}

/** Put windows back as they were (maximized again). A window the person has since moved, resized, minimized or closed is left alone. */
export function restoreFitted(list: Fitted[]): void {
  for (const f of list) {
    try {
      if (!IsWindow?.(f.hwnd) || IsIconic?.(f.hwnd) || IsZoomed?.(f.hwnd)) continue;
      const now = rectOf(f.hwnd);
      if (now && sameBox(now, f.placed)) SetWindowPlacement?.(f.hwnd, f.before as never);
    } catch {
      // ignore
    }
  }
}
