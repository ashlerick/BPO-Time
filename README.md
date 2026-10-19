# BPO Time

A small Windows sidebar app for the [BPO Portal](https://github.com/ashlerick/BPO-Portal): it tracks
work time and syncs with the portal, so the PC and the portal's Attendance page always agree.

**Status: version 0.1.3 (beta).** Windows only. Installer and update steps: [docs/release.md](./docs/release.md).

- Why this exists and what was decided: [docs/context.md](./docs/context.md)
- The design: [docs/plan.md](./docs/plan.md)
- Instructions for a coding session (Claude or a person): [CLAUDE.md](./CLAUDE.md)

## What it does

- Sit as a slim panel on the edge of the desktop, starting with Windows.
- Clock in and out, take breaks and lunch, and show today's and this week's time.
- Sign in from the portal: press **Launch App (BETA)** in the portal and the app receives a one-time code.
  The app never sees your password.

## Breaks and lunch (rules agreed 2026-10-16)

These are the rules the app is built to. They are all in one place in the
portal's `backend/lib/breaks.ts`, so changing a number or a rule later is a small edit.

- **Three slots a day, in order:** morning break (10 min), lunch (30 min), afternoon break (10 min).
  Each is used at most once.
- **Fixed deduction:** 10 + 30 + 10 = **50 minutes** come off the day's worked time, always. The deduction
  does not depend on whether a break was taken, skipped or cut short.
- **Taken or not is recorded.** Every slot ends up as `taken` or `not_taken`.
- **Over or not is recorded.** For a taken break the app records how many seconds it ran past its limit.
  Going over is only a flag for now: it takes nothing extra off the worked time, and a red timer shows it.
- **Grace:** 60 seconds past the limit before a break counts as over. Inside the grace the timer is amber and the break is
  recorded as not over; past it the timer is red and the full time over the limit is recorded. Returning early is never
  flagged (the deduction is fixed), so the grace only applies after the limit.
- **Skipping:** starting a later slot closes any earlier slot that was not used and records it as
  `not_taken` (the app asks first). Clocking out ends a running break (it counts as taken) and records
  every unused slot as `not_taken`.
  - morning only: lunch and afternoon are `not_taken` at clock-out
  - lunch only: the morning break is `not_taken`; the afternoon break stays available
  - afternoon only: asks first, then the morning break and lunch are `not_taken`
- **Timer on the button:** it counts down from the limit; past zero it turns red and shows how far over
  (`+2:14`). The big "worked today" timer pauses while on a break and, while a break is running, takes
  off at most that slot's allowance.
- **Chat messages:** starting a break copies `Taking my break` (or `Taking my lunch`) to the clipboard and ending it copies
  `Back from break` (or `Back from lunch`). Clocking in copies `Good morning, clock in!` and clocking out copies
  `Good night, clock out!`. All of these are one switch in More ("Copy chat messages"), on by default.
- **Server keeps the time.** Starts and ends are recorded by the portal, like clock in and out, so a
  restart or a wrong PC clock cannot change them. Only start and end times are stored.
- **Not done yet:** the portal's attendance reports and the Excel export still compute hours from
  clock in and clock out only. They do not subtract the 50 minutes yet.

## How it fits with the portal

| | Portal | This app |
|---|---|---|
| Repo | `ashlerick/BPO-Portal` | `ashlerick/BPO-Time` (this repo) |
| Hosts | GitHub Pages and Vercel | Windows PCs, installer from this repo's Releases |
| Talks to | Its own database | The portal's API only (`/hr/device-*` endpoints) |

The portal's website shows a **Launch App (BETA)** button that opens the app, and offers this repo's latest release as the download if it is not installed.
It is live for everyone on a Windows PC.

## Privacy

Clock-in, clock-out and break times only. No idle tracking, no screenshots, no keystroke logging, no window titles. The person always sees
exactly what is recorded about them. See section 6 of the plan.

## Working on it

- Run from source: `npm install`, then `npm start`.
- Build the Windows installer: `npm run dist` (writes `release/BPO-Time-Setup.exe`).
- Publish a new version: see [docs/release.md](./docs/release.md). Running apps update themselves.

## Owner and commits

The repository is owned by `ashlerick`. Commits are made from the work PC under the
`Lerick-Ashley-Copia` collaborator account, the same as the portal repo.
