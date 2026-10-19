# BPO Time: desktop sidebar app (plan)

> This is the app's own repository. The portal it talks to lives at
> https://github.com/ashlerick/BPO-Portal.

Status: **built and shipping (version 0.1.1, Windows).** Written 2026-10-16 from an investigation in the portal
repo; rewritten 2026-10-19 to describe what is built and what was decided. Where an older idea was dropped,
this file says so. It sits alongside the portal's own plans
([bpo_plan.md](https://github.com/ashlerick/BPO-Portal/blob/main/bpo_plan.md) and
[new_plan.md](https://github.com/ashlerick/BPO-Portal/blob/main/new_plan.md)).

## 1. What it is

A small Windows program that stays on the desktop as a slim panel on the right edge (like the session
widget on internet-shop PCs). It is where people **clock in and out and take breaks and lunch**, and it gives
quick access to the portal. It signs in through the portal and writes to the same attendance record as the
portal's Attendance page, so the PC and the portal always show the same numbers.

It is **not** a lock screen. It never blocks or locks the PC. It has **no idle detection**.

## 2. Why

The portal could only record one check-in and one check-out a day and had no breaks. Clocking now happens
in this app (the portal's own check-in and check-out were removed), with breaks and lunch, the shift and
lateness, and a feed of announcements, so time management and the portal are one tap away.

## 3. What the panel shows (built)

- [x] Name and status: Clocked in / On break.
- [x] Time worked today (large), and this week's total.
- [x] Clock in, and a slide to clock out (so it cannot be pressed by accident) with a countdown.
- [x] Breaks and lunch: morning break, lunch, afternoon break, with grace and a fixed 50-minute deduction
  (rules in the [README](../README.md)).
- [x] Today's shift, and whether the person is on time or late, and how long is left.
- [x] Unread notifications and to-dos due today.
- [x] Highlighted announcements (with "Got it" where the portal needs an acknowledgement) and birthdays.
- [x] Quick links, and a button that opens the portal.
- [x] Copies "Good morning, clock in!" / "Good night, clock out!" to the clipboard when clocking (switchable).
- [x] Light and dark theme (this app's own choice, remembered on the PC).
- [x] Tray icon, starts with Windows, single instance, auto-update.
- [ ] Offline queue: not built. With no connection a clock action is refused with a clear message and nothing is
  recorded; the panel keeps the last known numbers.

## 4. Options considered

| Option | What it does | Install | Effort |
|---|---|---|---|
| A. Breaks and lunch in the portal | Manual break start/stop; worked = out minus in minus breaks | No | A few days |
| B. Idle-aware timer in the browser | Heartbeat each minute and the browser's idle detection; only while the tab is open | No | About a week |
| **C. Desktop panel (chosen, built)** | Always on the desktop, auto-start, auto-update | Yes | 2 to 3 weeks |
| D. Buy (Clockify, Toggl, Hubstaff, Time Doctor) | Third-party tracking with data import | Yes | Days, plus a monthly fee per user |

Option C was chosen. Idle tracking (B, and the idle part of C) was dropped: time only.

## 5. Design

### 5.1 Technology

- **Electron** (TypeScript, same stack as the portal), with `koffi` for the few Windows calls and
  `electron-updater` for updates. Tauri was the lighter alternative and was not used.
- No idle detection: the app does not measure keyboard or mouse activity (decided 2026-10-19).
- Lives in **its own repository** (`ashlerick/BPO-Time`). The portal repo keeps only what the app talks to:
  the backend endpoints, the Launch App button and the Settings > Desktop app list.
- The two repos are tied together only by the API (section 5.5). Changing an endpoint means checking the
  other repo.

### 5.2 Docking (done)

- A frameless window on the right edge, **sent to the bottom of the window stack**: above the desktop, below
  other apps. Desktop icons stay put and apps can sit on top of it.
- Tried and replaced: an always-on-top window, then true docking as a Windows AppBar (reserving screen
  space). The bottom-most widget won so that icons stay put (commit 161c32a).
- It stays above the desktop during Show desktop. The tray's Show panel raises it above apps until another
  app is used; Minimize sends it behind apps.

### 5.3 Sign-in: "Launch App" from the portal (done)

The app never sees the user's password. The portal starts the handoff:

1. On the portal, the person presses **Launch App (BETA)**. The portal asks its API for a one-time code
   (`POST /hr/device-code`, needs the portal login, valid 60 seconds).
2. The portal opens `bpotime://connect?code=<code>`. Windows starts the app, or brings the running one forward.
3. The app swaps the code for a **device token** (`POST /hr/device-token`, with the PC's name). The code is
   spent at once; a reused or expired code gets a readable error.
4. The app calls `GET /hr/device-me` to show the person's name. If the code could not be fetched, the portal
   opens plain `bpotime://open` and the app asks the person to press Launch App from the portal.

Rules:

- The login token is **never** placed in a URL. Only the one-time code travels in the link.
- The device token is separate from the browser session, accepted only by the device endpoints, stored
  hashed on the server and revocable. A 401 means "drop the token and ask to Launch App again" (revoked or
  account deactivated).
- On the PC it is stored encrypted with Windows DPAPI (Electron `safeStorage`). If Windows cannot encrypt it,
  it is kept in memory for that run only, never in plain text.
- The app uses its own constant for the API base and ignores any address in a link. A test server can be
  named only when running from source.
- Dropped: the earlier "Allow BPO Time on this PC?" page (`/connect-app`), the loopback address and the typed
  short-code fallback. They were not needed.

### 5.4 Sync (done, simpler than first planned)

- The panel talks to the portal directly: today's record and clocking actions (`/hr/device-today`,
  `/hr/device-clock-in`, `/hr/device-clock-out`, `/hr/device-break-start`, `/hr/device-break-end`), the
  signed-in person and device (`/hr/device-me`), counts (`/hr/device-counts`) and the announcements and
  birthdays feed (`/hr/device-feed`).
- The **server's clock** is the reference (every reply carries `serverNow`), so changing the PC clock cannot
  inflate hours.
- Clocking writes the same attendance records the portal uses, so late and undertime reporting and the weekly
  tracker keep working.
- Dropped: uploading 5-minute active or idle blocks (and the `time_blocks` table), because there is no idle
  tracking.

### 5.5 Backend (done, in the portal repo)

- The endpoints above sit on the portal's `hr` dispatcher (the Vercel Hobby plan allows 12 functions and the
  portal is at 12). Treat those paths as the contract.
- Device management for the person: `GET /hr/devices` and `DELETE /hr/devices/:id`, shown under Settings >
  Desktop app.
- Break rules live in one file, `backend/lib/breaks.ts`.
- Not built: a separate `/connect-app` page and the `time_blocks` table.

### 5.6 Download and open from the portal (done)

- A **Launch App (BETA)** button sits at the top-right of the portal next to the clocks, on a PC only (hidden
  on phones, tablets, non-Windows computers and inside the app itself). It is live
  (`DESKTOP_APP_READY = true` in `DesktopAppButton.tsx`). Remove the Beta badge when the app is released
  properly.
- It starts the app through the `bpotime://` link, which the installer (and the app on first run) registers.
  If the app does not open within about two seconds the button asks "Didn't open?" with **Download** and
  **Try again**. A web page cannot ask whether a program is installed, so a miss is a question, not an error.
- Download link: `https://github.com/ashlerick/BPO-Time/releases/latest/download/BPO-Time-Setup.exe`.
- The first time, Chrome and Edge ask "Open BPO Time?" with an "Always allow" box. That is the browser's rule.
- **Security:** a link is text from any web page. The app honours only a short allowlist of actions (`open`,
  and `connect` with a code of the expected shape) and never uses anything else in the link to open files,
  run commands or visit addresses.
- Testing before a release: `?desktop=on` shows the button in that browser, `?desktop=off` hides it.

### 5.7 Distribution (done)

- Windows installer built with electron-builder, installs for the current user (no admin rights), published
  to the app repo's GitHub Releases. Running apps check for a newer version after about 15 seconds and then
  every 4 hours, download it quietly and install it at the next restart. Steps: [release.md](./release.md).
- **No code-signing certificate yet.** Windows SmartScreen shows "Windows protected your PC" on first install
  (More info, then Run anyway). A certificate (about USD 100 to 400 a year) removes it and should be bought
  before a wide rollout.

## 6. Privacy and policy

- Covered by the Philippines Data Privacy Act (RA 10173): written policy, notice to employees,
  proportionate purpose. This document is not legal advice.
- The app records **clock-in, clock-out and break times only**. No idle tracking, screenshots, keystroke
  logging, window titles or app names unless there is a strong, documented reason.
- The person sees their own record in the panel and on the portal's Attendance page.
- The portal records the IP at clock-in; employees should be told (see the note in the portal README).

## 7. Milestones

1. [x] App shell, sign-in from the portal, clock in and out, today's total on screen and in the portal.
2. [x] Breaks and lunch. (The offline queue and idle detection were dropped.)
3. [x] Bottom-most widget, tray, auto-start, installer, auto-update.
4. [x] Shift and lateness, announcements, birthdays, quick links, themes (0.1.1).
5. [ ] Code-signing certificate.

## 8. Risks

- PCs on VPN or shared IPs make the IP check unreliable (already true today).
- Locked-down PCs may not allow installation, or may block the `bpotime://` link in the browser.
- The installer is unsigned, so the first install shows a SmartScreen warning.
- Windows only: Macs are not supported.
- Employee trust: roll out with the policy and the visible record of what is recorded, not silently.

## 9. Questions and answers (decided 2026-10-19)

1. [x] **What is it for?** Time management and easy access to the portal.
2. [x] **Windows only, or Macs too?** Windows only.
3. [x] **How many people, and where?** Around 20 or more.
4. [x] **Dock (reserve space) or float on top?** Done: a bottom-most desktop widget, so icons stay put and
   apps can sit on top (commit 161c32a).
5. [x] **Is a PC lock (shop-style session control) in scope?** No. The app never locks or blocks the PC.
6. [x] **Does anything beyond time belong on the panel?** Yes, and built: announcements, birthdays, quick
   links, shift status, "Got it" acknowledgements.
7. [x] **Idle detection?** No. It was never built and is dropped from the plan.

## 10. Decision

- [x] Build the Windows panel (Electron). Shipped as version 0.1.1 with installer and auto-update.
- [x] Time only: clock in and clock out, no idle, no screenshots, no keystrokes, no window titles.
- [x] No PC lock.
