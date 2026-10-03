import { createServer } from "node:http";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const root = new URL("../", import.meta.url);
const candidates = [
  process.env.CHROME_BIN,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean);
let chrome;
for (const candidate of candidates) {
  try {
    await access(candidate, constants.X_OK);
    chrome = candidate;
    break;
  } catch { /* Try the next standard browser path. */ }
}
if (!chrome) throw new Error("Chrome/Chromium not found. Set CHROME_BIN to its executable.");

const routes = new Map([
  ["/abc-defg-hij", ["test/browser-fixture.html", "text/html"]],
  ["/google-meet-transcript.user.js", ["google-meet-transcript.user.js", "text/javascript"]],
  ["/test/browser-checks.js", ["test/browser-checks.js", "text/javascript"]],
]);
const files = new Map();
for (const [route, [file, type]] of routes) {
  files.set(route, { content: await readFile(new URL(file, root)), type });
}
const server = createServer((request, response) => {
  const file = files.get(request.url);
  response.setHeader("Cache-Control", "no-store");
  if (!file) { response.writeHead(404); response.end(); return; }
  response.setHeader("Content-Type", `${file.type};charset=utf-8`);
  response.end(file.content);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const profile = await mkdtemp(join(tmpdir(), "google-meet-transcript-browser-"));
const address = `http://127.0.0.1:${server.address().port}/abc-defg-hij`;

try {
  const child = spawn(chrome, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "--disable-sync",
    "--disable-extensions", "--disable-default-apps", "--metrics-recording-only",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
    `--user-data-dir=${profile}`, "--dump-dom", "--virtual-time-budget=20000", address,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let diagnostics = "";
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { diagnostics += data; });
  const timeout = setTimeout(() => child.kill("SIGTERM"), 30_000);
  let exit;
  try {
    exit = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
  } finally {
    clearTimeout(timeout);
  }
  if (exit.code !== 0) throw new Error(`Browser exited (${JSON.stringify(exit)}): ${diagnostics.slice(-2500)}`);
  const match = output.match(/<pre id="results"[^>]*data-state="([^"]+)"[^>]*>([\s\S]*?)<\/pre>/u);
  if (!match) throw new Error(`Browser produced no check report: ${diagnostics.slice(-1500)}`);
  const contents = match[2].replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&amp;/gu, "&");
  if (match[1] === "running") throw new Error("Browser checks did not finish within the time budget.");
  const report = JSON.parse(contents);
  for (const item of report.checks) console.log(`PASS ${item}`);
  if (report.error) throw new Error(report.error);
  if (match[1] !== "passed") throw new Error(`Unexpected browser status: ${match[1]}`);
  console.log(`\n${report.checks.length} browser checks passed.`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
