// Optional camera plan for scripts/create-task.yaml (same slug). Delete it to keep the full frame.
//
// measure(i, box): record calls it after step i's actions run (i is 0-based). Return named element
//   boxes to keep; box(selector) resolves to {x, y, w, h} in CSS px of the viewport, or throws.
// beats({ S, E, at, boxes, zoomMs, viewport }): merge calls it once. S[i] and E[i] are step i's start
//   and end in ms on the video clock; at(key) is the time of the first recorded event whose key starts
//   with key ("s3:click:", "s3:text=..."); boxes holds everything measure returned. Return
//   [{ s, e, zoom, highlights }]: zoom is { x, y, level } (centre as 0-1 fractions of the viewport,
//   level 1 = no zoom) or null, and highlights are boxes { x, y, width, height, duration, fadeOut } in px.
export async function measure(i, box) {
  if (i === 2) return { list: await box("role=list[name='Tasks']") };
  return {};
}

export function beats({ S, E, boxes, zoomMs, viewport: { width: W, height: H } }) {
  const r = boxes.list, pad = 24;
  const level = +Math.min(1.6, W / (r.w + 2 * pad), H / (r.h + 2 * pad)).toFixed(3);
  const onList = { x: (r.x + r.w / 2) / W, y: (r.y + r.h / 2) / H, level };
  return [
    { s: S[2] + zoomMs, e: E[3] - 350, zoom: onList },
    { s: S[4] + 350, e: E[4] - 350, zoom: null, highlights: [{ x: r.x - 6, y: r.y - 4, width: r.w + 12, height: r.h + 8, duration: 60000, fadeOut: 300 }] },
  ];
}
