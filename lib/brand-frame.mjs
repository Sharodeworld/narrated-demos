// Pieces playwright-recast does not have: the rounded brand window around the app recording, the
// title and end card clips that recast's intro() and outro() crossfade in, and the 2x cursor image.
// ffmpeg builds without drawtext or libass are common, so anything with text or shape is rendered to
// PNG in headless Chromium instead. Colors, font, name and logo come from demo.config.json's brand.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { launch } from "./browser.mjs";

export const FRAME = { W: 1920, H: 1080, x: 128, y: 72, w: 1664, h: 936, r: 12, fps: 25 };
const ff = args => execFileSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function shoot(shots, bg) {
  const browser = await launch();
  for (const { html, w, h, path, transparent, scale = 1 } of shots) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
    await page.setContent(`<!doctype html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${transparent ? "transparent" : bg}">${html}</body>`);
    await page.screenshot({ path, omitBackground: !!transparent });
    await page.close();
  }
  await browser.close();
}

const win = extra => `<div style="position:absolute;left:${FRAME.x}px;top:${FRAME.y}px;width:${FRAME.w}px;height:${FRAME.h}px;border-radius:${FRAME.r}px;box-sizing:border-box;${extra}"></div>`;

/** Frames the app video (FRAME.w x FRAME.h): brand canvas, soft-shadowed 12px-radius window, hairline edge. */
export async function frameVideo(input, outPath, workDir, { fromMs, toMs }, brand) {
  mkdirSync(workDir, { recursive: true });
  const bg = `${workDir}/frame-bg.png`, mask = `${workDir}/frame-mask.png`, edge = `${workDir}/frame-edge.png`;
  await shoot([
    { path: bg, w: FRAME.W, h: FRAME.H, html: win("background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05),0 10px 30px rgba(0,0,0,.07),0 30px 70px -20px rgba(0,0,0,.12)") },
    { path: mask, w: FRAME.w, h: FRAME.h, html: `<div style="width:100%;height:100%;background:#000"><div style="width:100%;height:100%;border-radius:${FRAME.r}px;background:#fff"></div></div>` },
    { path: edge, w: FRAME.W, h: FRAME.H, transparent: true, html: win("border:1px solid rgba(0,0,0,.10)") },
  ], brand.colors.canvas);
  const seconds = ((toMs - fromMs) / 1000).toFixed(3), loop = ["-loop", "1", "-framerate", String(FRAME.fps)];
  ff(["-ss", (fromMs / 1000).toFixed(3), "-t", seconds, "-i", input, ...loop, "-i", bg, ...loop, "-i", mask, ...loop, "-i", edge,
    "-filter_complex",
    `[2:v]format=gray[m];[0:v]format=rgba[v];[v][m]alphamerge[vm];` +
    `[1:v][vm]overlay=${FRAME.x}:${FRAME.y}:shortest=1[a];[a][3:v]overlay=0:0:shortest=1,fps=${FRAME.fps},format=yuv420p[out]`,
    // -t on the output too: the looped PNG inputs would otherwise keep the graph running forever
    "-map", "[out]", "-t", seconds, "-c:v", "libx264", "-preset", "slow", "-crf", "10", "-an",
    // recast's input lookup wants a .webm next to trace.zip; Matroska holds the near-lossless H.264
    "-f", "matroska", outPath]);
}

/** A still card clip (1920x1080, 25 fps, H.264) for recast's intro()/outro(): wordmark or logo, plus one line. */
export async function renderCard(workDir, name, subtitle, durMs, brand) {
  mkdirSync(workDir, { recursive: true });
  const png = `${workDir}/${name}.png`, mp4 = `${workDir}/${name}.mp4`;
  const mark = brand.logoDataUrl
    ? `<img src="${brand.logoDataUrl}" alt="${esc(brand.name)}" style="max-height:120px;max-width:960px;display:block">`
    : `<div style="font-size:96px;font-weight:600;letter-spacing:-0.025em;color:${brand.colors.text};line-height:1">${esc(brand.name)}</div>`;
  await shoot([{ path: png, w: FRAME.W, h: FRAME.H, html:
    `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;font-family:${brand.font};-webkit-font-smoothing:antialiased">
      ${mark}
      <div style="font-size:36px;font-weight:400;color:${brand.colors.muted};line-height:1.3">${esc(subtitle)}</div></div>` }], brand.colors.canvas);
  ff(["-loop", "1", "-framerate", String(FRAME.fps), "-i", png, "-t", (durMs / 1000).toFixed(3),
    "-c:v", "libx264", "-preset", "slow", "-crf", "10", "-pix_fmt", "yuv420p", "-r", String(FRAME.fps), mp4]);
  return mp4;
}

/** The arrow cursor for recast's cursorOverlay, tip at the top-left. Recast draws the PNG at its
 *  native size, so it is rendered at 2x to match the 2x recording. */
export async function renderCursor(workDir) {
  mkdirSync(workDir, { recursive: true });
  const path = `${workDir}/cursor@2x.png`;
  await shoot([{ path, w: 26, h: 30, scale: 2, transparent: true, html:
    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="30" viewBox="0 0 26 30"><path d="M1.5 1.2 L1.5 23.2 L7.5 17.7 L11.7 26.7 L15.5 25 L11.3 16.2 L19.5 16.2 Z" fill="#111" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>` }]);
  return path;
}
