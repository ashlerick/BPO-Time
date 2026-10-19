# Context: why this repo exists

Written 2026-10-16, at the moment the repo was created, so a later session (human or AI) understands
the situation without the original conversation.

## The situation

The **BPO Portal** is an internal web app for JAE Philus OPC / Philus BPO Services (a BPO company
serving a US customer, with staff in the Philippines and a team that works Pacific time). It already
covers attendance, leave, HR records, recruitment, onboarding, payroll links, performance, inventory
and more. Its code and history are in https://github.com/ashlerick/BPO-Portal.

Attendance in the portal is deliberately simple: one record per employee per day with a check-in time,
a check-out time and the IP of each. You are checked in automatically when you log in, and you press
Check Out in the header.

## The problem this repo answers

That record cannot tell a working hour from an hour away from the desk, has no breaks, and depends on
the browser tab. The request that started this repo:

> "an installable application where we can track and sync work time, and data is synced into the portal
> page and the PC ... a side bar application like how computer shops do."

Clarified in discussion as: a **slim panel docked to the edge of the Windows desktop** (like a session
widget on internet-shop PCs), **not** a lock screen. It signs in through the portal ("Login with
portal") and keeps its numbers in sync with the portal's Attendance page.

## Decisions already made

| Decision | Detail |
|---|---|
| Its own repository | Not a folder inside the portal repo. The two meet only at a versioned API. |
| Owner | GitHub account `ashlerick`. `Lerick-Ashley-Copia` (the work account used on this PC) is only a collaborator. Do not create repos under it. |
| Public repo | So the portal's download button can fetch release assets without a login. Nothing secret goes in the repo. |
| Not a lock screen | The shop-style session lock was judged large and risky (needs a Windows service and admin rights; a bug can lock people out of their PC). |
| Sign-in | Launch App from the portal: one-time code in a `bpotime://connect` link, swapped for a revocable device token. The app never sees the password. See `CLAUDE.md`. |
| Data collected | Clock-in, clock-out and break times only. No idle, screenshots, keystrokes or window titles. |
| Technology | Electron + TypeScript. Windows only. |
| Staging | Testing against a staging server: `docs/testing.md`. The portal button is live. |

## Options that were considered

A. Breaks and lunch in the portal only (days). B. Idle-aware heartbeat in the browser (about a week,
Chrome/Edge only, tab must stay open). **C. This app** (about 2 to 3 weeks for a first version).
D. Buy a product (Clockify, Toggl, Hubstaff, Time Doctor): cheaper if the goal is full monitoring with
reports. The recommendation was to do A and B first and build C only if they are not enough. The user
asked to proceed with C as a plan and created this repo for it.

## What was decided later (2026-10-19)

- It is for time management and easy access to the portal. Windows only. Around 20 or more people.
- Bottom-most desktop widget (not an AppBar, not always-on-top). Announcements, birthdays and quick links are
  on the panel.
- No idle detection. No PC lock.

Everything above this section is the situation as of 2026-10-16. The app has since been built (0.1.1).

## Where things live

| Thing | Location |
|---|---|
| This plan and decisions | this repo: `CLAUDE.md`, `docs/context.md`, `docs/plan.md` |
| Portal code | https://github.com/ashlerick/BPO-Portal |
| Portal plan copy of the app plan | `desktop_app_plan.md` in the portal repo (this repo's `docs/plan.md` is the maintained one now) |
| Portal download button | `frontend/src/components/ui/DesktopAppButton.tsx` in the portal repo |
| Portal attendance model | `AttendanceRecord` in `backend/prisma/schema.prisma`; endpoints in `backend/api/leave.ts` |
| Portal auth | `backend/lib/auth.ts` (JWT), `backend/api/auth/login.ts` |

## Working agreements carried over from the portal project

- Commit locally; push or release only when the user asks.
- No attribution trailers in commits.
- Answer questions first; recommend, do not list every option.
- Descriptive errors and visible feedback for every action.
- Be explicit about what was tested versus only written.
