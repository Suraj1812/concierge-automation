import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const tscCli = require.resolve("typescript/bin/tsc");

const scriptFile = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptFile);
const projectRoot = path.resolve(scriptDirectory, "..");
const entryPath = process.argv[2];

if (!entryPath) {
  console.error("Usage: node scripts/dev-runner.mjs <entry-path-without-extension>");
  process.exit(1);
}

const distEntry = path.join(projectRoot, "dist", `${entryPath}.js`);
const watchTargets = [
  path.join(projectRoot, "src"),
  path.join(projectRoot, "tests"),
  path.join(projectRoot, "package.json"),
  path.join(projectRoot, "tsconfig.json"),
  path.join(projectRoot, ".env")
];

let appProcess = null;
let compilerProcess = null;
let buildInFlight = false;
let buildQueued = false;
let restartExpected = false;
let shuttingDown = false;
let rebuildTimer = null;

const watchers = [];

const log = (message) => {
  process.stdout.write(`[dev] ${message}\n`);
};

const warn = (message) => {
  process.stderr.write(`[dev] ${message}\n`);
};

const scheduleRebuild = (reason) => {
  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
  }

  rebuildTimer = setTimeout(() => {
    rebuildTimer = null;
    void buildAndRestart(reason);
  }, 150);
};

const collectDirectories = (directory) => {
  const directories = [directory];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    directories.push(...collectDirectories(path.join(directory, entry.name)));
  }

  return directories;
};

const registerWatcher = (watchTarget) => {
  if (!fs.existsSync(watchTarget)) {
    return;
  }

  const onChange = (_eventType, filename) => {
    if (filename && String(filename).includes(".git")) {
      return;
    }

    scheduleRebuild(`change in ${path.relative(projectRoot, watchTarget) || "."}`);
  };

  try {
    watchers.push(fs.watch(watchTarget, { recursive: true }, onChange));
    return;
  } catch {
    const stats = fs.statSync(watchTarget);
    if (!stats.isDirectory()) {
      watchers.push(fs.watch(watchTarget, onChange));
      return;
    }
  }

  for (const directory of collectDirectories(watchTarget)) {
    watchers.push(fs.watch(directory, onChange));
  }
};

const stopApp = async () => {
  if (!appProcess) {
    return;
  }

  const child = appProcess;
  restartExpected = true;

  await new Promise((resolve) => {
    const forceKillTimer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 5_000);

    child.once("exit", () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    child.kill("SIGTERM");
  });

  if (appProcess === child) {
    appProcess = null;
  }

  restartExpected = false;
};

const startApp = () => {
  if (!fs.existsSync(distEntry)) {
    warn(`Cannot start ${entryPath} because ${path.relative(projectRoot, distEntry)} has not been built yet.`);
    return;
  }

  const child = spawn(process.execPath, [distEntry], {
    cwd: projectRoot,
    stdio: "inherit"
  });

  appProcess = child;

  child.once("exit", (code, signal) => {
    if (appProcess === child) {
      appProcess = null;
    }

    if (restartExpected || shuttingDown) {
      return;
    }

    if (signal) {
      warn(`${entryPath} exited after signal ${signal}. Waiting for the next successful build.`);
      return;
    }

    if (code && code !== 0) {
      warn(`${entryPath} exited with code ${code}. Waiting for the next successful build.`);
    }
  });
};

const runBuild = async () => {
  compilerProcess = spawn(process.execPath, [tscCli, "-p", "tsconfig.json"], {
    cwd: projectRoot,
    stdio: "inherit"
  });

  const exitCode = await new Promise((resolve) => {
    compilerProcess.once("exit", (code) => {
      resolve(code ?? 1);
    });

    compilerProcess.once("error", () => {
      resolve(1);
    });
  });

  compilerProcess = null;
  return exitCode;
};

const buildAndRestart = async (reason) => {
  if (shuttingDown) {
    return;
  }

  if (buildInFlight) {
    buildQueued = true;
    return;
  }

  buildInFlight = true;
  log(`Building project (${reason})...`);
  const exitCode = await runBuild();
  buildInFlight = false;

  if (shuttingDown) {
    return;
  }

  if (exitCode === 0) {
    log("Build succeeded. Restarting process.");
    await stopApp();
    startApp();
  } else {
    warn("Build failed. Fix the errors and save again to retry.");
  }

  if (buildQueued) {
    buildQueued = false;
    void buildAndRestart("queued changes");
  }
};

const shutdown = async (signal) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  log(`Received ${signal}. Shutting down dev runner.`);

  if (rebuildTimer) {
    clearTimeout(rebuildTimer);
  }

  for (const watcher of watchers) {
    watcher.close();
  }

  if (compilerProcess) {
    compilerProcess.kill("SIGTERM");
  }

  await stopApp();
  process.exit(0);
};

for (const watchTarget of watchTargets) {
  registerWatcher(watchTarget);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void buildAndRestart("initial build");
