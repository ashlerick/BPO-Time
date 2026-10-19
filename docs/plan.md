# BPO Time: desktop sidebar app (plan)

> This is the app's own repository. The portal it talks to lives at
> https://github.com/ashlerick/BPO-Portal.

Status: **built and shipping (version 0.1.1, Windows).** Written 2026-10-16 from an investigation in the portal
repo, where this document was first kept; updated 2026-10-19 with the decisions below. Parts of the design
sections are the original plan: section 9 and 10 are the current truth, and **there is no idle detection**. It sits alongside the portal's own plans
([bpo_plan.md](https://github.com/ashlerick/BPO-Portal/blob/main/bpo_plan.md) and
[new_plan.md](https://github.com/ashlerick/BPO-Portal/blob/main/new_plan.md)).

## 1. What it is

A small Windows program that stays on screen as a slim panel docked to the edge of the desktop (like
the session widget on internet-shop PCs). It tracks work time, signs in through the portal, and syncs
with the portal so the PC and the Attendance page always show the same numbers.

It is **not** a lock screen. It never blocks the PC.

## 2. Why

Today attendance is one record a day: check-in time, check-out time and the IP of each. The employee is
checked in automatically at login and presses Check Out in the header. The portal cannot tell a working
hour from an hour away from the desk, and has no breaks.

## 3. What the panel shows

- Name and status: Clocked in / On break.
- Time worked today (large), and this week's total.
- Buttons: Clock in, and a slide to clock out (so it cannot be pressed by accident). No break or lunch buttons.
- Today's shift and whether the person is on time (from the existing shift schedules).
- Unread notifications and to-dos due today.
- A link that opens the portal.
- A sync indicator: green when everything is uploaded, amber when queued offline.
- Collapses to a thin bar; tray icon; starts with Windows.

## 4. Options considered

| Option | What it does | Install | Effort |
|---|---|---|---|
| A. Breaks and lunch in the portal | Manual break start/stop; worked = out minus in minus breaks | No | A few days |
| B. Idle-aware timer in the browser | Heartbeat each minute and the browser's idle detection; only while the tab is open; Chrome and Edge only | No | About a week |
| **C. Desktop panel (this plan)** | Real system idle, offline queue, auto-start, sync | Yes | 2 to 3 weeks |
| D. Buy (Clockify, Toggl, Hubstaff, Time Doctor) | Third-party tracking with data import | Yes | Days, plus a monthly fee per user |

Recommendation: do A and B first (no install, immediate accuracy), then C if they are not enough.
Buy (D) instead if the goal is full monitoring with reports.

## 5. Design

### 5.1 Technology

- **Electron** (TypeScript, same stack as the portal; can reuse components and the API client).
  Alternative: Tauri (about 10 MB against about 100 MB, but Rust and more setup).
- No idle detection: the app does not measure keyboard or mouse activity (decided 2026-10-19).
- Lives in **its own repository** (working name `BPO-Time`), not in this one. The portal repo keeps only
  what the app talks to: the backend endpoints, the "Allow this PC?" page and the download button.
- The two repos are tied together only by the API (section 5.5). Changing an endpoint here means
  checking the app's repo, so the API for the app should be kept small, versioned (for example
  `/api/device/v1/...`) and documented in this file.

### 5.2 Docking

- **Phase 1:** an always-on-top, frameless window pinned to the right (or left) edge. It overlaps the
  edge of other windows.
- **Phase 2:** true docking, which reserves screen space like the taskbar so maximised windows stop at
  its edge (a small native Windows call).

### 5.3 Sign-in: "Login with portal"

The app never sees the user's password. It uses the browser-handoff pattern (as in Zoom, Slack, Spotify):

1. The app generates a random secret and its hash, and starts a one-time sign-in request with the portal.
2. It opens the portal's `/connect-app` page in the default browser.
3. The person signs in as usual (or is already signed in) and sees "Allow BPO Time on this PC
   (DESKTOP-ABC)?" with Allow and Cancel.
4. On Allow, the portal returns a **short-lived, single-use code** to the app, either to a local loopback
   address or the app's own link scheme (`bpotime://`). Only those two destinations are accepted.
5. The app exchanges the code plus its secret for a **device token** over a direct connection. The
   exchange only works for the app that started the request.

Rules:

- The login token is **never** placed in a URL. Only the one-time code travels through the browser.
- The device token is separate from the browser session, scoped to time tracking only (cannot reach
  payroll, HR pages or other people's data), and revocable.
- It is stored in the Windows credential store, not a plain file.
- It stops working immediately when the account is deactivated, or when the device is revoked.
- Fallback for locked-down PCs: the app shows a short code that the person types at `/connect` on
  another device (same security, different handoff).

### 5.4 Sync

- Clock in and clock out go to the portal API (`/hr/device-clock-in`, `/hr/device-clock-out`).
- The **server's clock** is the reference, so changing the PC clock cannot inflate hours.
- The app pulls today's and this week's totals from the same data, so the PC and the Attendance page
  agree.
- Clock in or out and break actions go through the same attendance records, so existing late and
  undertime reporting and the weekly tracker keep working.

### 5.5 Backend changes

- New endpoints, folded into existing dispatchers (the Vercel Hobby plan allows 12 functions and we are
  at 12): start sign-in, approve, exchange code, list or revoke devices, upload time blocks, today's
  summary.
- New tables: `devices` (name, last seen, revoked) and `time_blocks` (employee, start, end, state).
  Five-minute blocks keep volume to a few thousand rows per person per month.
- New portal pages: `/connect-app` (the Allow screen) and "My devices" under Settings.
- The 10-second function limit and the free database tier are not a problem at this volume (one small
  upload per person every few minutes).

### 5.6 Download button in the portal

- A **Desktop app** button sits at the top-right of the portal next to the clocks, on a PC only (hidden
  on phones and tablets, on non-Windows computers, and inside the app itself).
- It downloads the installer from the **app repo's** GitHub Releases (`BPO-Time-Setup.exe`).
- The button carries a **Beta** badge while the app is in beta. Remove the badge in
  `DesktopAppButton.tsx` when it is released properly.
- It is already built (`frontend/src/components/ui/DesktopAppButton.tsx`) but **hidden** until the first
  release exists. To switch it on: publish the installer, then set `DESKTOP_APP_URL` to that repo's release asset and `DESKTOP_APP_READY = true` in that file.

### 5.6a Open from the portal (built)

- The installer, and the app on first run, register the `bpotime://` link with Windows.
- The portal's button is **Open app** once it has opened the app on that browser, and **Desktop app**
  before that. Pressing it goes to `bpotime://open`, which starts the app or brings it to the front.
- A web page cannot ask the browser whether a program is installed. The button waits about two
  seconds to see whether the browser handed focus to another program. If not, it asks "Didn't open?"
  with **Download** and **Try again**. It is a good signal, not a guarantee, so a miss is a question and
  not an error.
- Once the portal has a "My devices" list, that list should decide the label (connected PC means "Open
  app") and the timed check stays as the fallback.
- The first time, Chrome and Edge ask "Open BPO Time?" with an "Always allow" box. That is the browser's
  rule.
- **Security:** a link is text from any web page. The app honours only a short allowlist of actions
  (currently `open`) and never uses anything else in the link to open files, run commands or visit
  addresses. The sign-in handoff in section 5.3 reuses this link.
- Testing before there is a public release: open the portal once with `?desktop=on` to show the button
  in that browser (`?desktop=off` hides it again). Run the app once from source so Windows learns the
  link, then press the button.

### 5.7 Distribution

- Windows installer built with electron-builder, published to the app repo's GitHub Releases, with auto-update. Its builds and releases run from that
  repo's own workflow, so this repo's deploys are not affected.
- A code-signing certificate (about USD 100 to 400 a year) avoids the "unrecognised app" warning.
  Without one, people see a SmartScreen warning on install.

## 6. Privacy and policy (required before rollout)

- Covered by the Philippines Data Privacy Act (RA 10173): written policy, notice to employees,
  proportionate purpose. HR or legal must approve. This document is not legal advice.
- Track **clock-in and clock-out time only**. No idle tracking, screenshots, keystroke logging or window
  titles unless there is a strong, documented reason.
- The app shows the person exactly what is recorded and lets them see their own data.
- The portal already records the check-in IP; employees should be told (see the note in the README).

## 7. Milestones

1. **Week 1:** app shell, "Login with portal", clock in or out, today's total on screen and in the
   portal.
2. **Week 2:** breaks and lunch, offline queue. (Idle detection was dropped.)
3. **Week 3:** docking, tray, auto-start, installer, signing, auto-update.

These are estimates from similar projects, not from a prototype.

## 8. Risks

- PCs on VPN or shared IPs make the IP check unreliable (already true today).
- Locked-down PCs may not allow installation or may block the browser handoff (hence the code
  fallback).
- Mixed operating systems: the first version is Windows only.
- Employee trust: roll out with the policy and the visible "what is recorded" screen, not silently.

## 9. Questions and answers (decided 2026-10-19)

1. [x] **What is it for?** Time management and easy access to the portal.
2. [x] **Windows only, or Macs too?** Windows only.
3. [x] **How many people, and where?** Around 20 or more.
4. [x] **Dock (reserve space) or float on top?** Done: a bottom-most desktop widget, so icons stay put and
   apps can sit on top (commit 161c32a).
5. [x] **Is a PC lock (shop-style session control) in scope?** No. The app never locks or blocks the PC.
6. [x] **Does anything beyond time belong on the panel?** Yes, and built: announcements, birthdays, quick
   links, shift status, "Got it" acknowledgements.
7. [x] **Has HR agreed to monitoring, and is the policy updated?** Yes.
8. [x] **Idle detection?** No. It was never built and is dropped from the plan.

## 10. Decision

- [x] Build the Windows panel (Electron). Shipped as version 0.1.1 with installer and auto-update.
- [x] Time only: clock in and clock out, no idle, no screenshots, no keystrokes, no window titles.
- [x] No PC lock.
- [x] HR has agreed, and the policy is updated.
