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
