// What "Synced" means on the panel: the last time each part of it (today's record, the counts, the announcements) was successfully
// read from the portal. The label used to be fixed text; now it comes from here.
//   synced    every part was read within the last few minutes: "Synced 12:26 PM"
//   updating  reading now, and it has been a while (or nothing has loaded yet)
//   offline   the last try could not reach the portal: "Offline, last synced 12:20 PM"
//   stale     the portal answered with an error, or nothing has been read for a few minutes
// A quick refresh of something already fresh does not flash "Updating".

export type SyncSource = "attendance" | "counts" | "feed";
export interface SyncState {
  state: "synced" | "updating" | "offline" | "stale";
  /** When the oldest part was last read (ms since 1970), or null if some part has never loaded. */
  at: number | null;
}

const SOURCES: SyncSource[] = ["attendance", "counts", "feed"];
const STALE_MS = 3 * 60_000;

const lastOk: Partial<Record<SyncSource, number>> = {};
let lastResult: "ok" | "error" | "offline" = "ok";
let inFlight = 0;
let shown = "";
const listeners: Array<(s: SyncState) => void> = [];
let ticker: ReturnType<typeof setInterval> | null = null;

export function snapshot(): SyncState {
  const times = SOURCES.map((s) => lastOk[s]);
  const loaded = times.every((t): t is number => typeof t === "number");
  const at = loaded ? Math.min(...(times as number[])) : null;
  const old = at === null || Date.now() - at > STALE_MS;
  if (lastResult === "offline") return { state: "offline", at };
  if (inFlight > 0 && old) return { state: "updating", at };
  if (old) return { state: lastResult === "error" || at !== null ? "stale" : "updating", at };
  return { state: "synced", at };
}

function emit(): void {
  const s = snapshot();
  const key = `${s.state}|${s.at ?? ""}`;
  if (key === shown) return;
  shown = key;
  listeners.forEach((fn) => fn(s));
}

export function onChange(fn: (s: SyncState) => void): void {
  listeners.push(fn);
  // Re-check now and then, so "synced" turns into "stale" by itself when nothing arrives.
  ticker ??= setInterval(emit, 15_000);
}

/** A read from the portal is starting. */
export function begin(): void {
  inFlight++;
  emit();
}

/** A read finished: ok, the portal answered with an error, or it could not be reached. */
export function done(source: SyncSource, kind: "ok" | "error" | "offline"): void {
  inFlight = Math.max(0, inFlight - 1);
  lastResult = kind;
  if (kind === "ok") lastOk[source] = Date.now();
  emit();
}

/** Nobody is signed in: forget everything that was read. */
export function reset(): void {
  for (const s of SOURCES) delete lastOk[s];
  inFlight = 0;
  lastResult = "ok";
  emit();
}
