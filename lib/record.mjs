// Phase 4: replays scripts/<slug>.yaml in headless Chromium and records it for playwright-recast:
// a 2x recordVideo plus a Playwright trace, in out/<slug>/recording/.
// Each step holds until it has lasted at least its clip's duration_ms + pad_ms (timings.json) + BREATH_MS.
// A slow action runs long and the narration waits; an action is never cut short.
// Writes out/<slug>/cues.json (actual step start times) and recording/timeline.json (wall-clock step
// and event times, plus the element boxes the camera plan asks for).
// No cursor is drawn in the page: recast's cursorOverlay and clickEffect draw it from the trace.
// Click and hover act on the one visible match; hidden elements (such as Bubble's waiting popups) are ignored.
// On a Bubble app, a page leaving the development branch stops the run and the recording is deleted.
// Run from the demos folder: narrated-demos record <feature-slug>
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { parse } from "yaml";
import { launch } from "./browser.mjs";
import { bubbleContext, bubbleTarget } from "./bubble.mjs";
import { loadCamera } from "./camera.mjs";
import { loadConfig } from "./config.mjs";

// A breath after every line: each step holds 250 ms longer than its clip and pad, so no line runs
// straight into the next.
const BREATH_MS = 250;
const SCALE = 2;              // 2x pixels, so recast's zooms stay sharp
const CURSOR_GLIDE_MS = 450;  // before each action: room for recast's cursor move (500 ms) to land
const AFTER_ACTION_MS = 350;

export async function record(slug) {
  const config = loadConfig(), { viewport: { width: W, height: H } } = config;
  const root = process.cwd() + "/";
  const outDir = `${root}out/${slug}`, recDir = `${outDir}/recording`;
  const doc = parse(readFileSync(`${root}scripts/${slug}.yaml`, "utf8"));
  const bubble = config.platform === "bubble" ? bubbleTarget(config, doc) : null;
  const baseUrl = bubble ? bubble.baseUrl : config.baseUrl;
  if (!existsSync(`${outDir}/timings.json`)) throw new Error(`out/${slug}/timings.json is missing: run narrated-demos voice ${slug} first`);
  const timings = JSON.parse(readFileSync(`${outDir}/timings.json`, "utf8")).steps;
  if (timings.length !== doc.steps.length) throw new Error(`timings.json has ${timings.length} steps, the script ${doc.steps.length}`);
  const camera = await loadCamera(slug);

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  rmSync(recDir, { recursive: true, force: true });
  mkdirSync(recDir, { recursive: true });

  const browser = await launch([`--force-device-scale-factor=${SCALE}`]); // the video only gets 2x pixels with this flag
  const options = {
    viewport: { width: W, height: H }, deviceScaleFactor: SCALE,
    recordVideo: { dir: recDir, size: { width: W * SCALE, height: H * SCALE } },
  };
  const { ctx, guard } = bubble ? await bubbleContext(browser, options, bubble) : { ctx: await browser.newContext(options) };
  const boxes = {}, events = {}, steps = [];
  try {
    await ctx.tracing.start({ screenshots: true, snapshots: false }); // recast reads actions and timing from the trace
    const page = await ctx.newPage();
    page.setDefaultTimeout(8000);
    await page.goto(bubble ? bubble.startUrl : baseUrl + doc.start_url, { waitUntil: "networkidle" });
    if (doc.ready) await page.locator(doc.ready).filter({ visible: true }).first().waitFor(); // optional: the script's ready selector
    await sleep(1000); // settle; Bubble has no page-ready event

    const box = async sel => {
      const b = await page.locator(sel).first().boundingBox();
      if (!b) throw new Error(`camera plan: ${sel} is not on screen`);
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    for (const [i, step] of doc.steps.entries()) {
      const start = Date.now();
      const hold = timings[i].duration_ms + timings[i].pad_ms + BREATH_MS;
      for (const action of step.do) {
        const [kind, sel] = Object.entries(action)[0];
        const loc = page.locator(sel).filter({ visible: true });
        if (kind === "waitFor") {
          await loc.first().waitFor();
          events[`s${i + 1}:${sel}`] = Date.now();
        } else if (kind === "hover" || kind === "click") {
          await loc.scrollIntoViewIfNeeded();
          await sleep(CURSOR_GLIDE_MS);
          await loc[kind](); // a Playwright action, so the trace carries its point
          events[`s${i + 1}:${kind}:${sel}`] = Date.now();
        } else throw new Error(`unsupported action ${kind}`);
        await sleep(AFTER_ACTION_MS);
      }
      Object.assign(boxes, await camera.measure(i, box));
      const left = hold - (Date.now() - start);
      if (left > 0) await sleep(left);
      steps.push({ start, end: Date.now(), hold });
    }
    await sleep(800);
    const video = page.video();
    await ctx.tracing.stop({ path: `${recDir}/trace.zip` });
    await ctx.close();
    await browser.close();
    renameSync(await video.path(), `${recDir}/video.webm`); // the name recast's input lookup expects
    if (guard?.left) throw guard.error();
  } catch (err) {
    if (!guard?.left) throw err;
    await guard.closed;
    await browser.close().catch(() => {});
    rmSync(recDir, { recursive: true, force: true }); // it may hold frames of the page outside the branch
    throw guard.error();
  }

  writeFileSync(`${recDir}/timeline.json`, JSON.stringify({ steps, events, boxes }, null, 2));
  const cues = steps.map((s, i) => ({
    step: i + 1, start_ms: s.start - steps[0].start, end_ms: s.end - steps[0].start,
    hold_ms: s.hold, clip_ms: timings[i].duration_ms, overran_ms: Math.max(0, s.end - s.start - s.hold),
  }));
  writeFileSync(`${outDir}/cues.json`, JSON.stringify({ feature: slug, base_url: baseUrl, breath_ms: BREATH_MS, cues }, null, 2));
  const over = cues.filter(c => c.overran_ms > 20);
  console.log(`${slug}: recorded ${steps.length} steps, ${((steps.at(-1).end - steps[0].start) / 1000).toFixed(1)} s` +
    (over.length ? ` | ran long: ${over.map(c => `step ${c.step} +${c.overran_ms} ms`).join(", ")}` : " | no step ran long"));
}
