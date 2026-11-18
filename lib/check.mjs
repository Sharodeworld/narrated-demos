// Dry run for Phase 2: replays scripts/<slug>.yaml in headless Chromium without recording or pacing,
// and reports whether every action resolves the way record will need it to: each click or hover target
// matches exactly one visible element, each waitFor text appears, and the camera plan's boxes can be measured.
// Hidden elements are not counted (Bubble apps keep popups in the page, hidden, until they open).
// Also prints the word count and a spoken-length estimate. Leaves out/<slug>/check.png (the last screen).
// Run from the demos folder: narrated-demos check <feature-slug>
import { mkdirSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { launch } from "./browser.mjs";
import { bubbleContext, bubbleTarget } from "./bubble.mjs";
import { loadCamera } from "./camera.mjs";
import { loadConfig } from "./config.mjs";

export async function check(slug) {
  const config = loadConfig(), { viewport } = config;
  const doc = parse(readFileSync(`scripts/${slug}.yaml`, "utf8"));
  const bubble = config.platform === "bubble" ? bubbleTarget(config, doc) : null;
  const camera = await loadCamera(slug);
  const count = s => s.split(/\s+/).filter(Boolean).length;
  const words = doc.steps.reduce((n, s) => n + count(s.say), 0);
  const long = doc.steps.map((s, i) => [i + 1, count(s.say)]).filter(([, n]) => n >= 20);
  console.log(`${slug}: ${doc.steps.length} steps, ${words} words, about ${Math.round(words / 150 * 60)}-${Math.round(words / 130 * 60)} s of speech` +
    (long.length ? ` | lines of 20+ words: ${long.map(([i, n]) => `step ${i} (${n})`).join(", ")}` : ""));

  const browser = await launch();
  const { ctx, guard } = bubble ? await bubbleContext(browser, { viewport }, bubble) : { ctx: await browser.newContext({ viewport }) };
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const stopIfLeft = () => { if (guard?.left) throw guard.error(); };
  let failed = 0;
  const report = (i, what, err) => {
    if (err) failed++;
    console.log(`step ${String(i + 1).padStart(2)}  ${err ? "FAIL" : "ok  "}  ${what}${err ? `: ${err.message.split("\n")[0]}` : ""}`);
  };
  try {
    await page.goto(bubble ? bubble.startUrl : config.baseUrl + doc.start_url, { waitUntil: "networkidle" });
    if (doc.ready) await page.locator(doc.ready).filter({ visible: true }).first().waitFor(); // optional: the script's ready selector
    if (bubble) await page.waitForTimeout(1000); // Bubble has no page-ready event: let late elements settle
    const box = async sel => {
      const b = await page.locator(sel).first().boundingBox();
      if (!b) throw new Error(`${sel} is not on screen`);
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    for (const [i, step] of doc.steps.entries()) {
      for (const action of step.do ?? []) {
        const [kind, sel] = Object.entries(action)[0];
        try {
          const visible = page.locator(sel).filter({ visible: true });
          if (kind === "waitFor") await visible.first().waitFor();
          else if (kind === "hover" || kind === "click") {
            const n = await visible.count();
            if (n !== 1) throw new Error(`${n} visible matches, record needs exactly 1`);
            await visible[kind]();
          } else throw new Error("unsupported action: use click, hover or waitFor");
          report(i, `${kind} ${sel}`);
        } catch (err) { stopIfLeft(); report(i, `${kind} ${sel}`, err); }
      }
      try {
        const boxes = await camera.measure(i, box);
        if (Object.keys(boxes).length) report(i, `camera boxes ${Object.keys(boxes).join(", ")}`);
      } catch (err) { stopIfLeft(); report(i, "camera measure", err); }
    }
    stopIfLeft();
    mkdirSync(`out/${slug}`, { recursive: true });
    await page.screenshot({ path: `out/${slug}/check.png` });
  } catch (err) {
    throw guard?.error() || err;
  } finally {
    await browser.close();
  }
  if (failed) throw new Error(`${failed} check(s) failed`);
  console.log(`${slug}: every action resolved. Last screen: out/${slug}/check.png`);
}
