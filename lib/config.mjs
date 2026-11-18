// Reads demo.config.json from the demos folder (the working directory) and fills in defaults.
// DEMO_BASE_URL in the environment overrides base_url, so one config can point at different builds.
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";

const DEFAULTS = {
  viewport: { width: 1920, height: 1080 },
  brand: {
    name: "",
    logo: null,
    font: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    colors: { canvas: "#f5f5f5", text: "#171717", muted: "#525252", click: "#171717", highlight: "#FACC15" },
  },
  cards: { title: "{title}", end: "" },
};
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp" };

export function loadConfig() {
  const c = JSON.parse(readFileSync("demo.config.json", "utf8"));
  const baseUrl = (process.env.DEMO_BASE_URL || c.base_url || "").replace(/\/$/, "");
  if (!baseUrl) throw new Error("demo.config.json needs base_url (or set DEMO_BASE_URL)");
  const viewport = { ...DEFAULTS.viewport, ...c.viewport };
  // The brand window and the output are 16:9, so the recording has to be too.
  if (viewport.width * 9 !== viewport.height * 16) throw new Error(`viewport ${viewport.width}x${viewport.height} is not 16:9`);
  const brand = { ...DEFAULTS.brand, ...c.brand, colors: { ...DEFAULTS.brand.colors, ...c.brand?.colors } };
  if (brand.font.includes('"')) throw new Error("brand.font: use single quotes around font names");
  if (brand.logo) {
    if (!existsSync(brand.logo)) throw new Error(`brand.logo ${brand.logo} not found (paths are relative to the demos folder)`);
    const mime = MIME[extname(brand.logo).toLowerCase()];
    if (!mime) throw new Error(`brand.logo must be one of ${Object.keys(MIME).join(", ")}`);
    brand.logoDataUrl = `data:${mime};base64,${readFileSync(brand.logo).toString("base64")}`;
  }
  return { baseUrl, viewport, brand, cards: { ...DEFAULTS.cards, ...c.cards } };
}
