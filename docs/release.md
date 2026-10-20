# Releasing and updating BPO Time

How a new version gets to everyone. Read this before publishing version 0.2.

## How people get the app

- **First install:** one file, `BPO-Time-Setup.exe`, for everyone. It installs for the current user only (no admin
  rights), puts a shortcut on the Start menu, and registers the `bpotime://` link the portal's **Launch App** button uses.
  The portal's Download button points at the newest one:
  `https://github.com/ashlerick/BPO-Time/releases/latest/download/BPO-Time-Setup.exe`
- **Every later version:** installs itself. A running app checks this repo's GitHub Releases about 15 seconds after it
  starts and then every 4 hours. A newer version downloads quietly in the background, and installs the next time the
  app is restarted (a toast says so). *More, Restart to update* (or the tray menu) installs it straight away.
  Nobody downloads or runs an installer again.
- Running from source (`npm start`) never updates. Only an installed build does.

## Publishing a new version (for example 0.2.0)

1. Change what you need, then set the version: `npm version 0.2.0 --no-git-tag-version` (edits `package.json`).
2. Build the installer: `npm run dist`. This writes three files to `release/`:
   `BPO-Time-Setup.exe`, `BPO-Time-Setup.exe.blockmap` and `latest.yml`.
3. Commit and push, then publish the release with **all three files**. The updater needs `latest.yml`; without it
   running apps never see the new version.

   ```
   git tag v0.2.0
   git push origin main --tags
   gh release create v0.2.0 release/BPO-Time-Setup.exe release/BPO-Time-Setup.exe.blockmap release/latest.yml --title "BPO Time 0.2.0" --notes "What changed, in plain words."
   ```
4. Within a few hours every running app has downloaded it, and picks it up at its next restart.

Rules that keep this working:
- The tag must be `v` plus the exact version in `package.json`.
- Publish a normal release, not a draft or a pre-release: the updater only looks at the latest normal release.
- Versions only go up. To undo a bad release, publish a newer one with the fix (for example 0.2.1). Do not delete
  the bad one first: people who already updated would be stuck on it.
- Check `gh auth status` and publish under the owner's repo (`ashlerick/BPO-Time`).

## Trying a version first

To test a new version with a few people before the team gets it, publish a **pre-release** (for example
`0.2.0-beta.1`): running apps ignore pre-releases. Testing without touching live data (a staging server) is in
[testing.md](./testing.md).

## Things to know

- **No code-signing certificate yet.** The installer is unsigned, so Windows SmartScreen shows "Windows protected your
  PC" on the first install (More info, then Run anyway). Updates run from inside the app and do not show it. A
  certificate (about USD 100 to 400 a year) removes the warning and should be bought before a wide rollout. Updates
  are still checked against a hash in `latest.yml`, but the signature check only happens once the app is signed.
- **The portal and the app are versioned separately.** The app talks to the portal's `/hr/device-*` endpoints. Add
  to them freely; do not change or remove one while old app versions are still out there. A breaking change
  needs a new endpoint name, and the old one stays until everyone has updated.
- **If a version must be forced out** (a bug that touches people's time), the portal can refuse old versions with a
  clear "please update" message. That is not built yet; ask for it before it is needed.
- Starting with Windows is a switch in Settings (off by default). Not built yet: a first-run welcome screen.
