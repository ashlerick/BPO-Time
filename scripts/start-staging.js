// Starts the app against a TEST server instead of the real portal. Put the test server's address in .env.staging
// (copy .env.staging.example); that file is never committed. The app shows a TEST pill and keeps its own sign-in
// folder, so it cannot touch the real portal's data or your normal sign-in.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const electron = require("electron");

const file = path.join(__dirname, "..", ".env.staging");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

if (!env.BPO_API_BASE && fs.existsSync(file)) {
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*BPO_API_BASE\s*=\s*(.+?)\s*$/);
    if (m) env.BPO_API_BASE = m[1].replace(/^["']|["']$/g, "");
  }
}

if (!/^(https:\/\/|http:\/\/localhost)/.test(env.BPO_API_BASE || "")) {
  console.error("No test server set. Copy .env.staging.example to .env.staging and put the test server's address in it.");
  console.error("It must be an https:// address ending in /api (or http://localhost...). Nothing was started.");
  process.exit(1);
}
if (/backend-xi-six-41/.test(env.BPO_API_BASE)) {
  console.error("That is the REAL portal's address. Refusing to start in test mode against it.");
  process.exit(1);
}
console.log("Test run against " + env.BPO_API_BASE);
spawn(electron, ["."], { stdio: "inherit", env }).on("exit", (c) => process.exit(c ?? 0));
