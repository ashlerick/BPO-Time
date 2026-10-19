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
  /** Breaks and lunch so far today (rules: README, "Breaks and lunch"). */
  breaks: BreakEntry[];
  /** Today's holiday (by name), or null on an ordinary day. Set on the portal by HR; national holidays are prefilled. */
  holiday: { name: string } | null;
  /** True when today's attendance counts as a working holiday (clocked in on a holiday). */
  workingHoliday: boolean;
  /** Seconds allowed per slot, from the portal. */
  breakAllowances: Record<BreakSlot, number>;
  /** Today's shift, or null when none is assigned. The portal works out lateness with the same function as HR's report. */
  shift: {
    name: string;
    startAt: string;
    endAt: string;
    graceMinutes: number;
    timezone: string;
    workDay: boolean;
    lateMinutes: number;
  } | null;
}

export type BreakSlot = "morning" | "lunch" | "afternoon";

export interface BreakEntry {
  slot: BreakSlot;
  status: "taken" | "not_taken";
  startedAt: string | null;
  endedAt: string | null;
  overSeconds: number;
}

const REFRESH_MS = 60_000;

/** What the panel is given: today's record, or why there is none ("error"), or nothing yet. */
export type AttendanceState = Attendance | { error: string } | null;

let current: AttendanceState = null;
const listeners: Array<(a: AttendanceState) => void> = [];
let timer: ReturnType<typeof setInterval> | null = null;

export function get(): AttendanceState {
  return current;
}

export function onChange(fn: (a: AttendanceState) => void): void {
  listeners.push(fn);
}

function set(next: AttendanceState): void {
  current = next;
  listeners.forEach((fn) => fn(next));
}

/** Pull today's record. Offline keeps what we have: that is a normal state, not an error. */
export async function refresh(): Promise<void> {
  const r = await auth.api("/hr/device-today", "GET");
  // A reply that lands after this PC was signed out must not put someone's data back on the panel.
  if (auth.getState().status !== "signedIn") return;
  if (r.kind === "ok") set(r.body as Attendance);
  else if (r.kind === "error" && auth.getState().status === "signedIn") set({ error: r.message });
}

async function act(path: string, success: string, body?: unknown): Promise<{ ok: boolean; message: string }> {
  const r = await auth.api(path, "POST", body);
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

export function startBreak(slot: BreakSlot) {
  const name = { morning: "Break 1", lunch: "Lunch", afternoon: "Break 2" }[slot];
  return act("/hr/device-break-start", `${name} started.`, { slot });
}

export function endBreak() {
  return act("/hr/device-break-end", "Break ended. Welcome back.");
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
  } else if (!signedIn) {
    // Whenever nobody is signed in (including at startup), nothing of anyone's is kept.
    if (timer) clearInterval(timer);
    timer = null;
    set(null);
  }
}
