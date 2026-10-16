# Testing BPO Time without touching the team

The team's installed apps only change when a release is published (see [release.md](./release.md)). Pushing code
or running your own copy affects nobody. The one thing everyone shares is the portal's backend, and your own test
clock-ins and breaks are written to it as real attendance. These are the safe ways to test.

## 1. Run your own copy (no staging needed)

`npm start` runs the app from the source folder, separate from any installed copy. Use this for anything that does
not change data: layout, wording, colors, tooltips, the theme.

Careful: it is signed in as you on the real portal, so clock in, clock out and breaks count. If you must test those,
use a staging server (below), or a test employee account.

## 2. Run against a staging server (safe for clock-ins, breaks, shifts)

The portal's backend has a test copy with its own database (setup steps: `STAGING.md` in the portal repo). Point the
app at it:

1. Copy `.env.staging.example` to `.env.staging` (never committed) and put the staging address in it:
   `BPO_API_BASE=https://<staging address>/api`
2. Run `npm run start:staging`.

What it does for you:
- An amber **TEST** pill shows next to your status, and More shows `test server <address>`, so a test run can never be
  mistaken for the real thing.
- It keeps its own sign-in folder (`bpo-time-staging`), so it cannot overwrite your normal sign-in or the installed
  app's data.
- It only accepts an `https://` address (or `http://localhost`), and refuses to start if the address is the real
  portal's.
- To sign in, open the *test* portal, log in as a test account and press Launch App there.

## 3. Trial a release with a few people before the team gets it

Publish a **pre-release**. Running apps never see a pre-release, so only people who install it by hand get it.

```
npm version 0.2.0-beta.1 --no-git-tag-version
npm run dist
git add -A && git commit -m "BPO Time 0.2.0 beta 1" && git tag v0.2.0-beta.1 && git push origin main --tags
gh release create v0.2.0-beta.1 release/BPO-Time-Setup.exe release/BPO-Time-Setup.exe.blockmap release/latest.yml --prerelease --title "BPO Time 0.2.0 beta 1" --notes "For testers only."
```

- Testers download `BPO-Time-Setup.exe` from that release page. People on the normal version do not get it.
- A tester on a beta keeps getting newer betas, and moves to the normal `0.2.0` when you publish it.
- When it is good, set the version to `0.2.0`, build, and publish a normal (not pre-release) release. That is the one the
  whole team's apps pick up.
- If the beta is bad, just publish `0.2.0-beta.2`. Nobody outside the testers was affected.

## Before any release

- Does it still work against the **currently live** backend? Old installed apps talk to it too.
- Backend changes first, and additive only (new endpoints and fields; never rename or remove one an installed app uses).
- Run `npm run dist`, start the packaged app from `release/win-unpacked/BPO Time.exe`, and check it opens and shows
  data with no error in its log.
