// Updates. A released build checks the app repo's GitHub Releases (ashlerick/BPO-Time) a few seconds after it
// starts and then every few hours. A newer version downloads quietly in the background and installs the next time
// the app is restarted, or at once when the person chooses "Restart to update". Nothing happens when running from
// source, offline, or when no newer release exists: a failed check is just tried again at the next one.
import { app } from "electron";
import { autoUpdater } from "electron-updater";

const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

let readyVersion: string | null = null;

/** The version that has been downloaded and is waiting for a restart, or null. */
export function ready(): string | null {
  return readyVersion;
}

export function start(onReady: (version: string) => void): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null; // nothing about this PC is written to a log
  autoUpdater.on("update-downloaded", (info) => {
    readyVersion = info.version;
    onReady(info.version);
  });
  autoUpdater.on("error", () => {
    // offline, or the release is still being uploaded: the next check tries again
  });
  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, CHECK_EVERY_MS);
}

/** Close the app, install the downloaded version, and start it again. */
export function installNow(): void {
  autoUpdater.quitAndInstall(true, true);
}
