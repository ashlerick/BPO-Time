// The two numbers on the panel, from the portal's device endpoint:
//   GET /hr/device-counts  ->  { notifications: unread, todos: open and due today or overdue }
// null means "not known" (offline, or the portal has no such endpoint yet), which the panel shows as "-".
// A real zero stays 0.
import * as auth from "./auth";

export interface Counts {
  notifications: number | null;
  todos: number | null;
}

const REFRESH_MS = 60_000;
const UNKNOWN: Counts = { notifications: null, todos: null };

let current: Counts = UNKNOWN;
const listeners: Array<(c: Counts) => void> = [];
let timer: ReturnType<typeof setInterval> | null = null;

export function get(): Counts {
  return current;
}

export function onChange(fn: (c: Counts) => void): void {
  listeners.push(fn);
}

function set(next: Counts): void {
  current = next;
  listeners.forEach((fn) => fn(next));
}

const asCount = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** Pull the counts. Offline keeps what we have; any other failure shows "-" rather than a wrong number. */
export async function refresh(): Promise<void> {
  const r = await auth.api("/hr/device-counts", "GET");
  // A reply that lands after this PC was signed out must not put someone's data back on the panel.
  if (auth.getState().status !== "signedIn") return;
  if (r.kind === "ok") {
    const body = r.body as { notifications?: unknown; todos?: unknown };
    set({ notifications: asCount(body.notifications), todos: asCount(body.todos) });
  } else if (r.kind === "error") {
    set(UNKNOWN);
  }
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
    set(UNKNOWN);
  }
}
