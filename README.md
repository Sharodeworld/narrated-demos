# narrated-demos

Turn a YAML script into a narrated product demo video.

You write one script per feature: a list of narration lines, each paired with the clicks, hovers and waits that should happen while it is spoken. `narrated-demos` then:

1. **voices** every line with ElevenLabs, one clip per line, and measures each clip;
2. **records** your app in headless Chromium with Playwright, holding each step for exactly as long as its line (plus a 250 ms breath), at 2x pixels;
3. **merges** it all with ffmpeg and [playwright-recast](https://www.npmjs.com/package/playwright-recast): optional zooms and highlights, a cursor with click ripples, your app in a rounded window on a brand canvas, title and end cards, and the narration placed at each step's real start time.

Because narration comes first and the recording is paced to it, voice and screen stay in sync with no editing. When the UI changes, re-record in minutes.

**Output:** `out/<slug>/<slug>.mp4`, 1920x1080, H.264 (crf 20) with AAC 192k audio normalized to -16 LUFS, plus captions as a separate `<slug>.srt`.

The repository is two things:

- a **Node CLI**, `narrated-demos init | check | voice | record | merge | run`, that you install into your app;
- a **Claude Code plugin** with a phase-gated skill and four independent agents (script writer, script checker, camera editor, QA scrubber), so a person approves every phase and nobody reviews their own work.

## Prerequisites

- **Node 20.12 or later.**
- **ffmpeg and ffprobe** on your PATH. A build without drawtext or libass is fine: text is rendered in the browser.
- **Headless Chromium** for playwright-core 1.65.0: `npx playwright-core install chromium-headless-shell`. To use a binary you already have, set `DEMO_CHROMIUM_PATH` to a `chrome-headless-shell` executable.
- **An ElevenLabs account on a paid plan.** Check that your plan's terms cover commercial use of the audio before you publish a video.
- **A voice id** chosen from your ElevenLabs voice library.
- **A non-production build of your app with fake data** that opens without a sign-in screen (see [Safety](#safety)). For a Bubble app, a development branch and the BuildPrint CLI instead (see [Bubble apps](#bubble-apps)).

## Quickstart with Claude Code

In Claude Code, add the marketplace and install the plugin:

```
/plugin marketplace add Sharodeworld/narrated-demos
/plugin install narrated-demos@narrated-demos
```

In your app's repository, install the CLI and scaffold the demos folder:

```
npm i -D github:Sharodeworld/narrated-demos
npx narrated-demos init
cp demos/.env.example demos/.env    # then fill in demos/.env yourself
```

Then ask Claude to start, for example `/narrated-demos:narrated-demos map features`. The skill walks through six phases (map features, write and check scripts, voice, record, merge, QA) and stops for your approval after each one.

## Quickstart with plain Node

```
npm i -D github:Sharodeworld/narrated-demos
npx narrated-demos init             # creates ./demos
cd demos
cp .env.example .env                # fill in ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID
# edit demo.config.json and write scripts/<slug>.yaml
npx narrated-demos check <slug>     # dry-run every selector, no recording
npx narrated-demos run <slug>       # voice, record, merge
```

The package is installed from GitHub; it is not published to npm.

## Commands

Run every command except `init` from the `demos/` folder.

| Command | What it does | Writes |
| --- | --- | --- |
| `init [dir]` | Scaffolds a demos folder (default `./demos`). Keeps any file that already exists. | the files below |
| `check <slug>` | Replays the script headless without recording or pacing. Fails if a click or hover target does not match exactly one visible element, a `waitFor` never appears, or a camera box cannot be measured. Prints a length estimate. | `out/<slug>/check.png` |
| `voice <slug>` | One ElevenLabs clip per line, cached (see [Voice cache](#voice-cache)). Needs the API key and voice id. | `out/<slug>/audio/`, `timings.json` |
| `record <slug>` | Headless recording paced to the clips. A slow action makes the narration wait; it is never cut short. | `out/<slug>/recording/`, `cues.json` |
| `merge <slug>` | Builds the video and captions, prints every gap and the loudness, and fails if any line ends less than 250 ms before the next. | `out/<slug>/<slug>.mp4`, `<slug>.srt` |
| `run <slug>` | `voice`, `record` and `merge` in turn. | all of the above |
| `login <email>` | Bubble apps only: signs in to a development branch as a test user. `--branch <name or id>` picks the branch. You run it yourself. | `.auth/<branch id>.json` |

## The demos folder

```
demos/
  demo.config.json     # base URL, viewport, brand, card text
  voice.config.json    # ElevenLabs model and voice settings (no keys)
  features.md          # feature inventory and pilot list
  scripts/<slug>.yaml  # one script per feature
  camera/<slug>.mjs    # optional camera plan per script
  .env.example         # variable names only
  .env                 # your secrets, git-ignored
  .auth/               # Bubble sign-ins saved by login, git-ignored
  .gitignore           # out/, .env and .auth/
  out/                 # generated, git-ignored
```

`init` writes an example script and camera plan for a fictional app, Acme Tasks. Replace them.

### demo.config.json

```json
{
  "platform": "web",
  "base_url": "http://localhost:3000",
  "viewport": { "width": 1920, "height": 1080 },
  "brand": {
    "name": "Acme Tasks",
    "logo": null,
    "font": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    "colors": { "canvas": "#f5f5f5", "text": "#171717", "muted": "#525252", "click": "#171717", "highlight": "#FACC15" }
  },
  "cards": { "title": "{title}", "end": "acme-tasks.example" }
}
```

- `platform`: `web` (the default) or `bubble`, which replaces `base_url` with a `bubble` block (see [Bubble apps](#bubble-apps)).
- `base_url`: the build to record. `DEMO_BASE_URL` in the environment overrides it.
- `viewport`: the browser size, which must be 16:9. It is recorded at 2x and placed in the 1920x1080 frame.
- `brand.name` is the wordmark on the title and end cards. `brand.logo` (a PNG, JPEG, SVG or WebP path relative to `demos/`) replaces the wordmark when set. `font` is a CSS font stack; quote font names with single quotes.
- `brand.colors`: `canvas` behind the app window and on the cards, `text` for the wordmark, `muted` for the card line, `click` for click ripples, `highlight` for highlight boxes.
- `cards.title` is the line under the wordmark on the title card; `{title}` becomes the script's `title`. `cards.end` is the line on the end card.

### voice.config.json

The ElevenLabs model, output format, optional voice settings and stitching (sending neighbouring lines as context so clips flow). Keep it the same across videos so they sound alike. Any change re-voices every line.

### Scripts

```yaml
feature: create-task
title: Plan your week in a minute
start_url: /tasks?demo=1
steps:
  - say: "Planning a week of work shouldn't take a meeting."
    do: []
    pad_ms: 400
  - say: "Start from a template instead of a blank list."
    do:
      - click: "role=button[name='Templates']"
      - waitFor: "text=Weekly plan"
```

`say` is voiced. `do` lists actions that run while it plays: `click`, `hover` or `waitFor`, each with a [Playwright selector](https://playwright.dev/docs/other-locators). A click or hover target must match exactly one visible element (hidden elements are not counted); prefer `data-testid` or role and accessible name. `pad_ms` holds the screen after the line so a result can land.

Optional top-level keys: `ready`, a selector to wait for after the start page loads, for elements that render late; and, for Bubble apps, `branch` (see below).

Aim for 45 to 90 seconds at 130 to 150 words a minute, one plain sentence under 20 words per action, opening with the user's problem and ending with the result.

### Camera plans

A camera plan is optional. Without `camera/<slug>.mjs` the video stays on the full frame, with the cursor and click ripples but no zooms or highlights. With one, it exports two functions:

```js
// Called by record after step i's actions (i is 0-based). Return named boxes to keep.
// box(selector) resolves to { x, y, w, h } in CSS px of the viewport, or throws.
export async function measure(i, box) {
  if (i === 2) return { list: await box("role=list[name='Tasks']") };
  return {};
}

// Called by merge. Times are ms on the video clock.
// S[i], E[i]: start and end of step i. at(key): time of the first event whose key starts with key;
// keys use 1-based step numbers, such as "s3:click:<selector>", "s3:hover:<selector>" or "s3:<waitFor selector>".
// boxes: what measure returned. zoomMs: zoom transition (800). viewport: { width, height }.
export function beats({ S, E, at, boxes, zoomMs, viewport }) {
  const r = boxes.list, W = viewport.width, H = viewport.height;
  return [
    { s: S[2] + zoomMs, e: E[3] - 350, zoom: { x: (r.x + r.w / 2) / W, y: (r.y + r.h / 2) / H, level: 1.5 } },
    { s: S[4] + 350, e: E[4] - 350, zoom: null, highlights: [{ x: r.x, y: r.y, width: r.w, height: r.h, duration: 60000, fadeOut: 300 }] },
  ];
}
```

Each beat is `{ s, e, zoom, highlights }`. `zoom` is `{ x, y, level }` with the centre as 0-1 fractions of the viewport and `level` 1 for the full frame, or `null`. `highlights` are boxes in viewport px. Beats must be in time order and must not overlap.

### Voice cache

`voice` stores each clip's hash in `out/<slug>/audio/manifest.json`. The hash is the first 16 hex characters of `sha256(JSON.stringify({ voiceId, request }))`, where `request` is exactly what is sent to ElevenLabs (text, model, output format, voice settings, and the previous and next lines when stitching is on). A clip is fetched again only when its hash changes, so editing one line re-bills that line and its neighbours. Deleting `out/` deletes the cache.

## Bubble apps

For an app built on [Bubble](https://bubble.io), set `platform` to `bubble` and name the app and its default development branch instead of `base_url`:

```json
{
  "platform": "bubble",
  "bubble": { "app": "acme-crm", "branch": "demo-videos" },
  "viewport": { "width": 1920, "height": 1080 }
}
```

You also need the [BuildPrint](https://buildprint.ai) CLI (`npm i -g buildprint`). List an app's branches with `buildprint branch list <app> --json`.

- **A development branch, never live.** `check` and `record` look up the branch's run-mode URL with `buildprint branch <app> <branch> --json`; `base_url` and `DEMO_BASE_URL` are not used. They refuse the live branch, refuse any start URL outside the branch's `/version-<id>` path, and stop if a page navigates out of it, because apps can redirect to live. A navigation the page starts (a link or a script) is blocked before it is sent. A server redirect is followed by the browser before it can be blocked, so the run stops at once and `record` deletes the recording.
- **A branch per script.** Not every feature is on the default branch. A script sets `branch: <name or id>` to run on another one.
- **Signing in.** From the demos folder, run `npx narrated-demos login <email> --branch <name or id>` yourself, with the email of a test user on that branch. It uses BuildPrint's "run as" sign-in (no user password; you need a BuildPrint sign-in with access to the app) and saves the session cookies and the branch's run-mode basic auth to `.auth/<branch id>.json`, readable only by you. It prints no cookie or password. `init` and `login` keep `.auth/` in `.gitignore`. `check` and `record` load the file for the branch they run on; `DEMO_BASIC_AUTH_USER` and `DEMO_BASIC_AUTH_PASSWORD` in `.env` override the saved basic auth. The basic auth is sent only to the app's own origin. Run `login` again when the session expires.
- **Selectors.** Bubble element names never reach the page and its class names are generated. Use role and accessible name first (Bubble buttons are real buttons), then visible text, then an HTML id you add to the element on the development branch. Bubble keeps popups in the page, hidden, until they open; hidden elements are never counted as matches.
- **Timing.** Bubble has no page-ready event. After the start page reaches network idle, the run waits 1 s more. Set `ready` in a script to also wait for an element that renders late, such as a list's first row.
- **Data.** All development branches share one database, so demo data seeded for one branch shows on every branch. Agree on fictional seed data with the app's owner before adding any.

## Secrets

The ElevenLabs key and voice id live in `demos/.env`, which `init` adds to `.gitignore`, or in your shell environment (shell values win). Never commit them, never put them in config files or scripts, and never paste them into a chat, an issue or a pull request. If a key is exposed, rotate it in ElevenLabs.

## Safety

- **Record against non-production only**: a local or staging build, never your live site.
- **Use fake data**: fictional people, companies, emails and round numbers. Demo videos get shared widely; anything on screen is public.
- **Scrub before publishing.** A person checks every frame for real names, emails and numbers. If real data appears, re-seed and re-record.
- The recorder does not sign in. Point `base_url` at a build that opens on the screen you want, signed in as a demo user, so no login screen or password ever appears in a video. Bubble apps sign in with `login` instead (see [Bubble apps](#bubble-apps)).

## Credits

The polish pass (camera zooms, cursor, click ripples, highlights, intro and outro crossfades) is done by [playwright-recast](https://www.npmjs.com/package/playwright-recast), MIT licensed. Recording uses [Playwright](https://playwright.dev), narration uses the [ElevenLabs](https://elevenlabs.io) API, and video and audio processing use [ffmpeg](https://ffmpeg.org).

## License

[MIT](LICENSE)
