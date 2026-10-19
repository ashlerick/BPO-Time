# BPO Time: instructions for a coding session

Read this first, then [docs/context.md](./docs/context.md) (why this exists and what was decided) and
[docs/plan.md](./docs/plan.md) (the design). The app is built and shipping (version 0.1.1); the plan describes what exists.

## What this repo is

The Windows desktop sidebar app for the **BPO Portal** (JAE Philus OPC / Philus BPO Services). A slim
panel on the screen edge for clocking in and out, breaks and lunch, and quick access to the portal. It writes to the same attendance record as the portal. It is a separate
product from the portal and has its own repo, deliberately.

- Portal repo (the thing it talks to): https://github.com/ashlerick/BPO-Portal (public).
  Local checkout normally at `C:\Projects\BPO-Portal`.
- Portal frontend: https://ashlerick.github.io/BPO-Portal/
- Portal API: https://backend-xi-six-41.vercel.app (Vercel, TypeScript functions, Prisma + Neon Postgres)

## Rules that must not be broken

1. **Owner is `ashlerick`.** Never create or move a repo under `Lerick-Ashley-Copia` (the work login
   the `gh` CLI is signed in as). That account is only a collaborator with write access. Check
   `gh auth status` before any `gh repo ...` command.
2. **Do not push, release, or deploy unless the user says so in that message.** Commit locally as you
   go; wait for "push" or "push and deploy". This was an explicit, repeated instruction in the portal
   project (several small deploys caused failed builds and error emails). Applies here too.
3. **No attribution lines** in commit messages or PR descriptions (no `Co-Authored-By`, no "Generated
   with"). Commit messages are plain.
4. **Privacy first.** Record **clock-in, clock-out and break times only**. No idle tracking, screenshots, keystroke logging, window or
   app titles, unless the user explicitly asks and HR has approved a documented reason. The employee
   must be able to see exactly what is recorded about them. This is about real people's data under the
   Philippines Data Privacy Act (RA 10173).
5. **Never put a login token or password in a URL, a log line or a file in the repo.** See "Sign-in".
6. **No secrets in git.** `.gitignore` already blocks `.env*`, `*.pfx`, `*.p12`, `*.pem`. The code-signing
   certificate and any API tokens live outside the repo.
7. **Be honest about what is verified.** Say plainly what was tested and what was only written.

## How the user likes to work

- Answers first when asked a question; recommendations, not a menu of every option.
- Wants descriptive, human error messages and visible feedback (toasts) for every action.
- Previews decisions before irreversible actions. Short, clear summaries of what changed.
- Wrong turns are costly to them: when a request is ambiguous, ask one precise question.

## Design in one page

(Full detail: `docs/plan.md`.)

- **Technology:** Electron + TypeScript (same stack as the portal). Windows only.
- **Panel:** name and status, today's time (large), week total, Clock in, slide to clock out, breaks and lunch, shift and
  lateness, unread notifications and to-dos due, highlighted announcements, birthdays, quick links, light and dark theme,
  tray icon, auto-start with Windows, auto-update.
- **Docking:** a frameless bottom-most desktop widget on the right edge (above the desktop, below other apps).
  A reserved-space AppBar was tried and replaced so desktop icons stay put.
- **No idle detection.** Decided 2026-10-19; do not add it.
- **Sync:** direct calls to the portal's `/hr/device-*` endpoints; the server clock is the reference. No offline queue:
  with no connection a clock action is refused with a clear message.
- **It is NOT a lock screen** and never locks the PC. Decided 2026-10-19.

### Sign-in: "Launch App" from the portal (built; do not change the shape)

The app never sees the password. The portal's **Launch App (BETA)** button asks the API for a one-time code
(`POST /hr/device-code`, 60 seconds) and opens `bpotime://connect?code=<code>`. The app swaps the code for a
**device token** (`POST /hr/device-token`), calls `GET /hr/device-me` to show the name, and stores the token
encrypted with Windows DPAPI (`safeStorage`; memory only if that is unavailable, never plain text).

The device token is separate from the browser session, accepted only by the device endpoints, revocable per
device (Settings > Desktop app in the portal), and dead when the account is deactivated (401 means ask to Launch
App again). Never put the portal's own JWT or the device token in a URL. The app uses its own API base constant
and ignores any address in a link. Dropped: a `/connect-app` page, a loopback address, a typed-code fallback.

## The portal side

Built in the portal repo (see `docs/plan.md` section 5.5):

- Device endpoints on the portal's `hr` dispatcher: `device-code`, `device-token`, `device-me`, `device-today`,
  `device-clock-in`, `device-clock-out`, `device-break-start`, `device-break-end`, `device-counts`, `device-feed`,
  plus `GET /hr/devices` and `DELETE /hr/devices/:id`. Treat these paths as the contract; changing one means
  changing both repos.
- Break rules in `backend/lib/breaks.ts`. Shift schedules (grace minutes, working days) drive late reporting.
- The **Launch App (BETA)** button in the portal header (`frontend/src/components/ui/DesktopAppButton.tsx`),
  live (`DESKTOP_APP_READY = true`), downloading this repo's latest release `BPO-Time-Setup.exe`.

Portal constraints that affect this app: Vercel **Hobby plan allows 12 functions and the portal is at 12**,
so new endpoints must go inside an existing dispatcher (`hr`, `portal`, `content`, `restricted`,
`leave`), not new files. Functions time out at 10 seconds. The database is Neon free tier.

## Decisions (2026-10-19)

All the earlier open questions are decided; see sections 9 and 10 of `docs/plan.md`. It is for time management
and easy access to the portal, Windows only, around 20 or more people. No idle detection and no PC lock.
Ask the user before changing any of these.

## Where the work stands

Version 0.1.1 is released with installer and auto-update. Not done: a code-signing certificate and an offline
queue (which is not planned). Releases: `docs/release.md`. Testing against a staging server: `docs/testing.md`.

## Conventions once code exists

- TypeScript strict. One `package.json` at the repo root.
- Keep the app thin: business rules (shift lateness, who sees what) stay in the portal API.
- Every user-visible action shows success or a specific error; offline is a normal state, not an error.
- Installers and signing certificates are never committed. Releases are published to this repo's GitHub
  Releases; the portal button links to the latest asset.
