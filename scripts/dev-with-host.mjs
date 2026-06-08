/**
 * Run Vite dev server and the local GLB host server together.
 */

import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function run(label, script) {
  const child = spawn(npmCmd, ["run", script], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
      process.exit(code);
    }
  });
  return child;
}

run("host", "host-server");
run("vite", "dev");

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
