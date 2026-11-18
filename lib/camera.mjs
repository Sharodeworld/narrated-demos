// Loads the optional camera plan, camera/<slug>.mjs in the demos folder. Without one, the video
// stays on the full frame: no zooms or highlights, only the cursor and click ripples.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FULL_FRAME = { measure: async () => ({}), beats: () => [] };

export async function loadCamera(slug) {
  const file = resolve("camera", `${slug}.mjs`);
  return existsSync(file) ? import(pathToFileURL(file).href) : FULL_FRAME;
}
