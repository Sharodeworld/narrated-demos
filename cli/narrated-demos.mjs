#!/usr/bin/env node
// The narrated-demos command. Every subcommand except init runs from a product's demos/ folder.
import { existsSync } from "node:fs";

const USAGE = `Usage: narrated-demos <command>

  init [dir]      Scaffold a demos folder (default: ./demos). Existing files are kept.
  check <slug>    Dry-run every selector and waitFor in scripts/<slug>.yaml, headless, no recording.
  voice <slug>    Narration clips and timings.json from ElevenLabs. Unchanged lines are cached.
  record <slug>   Headless recording paced to the clips.
  merge <slug>    Final MP4 and SRT in out/<slug>/.
  run <slug>      voice, record and merge in turn.

Run every command except init from the demos folder, next to demo.config.json.
Secrets are read from the environment or from a .env file in that folder.`;

const [cmd, arg] = process.argv.slice(2);
const fail = msg => { console.error(msg); process.exit(1); };

if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  console.log(USAGE);
  process.exit(cmd ? 0 : 1);
}

try {
  if (cmd === "init") {
    const { init } = await import("../lib/init.mjs");
    init(arg);
  } else if (["check", "voice", "record", "merge", "run"].includes(cmd)) {
    if (!arg) fail(`narrated-demos ${cmd} needs a feature slug, such as: narrated-demos ${cmd} create-task`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(arg)) fail(`"${arg}" is not a slug: use lowercase letters, digits and hyphens`);
    if (!existsSync("demo.config.json")) fail("No demo.config.json here. Run this from your demos folder, or create one with: narrated-demos init");
    if (existsSync(".env")) process.loadEnvFile(".env"); // variables already set in the shell win
    // Each stage is imported only when it runs, after .env is loaded: voice reads the API key at import.
    const stages = cmd === "run" ? ["voice", "record", "merge"] : [cmd];
    for (const stage of stages) {
      const mod = await import(`../lib/${stage}.mjs`);
      await mod[stage](arg);
    }
  } else {
    fail(`Unknown command "${cmd}".\n\n${USAGE}`);
  }
} catch (err) {
  fail(err?.stack ?? String(err));
}
