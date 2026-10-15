// Windows AppBar docking (the same mechanism the taskbar uses): reserves a strip of the screen edge so
// maximised windows stop at it. Windows only; every call is a no-op elsewhere.
import koffi from "koffi";

const ABM_NEW = 0;
const ABM_REMOVE = 1;
const ABM_QUERYPOS = 2;
const ABM_SETPOS = 3;
const ABE_RIGHT = 2;
const CALLBACK_MESSAGE = 0x8001; // WM_APP + 1; we do not use the notifications yet

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const RECT = koffi.struct("RECT", { left: "int32", top: "int32", right: "int32", bottom: "int32" });
const APPBARDATA = koffi.struct("APPBARDATA", {
  cbSize: "uint32",
  hWnd: "intptr",
  uCallbackMessage: "uint32",
  uEdge: "uint32",
  rc: RECT,
  lParam: "intptr",
});

const shell32 = process.platform === "win32" ? koffi.load("shell32.dll") : null;
const SHAppBarMessage = shell32
  ? shell32.func("uintptr __stdcall SHAppBarMessage(uint32 dwMessage, _Inout_ APPBARDATA *pData)")
  : null;

function call(message: number, hwnd: number, rc: Rect): Rect {
  const data = {
    cbSize: koffi.sizeof(APPBARDATA),
    hWnd: hwnd,
    uCallbackMessage: CALLBACK_MESSAGE,
    uEdge: ABE_RIGHT,
    rc: { ...rc },
    lParam: 0,
  };
  SHAppBarMessage?.(message, data);
  return data.rc;
}

export function registerAppBar(hwnd: number): void {
  call(ABM_NEW, hwnd, { left: 0, top: 0, right: 0, bottom: 0 });
}

/** Reserve `width` physical pixels on the right of `monitor` and return the rectangle Windows granted. */
export function setAppBarWidth(hwnd: number, monitor: Rect, width: number): Rect {
  let rc = call(ABM_QUERYPOS, hwnd, { ...monitor });
  rc = { ...rc, left: rc.right - width };
  return call(ABM_SETPOS, hwnd, rc);
}

export function removeAppBar(hwnd: number): void {
  call(ABM_REMOVE, hwnd, { left: 0, top: 0, right: 0, bottom: 0 });
}
