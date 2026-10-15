# BPO Time

A small Windows sidebar app for the [BPO Portal](https://github.com/ashlerick/BPO-Portal): it tracks
work time and syncs with the portal, so the PC and the portal's Attendance page always agree.

**Status: planning. No code yet.**

- Why this exists and what was decided: [docs/context.md](./docs/context.md)
- The design: [docs/plan.md](./docs/plan.md)
- Instructions for a coding session (Claude or a person): [CLAUDE.md](./CLAUDE.md)

## What it will do

- Sit as a slim panel on the edge of the desktop, starting with Windows.
- Clock in and out, take breaks and lunch, and show today's and this week's time.
- Pause on real system idle, and keep working offline then sync when the connection returns.
- Sign in with **"Login with portal"**: the browser opens the portal, you allow this PC, and the app
  receives a one-time code. The app never sees your password.

## How it fits with the portal

| | Portal | This app |
|---|---|---|
| Repo | `ashlerick/BPO-Portal` | `ashlerick/BPO-Time` (this repo) |
| Hosts | GitHub Pages and Vercel | Windows PCs, installer from this repo's Releases |
| Talks to | Its own database | The portal's API only (versioned, `/api/device/v1/...`) |

The portal's website shows a **Desktop app** download button that points at this repo's latest release.
It stays hidden until the first release exists.

## Privacy

Time and idle only. No screenshots, no keystroke logging, no window titles. The person always sees
exactly what is recorded about them. See section 6 of the plan.

## Working on it

Nothing to build yet. When code is added this section will list how to run and package it.

## Owner and commits

The repository is owned by `ashlerick`. Commits are made from the work PC under the
`Lerick-Ashley-Copia` collaborator account, the same as the portal repo.
