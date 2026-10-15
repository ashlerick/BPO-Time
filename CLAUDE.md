# BPO Time: instructions for a coding session

Read this first, then [docs/context.md](./docs/context.md) (why this exists and what was decided) and
[docs/plan.md](./docs/plan.md) (the design). Nothing here is built yet: this repo holds the plan.

## What this repo is

The Windows desktop sidebar app for the **BPO Portal** (JAE Philus OPC / Philus BPO Services). A slim
panel docked to the screen edge that tracks work time and syncs it with the portal. It is a separate
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
4. **Privacy first.** Record **time and idle only**. No screenshots, no keystroke logging, no window or
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

- **Technology:** Electron + TypeScript (recommended; same stack as the portal). Tauri is the lighter
  alternative. Windows only for v1.
- **Panel:** name and status, today's time (large), week total, Clock in, slide to clock out, shift and
  lateness, unread notifications and to-dos due, sync indicator, collapse to a thin bar, tray icon,
  auto-start with Windows.
- **Docking:** v1 is an always-on-top frameless window at the screen edge; true docking (reserving
  space like the taskbar via the Windows AppBar API) comes after the basics work.
- **Idle:** from the OS (`powerMonitor.getSystemIdleTime`), not the browser.
- **Sync:** upload 5-minute blocks (`active` or `idle`) to the portal API, queue offline, server clock is
  the reference. The app also reads today's and the week's totals back so it and the portal agree.
- **It is NOT a lock screen.** Shop-style session locking is out of scope (large, risky).

### Sign-in: "Login with portal" (do exactly this)

Browser handoff with a one-time code and PKCE, so the app never handles the password:

1. App creates a random secret + its hash and starts a sign-in request with the API.
2. App opens `https://ashlerick.github.io/BPO-Portal/connect-app?...` in the default browser.
3. User signs in (or is already signed in) and sees "Allow BPO Time on this PC (NAME)?".
4. On Allow the portal returns a **short-lived single-use code** to the app via a loopback address
   (`http://127.0.0.1:<port>`) or the app's own scheme (`bpotime://`). **Only those two destinations are
   allowed.**
5. App exchanges code + secret for a **device token** over a direct HTTPS call.

The device token is separate from the browser session, scoped to time tracking only (cannot reach payroll
or HR pages), revocable per device, dead when the account is deactivated, and stored in the Windows
credential store. Never put the portal's own JWT in a URL. Fallback for locked-down PCs: show a short
code the person types at `/connect` on another device.

## The portal side (what already exists, and what does not)

Exists in the portal repo:

- `POST /api/auth/login` (email + password) returns a JWT (HS256, 8 hour expiry, payload
  `{sub, email, roles}`). Roles: `employee`, `team_leader`, `manager`, `hr`, `admin`.
- Attendance: `GET /api/leave/attendance/today`, `POST /api/leave/attendance/checkin`,
  `POST /api/leave/attendance/checkout`. One `AttendanceRecord` per employee per day
  (`checkInAt`, `checkOutAt`, IPs). Check-in happens automatically at portal login.
- Shift schedules (templates with grace minutes and working days, assigned per employee) used for
  late/undertime reports.
- A **"Desktop app" download button** in the portal header, hidden behind `DESKTOP_APP_READY = false` in
  `frontend/src/components/ui/DesktopAppButton.tsx`. It points at this repo's latest GitHub release asset
  `BPO-Time-Setup.exe`. When the first release exists, set the flag to `true`.

Does **not** exist yet (must be built in the portal repo, not here):

- The device sign-in endpoints (start, approve, exchange), the `/connect-app` page and the "My devices"
  list in Settings.
- The `devices` and `time_blocks` tables, and the upload and summary endpoints.
- Keep the app's API small, **versioned** (`/api/device/v1/...`) and documented in `docs/plan.md`. The
  two repos meet only at that API.

Portal constraints that affect this app: Vercel **Hobby plan allows 12 functions and the portal is at 12**,
so new endpoints must go inside an existing dispatcher (`hr`, `portal`, `content`, `restricted`,
`leave`), not new files. Functions time out at 10 seconds. The database is Neon free tier.

## Open decisions (ask the user before assuming)

See section 9 of `docs/plan.md`. Not yet decided: Windows only vs Macs, who it is for and how many,
dock vs float, whether anything beyond time belongs on the panel, whether HR has agreed to monitoring
and updated the policy. Also undecided: Electron vs Tauri (Electron recommended).

## First steps when work starts

1. Confirm the open decisions above with the user.
2. Build a clickable mockup of the panel and get a reaction before any real code.
3. Milestone 1 (about a week): app shell, "Login with portal", clock in/out, today's total on screen and
   in the portal. Needs the three portal endpoints above, built and deployed from the portal repo (with
   the user's go-ahead).
4. Then idle + breaks + offline queue, then docking/tray/auto-start/installer/signing/auto-update.

## Conventions once code exists

- TypeScript strict. One `package.json` at the repo root.
- Keep the app thin: business rules (shift lateness, who sees what) stay in the portal API.
- Every user-visible action shows success or a specific error; offline is a normal state, not an error.
- Installers and signing certificates are never committed. Releases are published to this repo's GitHub
  Releases; the portal button links to the latest asset.
