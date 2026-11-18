// Dry run for Phase 2: replays scripts/<slug>.yaml in headless Chromium without recording or pacing,
// and reports whether every action resolves the way record will need it to: each click or hover target
// matches exactly one element, each waitFor text appears, and the camera plan's boxes can be measured.
// Also prints the word count and a spoken-length estimate. Leaves out/<slug>/check.png (the last screen).
// Run from the demos folder: narrated-demos check <feature-slug>
import { mkdirSync, readFileSync } from "node:fs";
import { parse } from "yaml";
import { launch } from "./browser.mjs";
import { loadCamera } from "./camera.mjs";
import { loadConfig } from "./config.mjs";

export async function check(slug) {
  const { baseUrl, viewport } = loadConfig();
  const doc = parse(readFileSync(`scripts/${slug}.yaml`, "utf8"));
  const camera = await loadCamera(slug);
  const count = s => s.split(/\s+/).filter(Boolean).length;
  const words = doc.steps.reduce((n, s) => n + count(s.say), 0);
  const long = doc.steps.map((s, i) => [i + 1, count(s.say)]).filter(([, n]) => n >= 20);
  console.log(`${slug}: ${doc.steps.length} steps, ${words} words, about ${Math.round(words / 150 * 60)}-${Math.round(words / 130 * 60)} s of speech` +
    (long.length ? ` | lines of 20+ words: ${long.map(([i, n]) => `step ${i} (${n})`).join(", ")}` : ""));

  const browser = await launch();
  const page = await (await browser.newContext({ viewport })).newPage();
  page.setDefaultTimeout(8000);
  let failed = 0;
  const report = (i, what, err) => {
    if (err) failed++;
    console.log(`step ${String(i + 1).padStart(2)}  ${err ? "FAIL" : "ok  "}  ${what}${err ? `: ${err.message.split("\n")[0]}` : ""}`);
  };
  try {
    await page.goto(baseUrl + doc.start_url, { waitUntil: "networkidle" });
    const box = async sel => {
      const b = await page.locator(sel).first().boundingBox();
      if (!b) throw new Error(`${sel} is not on screen`);
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    for (const [i, step] of doc.steps.entries()) {
      for (const action of step.do ?? []) {
        const [kind, sel] = Object.entries(action)[0];
        try {
          const loc = page.locator(sel);
          if (kind === "waitFor") await loc.waitFor();
          else if (kind === "hover" || kind === "click") {
            const n = await loc.count();
            if (n !== 1) throw new Error(`${n} matches, record needs exactly 1`);
            await loc[kind]();
          } else throw new Error("unsupported action: use click, hover or waitFor");
          report(i, `${kind} ${sel}`);
        } catch (err) { report(i, `${kind} ${sel}`, err); }
      }
      try {
        const boxes = await camera.measure(i, box);
        if (Object.keys(boxes).length) report(i, `camera boxes ${Object.keys(boxes).join(", ")}`);
      } catch (err) { report(i, "camera measure", err); }
    }
    mkdirSync(`out/${slug}`, { recursive: true });
    await page.screenshot({ path: `out/${slug}/check.png` });
  } finally {
    await browser.close();
  }
  if (failed) throw new Error(`${failed} check(s) failed`);
  console.log(`${slug}: every action resolved. Last screen: out/${slug}/check.png`);
}
