// Window z-order helper (Windows only; no-op elsewhere). Electron has no "send to back".
import koffi from "koffi";

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
