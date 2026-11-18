// Phase 3: turns a demo script into one narration clip per step, plus timings.json.
// Run from the demos folder: narrated-demos voice <feature-slug>
// Unchanged lines are cached by a hash of their text, context, voice and settings, so they are not re-billed.
// The request shape, the hash and the manifest keys (paths relative to the demos folder) must not change:
// any change re-bills every existing clip.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parse } from "yaml";
import { elevenlabs, voiceId } from "./elevenlabs.mjs";

export async function voice(slug) {
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not set in .env");
  const script = parse(readFileSync(`scripts/${slug}.yaml`, "utf8"));
  const config = JSON.parse(readFileSync("voice.config.json", "utf8"));
  const outDir = `out/${slug}`, audioDir = `${outDir}/audio`;
  mkdirSync(audioDir, { recursive: true });
  const manifestPath = `${audioDir}/manifest.json`;
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

  const lines = script.steps.map(s => s.say);
  const durationMs = file => Math.round(1000 * Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString()));

  const timings = [];
  let made = 0;
  for (const [i, step] of script.steps.entries()) {
    const file = `${audioDir}/step-${String(i + 1).padStart(2, "0")}.mp3`;
    const request = {
      text: step.say,
      modelId: config.model_id,
      outputFormat: config.output_format,
      ...(config.voice_settings ? { voiceSettings: config.voice_settings } : {}),
      ...(config.stitching ? { previousText: lines[i - 1], nextText: lines[i + 1] } : {}),
    };
    const hash = createHash("sha256").update(JSON.stringify({ voiceId, request })).digest("hex").slice(0, 16);
    if (manifest[file] !== hash || !existsSync(file)) {
      const audio = await elevenlabs.textToSpeech.convert(voiceId, request);
      writeFileSync(file, Buffer.from(await new Response(audio).arrayBuffer()));
      manifest[file] = hash;
      made++;
    }
    timings.push({ step: i + 1, file: file.replace(`${outDir}/`, ""), duration_ms: durationMs(file), pad_ms: step.pad_ms ?? 0 });
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  writeFileSync(`${outDir}/timings.json`, JSON.stringify({ feature: slug, model_id: config.model_id, steps: timings }, null, 2));
  const total = timings.reduce((n, t) => n + t.duration_ms + t.pad_ms, 0);
  console.log(`${slug}: ${made} new clip(s), ${timings.length - made} cached, narration ${(total / 1000).toFixed(1)} s with pauses`);
}
