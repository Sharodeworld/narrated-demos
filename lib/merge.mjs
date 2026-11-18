// Phase 5: builds out/<slug>/<slug>.mp4 and <slug>.srt from the Phase 4 recording.
//   1. playwright-recast: the camera plan's zooms (camera/<slug>.mjs, optional), cursor, click ripples, text highlights
//   2. brand-frame.mjs: the app in a rounded, shadowed window on a 1920x1080 brand canvas
//   3. playwright-recast intro()/outro(): crossfades in the title and end cards
//   4. narration: each step-NN.mp3 placed at its cue from cues.json (adelay + amix), two-pass loudnorm
//      to -16 LUFS, muxed as AAC 192k beside H.264 crf 20; captions written as a separate .srt
// Nothing is frozen, sped up or retimed: recast's voiceover() and speedUp() are not used, and the carded
// length is checked against intro + recording + outro - two crossfades.
// Run from the demos folder: narrated-demos merge <feature-slug>
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { unzipSync, strFromU8 } from "fflate";
import { parse } from "yaml";
import { Recast } from "playwright-recast";
import { FRAME, frameVideo, renderCard, renderCursor } from "./brand-frame.mjs";
import { loadCamera } from "./camera.mjs";
import { loadConfig } from "./config.mjs";

const INTRO_MS = 2500, OUTRO_MS = 3400, FADE_MS = 600; // title and end cards, and their crossfades
const LEAD_MS = 900, TAIL_MS = 1300;                    // live screen kept before the first line and after the last
const ZOOM_MS = 800;                                    // zoom transition
const LUFS = -16, TRUE_PEAK = -1.5, LRA = 11;

