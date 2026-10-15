// Launches the app. VS Code sets ELECTRON_RUN_AS_NODE, which makes Electron behave as plain Node.
const { spawn } = require("child_process");
const electron = require("electron");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
spawn(electron, ["."], { stdio: "inherit", env }).on("exit", (c) => process.exit(c ?? 0));
