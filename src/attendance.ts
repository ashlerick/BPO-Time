// Today's attendance through the portal's device endpoints (contract v1, hr dispatcher):
//   GET  /hr/device-today      POST /hr/device-clock-in      POST /hr/device-clock-out
// They read and write the same attendance record as the portal's Attendance page. The server's clock is
// the reference: every reply carries serverNow, and the panel counts from that, not from the PC clock.
import * as auth from "./auth";

export interface Attendance {
  checkedIn: boolean;
  checkedOut: boolean;
  status: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  serverNow: string;
}

const REFRESH_MS = 60_000;

let current: Attendance | null = null;
const listeners: Array<(a: Attendance | null) => void> = [];
let timer: ReturnType<typeof setInterval> | null = null;

export function get(): Attendance | null {
  return current;
}

export function onChange(fn: (a: Attendance | null) => void): void {
  listeners.push(fn);
}

function set(next: Attendance | null): void {
  current = next;
  listeners.forEach((fn) => fn(next));
}

/** Pull today's record. Offline keeps what we have: that is a normal state, not an error. */
export async function refresh(): Promise<void> {
  const r = await auth.api("/hr/device-today", "GET");
  if (r.kind === "ok") set(r.body as Attendance);
}

async function act(path: string, success: string): Promise<{ ok: boolean; message: string }> {
  const r = await auth.api(path, "POST");
  if (r.kind === "ok") {
    set(r.body as Attendance);
    return { ok: true, message: success };
  }
  if (r.kind === "offline") {
    return { ok: false, message: "Can't reach the portal right now, so nothing was recorded. Check your connection and try again." };
  }
  return { ok: false, message: r.message };
}

export function clockIn() {
  return act("/hr/device-clock-in", "Clocked in. Your time is now being counted.");
}

export function clockOut() {
  return act("/hr/device-clock-out", "Clocked out. See you next shift.");
}

/** Start and stop polling with the sign-in state. */
export function follow(state: auth.AuthState): void {
  const signedIn = state.status === "signedIn";
  if (signedIn && !timer) {
    void refresh();
    timer = setInterval(() => void refresh(), REFRESH_MS);
  } else if (!signedIn && timer) {
    clearInterval(timer);
    timer = null;
    set(null);
  }
}