export async function merge(slug) {
  const { viewport, brand, cards } = loadConfig();
  const root = process.cwd() + "/";
  const outDir = `${root}out/${slug}`, recDir = `${outDir}/recording`, work = `${outDir}/work`;
  const doc = parse(readFileSync(`${root}scripts/${slug}.yaml`, "utf8"));
  const timings = JSON.parse(readFileSync(`${outDir}/timings.json`, "utf8")).steps;
  const { breath_ms: breathMs, cues } = JSON.parse(readFileSync(`${outDir}/cues.json`, "utf8"));
  const tl = JSON.parse(readFileSync(`${recDir}/timeline.json`, "utf8"));
  const camera = await loadCamera(slug);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  const dur = f => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString();
  const ffLog = args => {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr.slice(-2000));
    return r.stderr;
  };

  // 1. Recast pass: camera plan, cursor, ripples, highlights. Recast's clock starts at the trace's first
  // screencast frame, so wall-clock times from timeline.json are mapped onto it.
  const trace = strFromU8(unzipSync(readFileSync(`${recDir}/trace.zip`), { filter: f => f.name === "trace.trace" })["trace.trace"])
    .split("\n").filter(Boolean).map(l => JSON.parse(l));
  const ctxOpt = trace.find(e => e.type === "context-options"), frame0 = trace.find(e => e.type === "screencast-frame");
  const frame0Wall = ctxOpt.wallTime + (frame0.timestamp - ctxOpt.monotonicTime);
  const vt = wall => Math.round(wall - frame0Wall);
  const S = tl.steps.map(s => vt(s.start)), E = tl.steps.map(s => vt(s.end));
  const at = key => vt(Object.entries(tl.events).find(([k]) => k.startsWith(key))[1]);
  const beats = camera.beats({ S, E, at, boxes: tl.boxes, zoomMs: ZOOM_MS, viewport });
  // The camera timeline goes to recast as one SRT entry per beat (never burned in), with each beat's zoom
  // passed to enrichZoomFromReport() and its highlights read by textHighlight() from report.json.
  const srtTime = ms => new Date(Math.round(ms)).toISOString().slice(11, 23).replace(".", ",");
  writeFileSync(`${recDir}/camera.srt`, beats.map((b, i) => `${i + 1}\n${srtTime(b.s)} --> ${srtTime(b.e)}\nbeat ${i + 1}\n`).join("\n"));
  writeFileSync(`${recDir}/report.json`, JSON.stringify({ steps: beats.map(b => ({ highlights: b.highlights ?? [] })) }, null, 2));
  const cursor = await renderCursor(work);
  let pass = Recast.from(recDir).parse();
  if (beats.length) {
    pass = pass.subtitlesFromSrt(`${recDir}/camera.srt`)
      .enrichZoomFromReport(beats.map(b => ({ zoom: b.zoom })))
      // autoZoom only carries the transition and easing here; levels of 1.0 add no zooms of their own.
      .autoZoom({ clickLevel: 1.0, inputLevel: 1.0, idleLevel: 1.0, transitionMs: ZOOM_MS, easing: "ease-in-out" });
  }
  pass = pass.cursorOverlay({ image: cursor, hideAfterMs: 120000, moveDurationMs: 500 })
    .clickEffect({ color: brand.colors.click, opacity: 0.22, radius: 22, duration: 450, sound: false });
  if (beats.length) pass = pass.textHighlight({ color: brand.colors.highlight, opacity: 0.3, swipeDuration: 350, fadeOut: 300 });
  await pass.render({ format: "mp4", resolution: { width: FRAME.w, height: FRAME.h }, crf: 14 })
    .toFile(`${work}/app.mp4`);
  const blankMs = Math.round((dur(`${recDir}/video.webm`) - dur(`${work}/app.mp4`)) * 1000); // recast trims a blank lead-in

  // 2. Brand frame, keeping the live screen from just before the first line to just after the last.
  const fromMs = S[0] - blankMs - LEAD_MS, toMs = Math.min(E.at(-1) - blankMs + TAIL_MS, dur(`${work}/app.mp4`) * 1000);
  const framedDir = `${work}/framed`;
  mkdirSync(framedDir, { recursive: true });
  await frameVideo(`${work}/app.mp4`, `${framedDir}/video.webm`, `${work}/brand`, { fromMs, toMs }, brand);
  copyFileSync(`${recDir}/trace.zip`, `${framedDir}/trace.zip`);

  // 3. Title and end cards. "{title}" in the card text is replaced by the script's title.
  const cardText = t => String(t ?? "").replaceAll("{title}", doc.title ?? "");
  const intro = await renderCard(`${work}/brand`, "intro", cardText(cards.title), INTRO_MS, brand);
  const outro = await renderCard(`${work}/brand`, "outro", cardText(cards.end), OUTRO_MS, brand);
  await Recast.from(framedDir).parse()
    .intro({ path: intro, fadeDuration: FADE_MS })
    .outro({ path: outro, fadeDuration: FADE_MS })
    .render({ format: "mp4", resolution: { width: FRAME.W, height: FRAME.H }, crf: 12 })
    .toFile(`${work}/carded.mp4`);
  const expected = (INTRO_MS + (toMs - fromMs) + OUTRO_MS - 2 * FADE_MS) / 1000, carded = dur(`${work}/carded.mp4`);
  if (Math.abs(carded - expected) > 0.12) throw new Error(`carded video is ${carded} s, expected ${expected} s: something was retimed`);

  // 4. Narration. Cue times are ms after step 1 started; step 1 sits at S[0] on the recording clock.
  const step1 = (S[0] - blankMs - fromMs + INTRO_MS - FADE_MS) / 1000;
  const clips = cues.map((c, i) => ({
    path: `${outDir}/${timings[i].file}`, start: step1 + c.start_ms / 1000, end: step1 + (c.start_ms + timings[i].duration_ms) / 1000,
    stepEnd: step1 + c.end_ms / 1000, text: doc.steps[i].say,
  }));
  clips.forEach((c, i) => {
    if (clips[i + 1] && c.end > clips[i + 1].start) throw new Error(`clip ${i + 1} ends at ${c.end.toFixed(3)} s, after clip ${i + 2} starts`);
  });
  const total = dur(`${work}/carded.mp4`).toFixed(3), mix = `${work}/narration-mix.wav`;
  ffLog(["-y", ...clips.flatMap(c => ["-i", c.path]), "-filter_complex",
    clips.map((c, i) => `[${i}:a]aresample=48000,adelay=delays=${Math.round(c.start * 1000)}:all=1[d${i}]`).join(";") + ";" +
    `${clips.map((_, i) => `[d${i}]`).join("")}amix=inputs=${clips.length}:normalize=0:duration=longest,apad=whole_dur=${total}[a]`,
    "-map", "[a]", "-t", total, "-c:a", "pcm_s16le", mix]);
  // Loudnorm pass 1 measures; pass 2 (in the mux) applies one linear gain to reach the target.
  const m = JSON.parse(ffLog(["-i", mix, "-af", `loudnorm=I=${LUFS}:TP=${TRUE_PEAK}:LRA=${LRA}:print_format=json`, "-f", "null", "-"]).match(/\{[\s\S]*?\}/)[0]);
  const loudnorm = `loudnorm=I=${LUFS}:TP=${TRUE_PEAK}:LRA=${LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  const outFile = `${outDir}/${slug}.mp4`;
  ffLog(["-y", "-i", `${work}/carded.mp4`, "-i", mix, "-map", "0:v", "-map", "1:a", "-af", `${loudnorm},aresample=48000`, "-t", total,
    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", outFile]);
  writeFileSync(`${outDir}/${slug}.srt`, clips.map((c, i) => `${i + 1}\n${srtTime(c.start * 1000)} --> ${srtTime(c.end * 1000)}\n${c.text}\n`).join("\n"));

  // Report: every clip inside its step, with at least the breath before the next one.
  console.log("step  cue start  clip end  next start  gap ms");
  let short = 0;
  clips.forEach((c, i) => {
    const next = clips[i + 1]?.start, gap = Math.round(((next ?? c.stepEnd) - c.end) * 1000);
    const ok = c.end <= c.stepEnd + 1e-3 && gap >= breathMs;
    if (!ok) short++;
    console.log(`${String(i + 1).padStart(4)}  ${c.start.toFixed(3).padStart(9)}  ${c.end.toFixed(3).padStart(8)}  ${next === undefined ? "       -  " : next.toFixed(3).padStart(10)}  ${String(gap).padStart(6)}  ${ok ? "ok" : "SHORT"}`);
  });
  const e = ffLog(["-i", outFile, "-map", "0:a", "-af", "ebur128=peak=true", "-f", "null", "-"]), sum = e.slice(e.lastIndexOf("Summary:"));
  console.log(`loudness ${sum.match(/I:\s+(-?[\d.]+) LUFS/)[1]} LUFS integrated, true peak ${sum.match(/Peak:\s+(-?[\d.]+) dBFS/)[1]} dBFS`);
  console.log(`wrote out/${slug}/${slug}.mp4 (${dur(outFile).toFixed(2)} s) and ${slug}.srt`);
  if (short) throw new Error(`${short} clip(s) end less than ${breathMs} ms before the next`);
}
