// Scaffolds a product's demos folder from templates/. Never overwrites: existing files are kept, except
// that .auth/ (Bubble sign-ins saved by login) is appended to an existing .gitignore that lacks it.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES = fileURLToPath(new URL("../templates/", import.meta.url));
// [template file, path in the demos folder]. npm can leave .gitignore out of an installed package,
// so the dotfile templates are stored without the dot.
const FILES = [
  ["demo.config.json", "demo.config.json"],
  ["voice.config.json", "voice.config.json"],
  ["features.md", "features.md"],
  ["scripts/create-task.yaml", "scripts/create-task.yaml"],
  ["camera/create-task.mjs", "camera/create-task.mjs"],
  ["gitignore", ".gitignore"],
  ["env.example", ".env.example"],
];

/** Appends line to dir/.gitignore (creating it if needed) unless it is already there. True if it added it. */
export function ensureIgnored(dir, line) {
  const file = join(dir, ".gitignore");
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (text.split(/\r?\n/).some(l => l.trim() === line)) return false;
  appendFileSync(file, `${text && !text.endsWith("\n") ? "\n" : ""}${line}\n`);
  return true;
}

export function init(dir = "demos") {
  const target = resolve(dir);
  for (const [from, to] of FILES) {
    const dest = join(target, to);
    if (existsSync(dest)) { console.log(`kept     ${relative(process.cwd(), dest) || dest}`); continue; }
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(TEMPLATES, from), dest);
    console.log(`created  ${relative(process.cwd(), dest) || dest}`);
  }
  if (ensureIgnored(target, ".auth/")) console.log(`updated  ${relative(process.cwd(), join(target, ".gitignore"))}: added .auth/`);
  const rel = relative(process.cwd(), target) || ".";
  console.log(`
Next:
  1. Edit ${rel}/demo.config.json: base_url (a non-production build with fake data), brand, card text.
     For a Bubble app, set platform and bubble instead of base_url (see the README's "Bubble apps").
  2. Copy ${rel}/.env.example to ${rel}/.env and fill it in yourself. Never paste keys into a chat.
  3. List features in ${rel}/features.md, then replace scripts/create-task.yaml with your own script.
  4. From ${rel}: narrated-demos check <slug>, then narrated-demos run <slug>.`);
}
