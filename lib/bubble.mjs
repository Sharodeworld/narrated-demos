// Bubble.io apps ("platform": "bubble" in demo.config.json). check and record use this to:
//   - find the run-mode URL of a development branch with the BuildPrint CLI (never the live app),
//   - refuse any start URL outside that branch's /version-<id> path, and stop the run if a page
//     navigates out of it (apps can redirect to live),
//   - load the sign-in saved by `narrated-demos login` (.auth/<branch id>.json) and the run-mode basic auth.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const NAV_TIMEOUT_MS = 30000; // Bubble pages can take longer than the 8 s action timeout to reach network idle

/** The branch prefix (origin + /version-<id>) of a URL. Throws unless the URL is on a development branch. */
export function branchPrefix(url) {
  const u = new URL(url);
  const m = u.pathname.match(/^\/version-([^/]+)(?:\/|$)/);
  if (!m || m[1].toLowerCase() === "live") {
    throw new Error(`${u.origin}${u.pathname} is not on a Bubble development branch: the path must start with /version-<branch>, and the branch must not be live`);
  }
  return `${u.origin}/version-${m[1]}`;
}

/** True when url is the prefix itself or a path under it, on the same origin. */
export function underPrefix(url, prefix) {
  try {
    const u = new URL(url), p = new URL(prefix);
    return u.origin === p.origin && (u.pathname === p.pathname || u.pathname.startsWith(`${p.pathname}/`));
  } catch {
    return false;
  }
}

/** Looks up a branch by name or id: { id, name, baseUrl }. Refuses live. Needs no BuildPrint sign-in. */
export function resolveBranch(app, branch) {
  let out;
  try {
    out = execFileSync("buildprint", ["branch", app, branch, "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    if (err.code === "ENOENT") throw new Error("The BuildPrint CLI (buildprint) is not on your PATH. Install it with: npm i -g buildprint");
    throw new Error(`buildprint branch ${app} ${branch} failed: ${String(err.stderr || err.message).trim()}`);
  }
  const b = JSON.parse(out).branch;
  if (!b?.id || !b.runModeBaseUrl) throw new Error(`buildprint found no branch "${branch}" in ${app}. List them with: buildprint branch list ${app} --json`);
  if (b.id === "live" || b.readonly) throw new Error(`"${branch}" is the live app. Pick a development branch: buildprint branch list ${app} --json`);
  if (!/^[\w-]+$/.test(b.id)) throw new Error(`unexpected branch id "${b.id}"`);
  return { id: b.id, name: b.display ?? b.id, baseUrl: branchPrefix(b.runModeBaseUrl) };
}

/** The saved sign-in for a branch, and basic auth (DEMO_BASIC_AUTH_USER/_PASSWORD win over the saved pair). */
function loadAuth(branchId) {
  const file = `.auth/${branchId}.json`;
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  const { DEMO_BASIC_AUTH_USER: user, DEMO_BASIC_AUTH_PASSWORD: password } = process.env;
  if (!!user !== !!password) throw new Error("Set both DEMO_BASIC_AUTH_USER and DEMO_BASIC_AUTH_PASSWORD, or neither");
  return { file, storageState: saved?.storage_state ?? null, basicAuth: user ? { username: user, password } : saved?.basic_auth ?? null };
}

/** Where a script runs on a Bubble app: the branch (script `branch:` or bubble.branch), its start URL and sign-in. */
export function bubbleTarget({ bubble }, doc) {
  const branchName = doc.branch ?? bubble.branch;
  const branch = resolveBranch(bubble.app, branchName);
  const startUrl = new URL(branch.baseUrl + (doc.start_url ?? "")).href;
  if (!underPrefix(startUrl, branch.baseUrl)) throw new Error(`start_url ${doc.start_url} leads outside the branch ${branch.baseUrl}`);
  const auth = loadAuth(branch.id);
  console.log(`bubble: ${bubble.app}, branch ${branch.name} (${branch.id}), ` +
    (auth.storageState ? `signed in from ${auth.file}` : `not signed in (to sign in: narrated-demos login <email> --branch ${branchName})`) +
    (auth.basicAuth ? ", with basic auth" : ""));
  return { ...branch, startUrl, auth };
}

/**
 * A browser context for a Bubble branch: the saved cookies, basic auth sent only to the app's own origin,
 * and the live guard. A top-level navigation outside the branch is blocked, or, when it arrives as a
 * redirect (routes do not see those), the context is closed at once: guard.left is set, guard.closed
 * settles when the context has closed, and guard.error() says why.
 */
export async function bubbleContext(browser, options, target) {
  const origin = new URL(target.baseUrl).origin;
  const { storageState, basicAuth } = target.auth;
  const ctx = await browser.newContext({
    ...options,
    serviceWorkers: "block", // a service worker's requests would skip the route below
    ...(storageState ? { storageState } : {}),
    // Answers a 401 challenge, if Bubble sends one. The header below covers the case where it does not.
    ...(basicAuth ? { httpCredentials: { ...basicAuth, origin } } : {}),
  });
  const authorization = basicAuth && `Basic ${Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString("base64")}`;
  const guard = {
    left: null,
    error: () => guard.left && new Error(`Stopped: a page left the branch ${target.baseUrl} for ${guard.left}. ` +
      "Bubble apps can redirect to live; the recorder only runs on a development branch. Nothing was kept."),
  };
  const leave = url => {
    if (guard.left) return;
    guard.left = url;
    guard.closed = ctx.close().catch(() => {});
  };
  const outside = url => /^https?:/.test(url) && !underPrefix(url, target.baseUrl);
  const topLevel = req => req.isNavigationRequest() && !req.frame().parentFrame();
  await ctx.route("**/*", async (route, req) => {
    if (topLevel(req) && outside(req.url())) {
      await route.abort("blockedbyclient").catch(() => {});
      return leave(req.url());
    }
    const headers = authorization && new URL(req.url()).origin === origin ? { ...req.headers(), authorization } : undefined;
    await route.continue(headers ? { headers } : undefined).catch(() => {}); // fails only once the context is closed
  });
  ctx.on("request", req => { if (topLevel(req) && outside(req.url())) leave(req.url()); }); // redirect hops
  ctx.on("page", page => {
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    page.on("framenavigated", f => { if (!f.parentFrame() && outside(f.url())) leave(f.url()); });
  });
  return { ctx, guard };
}
