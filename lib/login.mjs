// Bubble apps only: narrated-demos login <email> [--branch <name or id>]
// Signs in to a development branch as a test user with BuildPrint's "run as" (no user password needed),
// then saves the session cookies as a Playwright storageState, and the branch's run-mode basic auth, to
// .auth/<branch id>.json (mode 600, git-ignored). check and record load that file. The user runs this
// themselves; it never prints a cookie or password value.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { branchPrefix, resolveBranch } from "./bubble.mjs";
import { loadConfig } from "./config.mjs";
import { ensureIgnored } from "./init.mjs";

export function login(email, branchArg) {
  const { platform, bubble } = loadConfig();
  if (platform !== "bubble") throw new Error('login is for Bubble apps: set "platform": "bubble" and "bubble": { app, branch } in demo.config.json');
  const branch = resolveBranch(bubble.app, branchArg ?? bubble.branch);

  // buildprint login also writes the basic-auth pair to .buildprint/ in its working directory, so it runs
  // in an empty temporary folder that is deleted afterwards. Its JSON (secret) is read from stdout only.
  const work = mkdtempSync(join(tmpdir(), "narrated-demos-login-"));
  let out;
  try {
    out = execFileSync("buildprint", ["login", email, "--app", bubble.app, "--branch", branch.id, "--json", "--no-browser"],
      { cwd: work, encoding: "utf8", stdio: ["inherit", "pipe", "inherit"], maxBuffer: 16 * 1024 * 1024 });
  } catch (err) {
    throw new Error(`buildprint login failed${err.status ? ` (exit ${err.status})` : ""}. Its message, if any, is above.`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  let r;
  try { r = JSON.parse(out); } catch { throw new Error("buildprint login did not return JSON"); }
  if (r.ok !== true || !Array.isArray(r.cookies)) throw new Error("buildprint login returned no session");
  if (branchPrefix(r.runModeBaseUrl) !== branch.baseUrl) throw new Error("buildprint login answered for a different branch; nothing was saved");

  const cookies = r.cookies.map(c => ({
    name: c.name, value: c.value, domain: c.domain, path: c.path,
    expires: c.expires ?? -1, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite ?? "Lax",
  }));
  const basicAuth = r.runModeUsername && r.runModePassword ? { username: r.runModeUsername, password: r.runModePassword } : null;
  mkdirSync(".auth", { recursive: true, mode: 0o700 });
  const file = `.auth/${branch.id}.json`;
  writeFileSync(file, `${JSON.stringify({
    app: bubble.app, branch: branch.id, email, saved_at: new Date().toISOString(),
    storage_state: { cookies, origins: [] }, basic_auth: basicAuth,
  }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600); // writeFileSync's mode only applies to a new file
  if (ensureIgnored(".", ".auth/")) console.log("added .auth/ to .gitignore");
  console.log(`Signed in as ${email} on ${bubble.app}, branch ${branch.name} (${branch.id}). Saved ${cookies.length} cookie(s)` +
    `${basicAuth ? " and the run-mode basic auth" : ""} to ${file} (mode 600, git-ignored).\n` +
    "It holds a live session: never commit or share it. Run login again when the session expires.");
}
