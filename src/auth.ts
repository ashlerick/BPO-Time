// Device sign-in (portal API v1, see desktop_app_plan.md section 5.5a in the portal repo).
// The app never sees a password. The portal's "Launch App" button hands over a one-time code in a
// bpotime://connect link; we swap it for a device token and keep that token encrypted with Windows DPAPI.
import { app, safeStorage } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PROD_API_BASE = "https://backend-xi-six-41.vercel.app/api";
// Our own constant. Never taken from a link. A test server may be named only when running from source.
const API_BASE = !app.isPackaged && process.env.BPO_API_BASE ? process.env.BPO_API_BASE : PROD_API_BASE;

const CODE_PATTERN = /^[A-Za-z0-9_-]{20,100}$/;
const TIMEOUT_MS = 10_000;

export interface PortalUser {
  id: string;
  name: string;
  firstName: string;
}

export type AuthState =
  | { status: "checking" }
  | { status: "signedOut"; message?: string }
  | { status: "signedIn"; user: PortalUser; offline?: boolean };

let token: string | null = null;
let state: AuthState = { status: "checking" };
const listeners: Array<(s: AuthState) => void> = [];

export function getState(): AuthState {
  return state;
}

export function onChange(fn: (s: AuthState) => void): void {
  listeners.push(fn);
}

function set(next: AuthState): void {
  state = next;
  listeners.forEach((fn) => fn(next));
}

function tokenFile(): string {
  return path.join(app.getPath("userData"), "device-token.bin");
}

function saveToken(value: string): boolean {
  // No plain-text fallback: if Windows cannot encrypt it, it is kept in memory for this run only.
  if (!safeStorage.isEncryptionAvailable()) return false;
  fs.writeFileSync(tokenFile(), safeStorage.encryptString(value));
  return true;
}

function loadToken(): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(fs.readFileSync(tokenFile()));
  } catch {
    return null;
  }
}

function clearToken(): void {
  token = null;
  try {
    fs.unlinkSync(tokenFile());
  } catch {
    // nothing stored
  }
}

async function call(pathname: string, init: RequestInit): Promise<Response> {
  return fetch(API_BASE + pathname, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function messageOf(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message || fallback;
  } catch {
    return fallback;
  }
}

export type ApiResult = { kind: "ok"; status: number; body: any } | { kind: "error"; status: number; message: string } | { kind: "offline" };

/**
 * Call a device endpoint with this PC's token. A 401 means the portal has disconnected this PC
 * (revoked, or account deactivated): drop the token and go back to "Connect your account".
 */
export async function api(pathname: string, method: "GET" | "POST"): Promise<ApiResult> {
  if (!token) return { kind: "error", status: 401, message: "This PC is not connected. Press Launch App in the portal." };
  try {
    const res = await call(pathname, { method, headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      const message = await messageOf(res, "This PC is no longer connected. Press Launch App in the portal to connect again.");
      clearToken();
      set({ status: "signedOut", message });
      return { kind: "error", status: 401, message };
    }
    if (!res.ok) return { kind: "error", status: res.status, message: await messageOf(res, "The portal could not do that. Try again in a moment.") };
    return { kind: "ok", status: res.status, body: await res.json() };
  } catch {
    return { kind: "offline" };
  }
}

/** On startup: sign back in with the stored token. Offline is a normal state, not a sign-out. */
export async function restore(): Promise<void> {
  token = loadToken();
  if (!token) return set({ status: "signedOut" });
  await verify();
}

async function verify(): Promise<void> {
  if (!token) return set({ status: "signedOut" });
  try {
    const res = await call("/hr/device-me", { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      const message = await messageOf(res, "This PC is no longer connected. Press Launch App in the portal to connect again.");
      clearToken();
      return set({ status: "signedOut", message });
    }
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { user: PortalUser };
    set({ status: "signedIn", user: body.user });
  } catch {
    // Cannot reach the portal. Keep the token; show who this was last time if we know.
    const last = state.status === "signedIn" ? state.user : null;
    if (last) set({ status: "signedIn", user: last, offline: true });
    else set({ status: "signedOut", message: "Can't reach the portal right now. Check your internet connection; the app will try again." });
  }
}

/** A bpotime://connect link arrived. Returns a message the UI can show as a toast. */
export async function connect(code: string | null): Promise<{ ok: boolean; message: string }> {
  if (!code || !CODE_PATTERN.test(code)) {
    return { ok: false, message: "That sign-in link was not valid. Press Launch App in the portal again." };
  }
  const before = state;
  set({ status: "checking" });
  try {
    const res = await call("/hr/device-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, deviceName: os.hostname() }),
    });
    if (!res.ok) {
      const message = await messageOf(res, "The portal refused the sign-in. Press Launch App in the portal again.");
      set(before.status === "checking" ? { status: "signedOut", message } : before);
      return { ok: false, message };
    }
    const body = (await res.json()) as { token: string; user: PortalUser };
    token = body.token;
    const stored = saveToken(token);
    set({ status: "signedIn", user: body.user });
    return {
      ok: true,
      message: stored
        ? `Signed in as ${body.user.name}.`
        : `Signed in as ${body.user.name}. This PC cannot encrypt the sign-in, so you will need to press Launch App again after a restart.`,
    };
  } catch {
    const message = "Can't reach the portal right now. Check your internet connection and press Launch App again.";
    set(before.status === "checking" ? { status: "signedOut", message } : before);
    return { ok: false, message };
  }
}

export function signOut(): void {
  clearToken();
  set({ status: "signedOut", message: "Signed out of this PC. Press Launch App in the portal to connect again." });
}
