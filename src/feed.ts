// Announcements and today's birthdays for the panel, from the portal's device endpoint:
//   GET /hr/device-feed  ->  { announcements: [{ id, title, category, preview, publishAt }], birthdays: [{ name, firstName, isMe }] }
// Only a short preview of each announcement comes down; the full text stays on the portal.
// Offline keeps what we have; a portal without the endpoint just means an empty feed.
import * as auth from "./auth";

export interface Feed {
  announcements: Array<{ id: string; title: string; category: string; preview: string; publishAt: string; featured?: boolean; needsAck?: boolean }>;
  birthdays: Array<{ name: string; firstName: string; isMe: boolean }>;
}

const REFRESH_MS = 5 * 60_000;
const EMPTY: Feed = { announcements: [], birthdays: [] };

let current: Feed = EMPTY;
const listeners: Array<(f: Feed) => void> = [];
let timer: ReturnType<typeof setInterval> | null = null;

export function get(): Feed {
  return current;
}

export function onChange(fn: (f: Feed) => void): void {
  listeners.push(fn);
}

function set(next: Feed): void {
  current = next;
  listeners.forEach((fn) => fn(next));
}

export async function refresh(): Promise<void> {
  const r = await auth.api("/hr/device-feed", "GET");
  // A reply that lands after this PC was signed out must not put someone's data back on the panel.
  if (auth.getState().status !== "signedIn") return;
  if (r.kind === "ok") {
    const body = r.body as Partial<Feed>;
    set({
      announcements: Array.isArray(body.announcements) ? body.announcements : [],
      birthdays: Array.isArray(body.birthdays) ? body.birthdays : [],
    });
  } else if (r.kind === "error") {
    set(EMPTY);
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
    set(EMPTY);
  }
}
