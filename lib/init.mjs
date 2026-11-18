// Scaffolds a product's demos folder from templates/. Never overwrites: existing files are kept.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
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

export function init(dir = "demos") {
  const target = resolve(dir);
  for (const [from, to] of FILES) {
    const dest = join(target, to);
    if (existsSync(dest)) { console.log(`kept     ${relative(process.cwd(), dest) || dest}`); continue; }
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(TEMPLATES, from), dest);
    console.log(`created  ${relative(process.cwd(), dest) || dest}`);
  }
  const rel = relative(process.cwd(), target) || ".";
  console.log(`
Next:
  1. Edit ${rel}/demo.config.json: base_url (a non-production build with fake data), brand, card text.
  2. Copy ${rel}/.env.example to ${rel}/.env and fill it in yourself. Never paste keys into a chat.
  3. List features in ${rel}/features.md, then replace scripts/create-task.yaml with your own script.
  4. From ${rel}: narrated-demos check <slug>, then narrated-demos run <slug>.`);
}
