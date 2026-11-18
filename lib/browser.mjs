// Headless Chromium for the demo tools: recording (record.mjs), the dry run (check.mjs) and rendering
// the frame, cards and cursor (brand-frame.mjs). DEMO_CHROMIUM_PATH points at a specific
// chrome-headless-shell binary; left unset, playwright-core launches the headless shell it downloads
// for its own version (npx playwright-core install chromium-headless-shell).
import { chromium } from "playwright-core";

export const launch = (args = []) => chromium.launch({ executablePath: process.env.DEMO_CHROMIUM_PATH || undefined, args });
