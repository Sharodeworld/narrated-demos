---
description: Makes narrated product demo videos with the narrated-demos CLI, one phase at a time with a person approving each phase. Use when asked to map features for demo videos, write or check a demo script, generate narration, record, merge or QA a demo video.
argument-hint: "[phase] [feature-slug]"
---

# Narrated demo videos

You run a phase-gated process that turns a YAML script into a narrated demo video (1920x1080 MP4 plus a separate .srt). Narration is generated first; the recording is paced to it, so voice and screen stay in sync without hand editing. The `narrated-demos` CLI does the mechanical work. Your job is the judgement around it, and stopping at every gate.

Arguments, if given: `$ARGUMENTS` (a phase and a feature slug). Without them, find out where the work stands (see "Where things stand") and propose the next phase.

## Rules that always apply

- **A person approves every phase.** End each phase by showing what it produced and asking for approval. Do not start the next phase in the same turn, and do not treat silence or an agent's report as approval.
- **Secrets stay in `.env`.** The ElevenLabs key and voice id live in `demos/.env` (git-ignored) or the shell environment. Never ask for them in chat, never echo them, never write them into a file the user did not ask for, never commit them. If one is pasted into chat, tell the user to rotate it.
- **Non-production, fake data only.** Record against a local or staging build seeded with fictional people, companies, emails and round numbers. Never a production URL and never real customer data. If `base_url` looks like production, stop and ask.
- **Independent review.** The agent that wrote a script never checks it, and the agent that built a video never QAs it. Use the plugin's agents: `script-writer` drafts, `script-checker` checks, `camera-editor` plans zooms, `qa-scrubber` scrubs the final video. A reviewer that finds a problem reports it; the author fixes it; the reviewer checks again.
- **Report what you verified.** Say which checks ran and what they showed. A script that has not been dry-run is not checked; a video nobody has watched is not QA'd.
- `out/` holds generated files and is git-ignored. Never commit it.

## Setup (once per app)

1. The CLI is a dev dependency of the app: `npm i -D github:Sharodeworld/narrated-demos`.
2. `npx narrated-demos init` creates `demos/` with `demo.config.json`, `voice.config.json`, `features.md`, `scripts/`, `camera/`, `.gitignore` and `.env.example`.
3. The user fills in `demos/.env` themselves (copy from `.env.example`). Check only that the variable names exist, for example with `grep -c '^ELEVENLABS_API_KEY=.' demos/.env`; never print values.
4. Edit `demo.config.json` with the user: `base_url` of the non-production build, `viewport` (16:9), brand name, colors, optional logo, and the card text (`cards.title`, where `{title}` becomes the script's title, and `cards.end`).
5. Prerequisites: Node 20.12+, ffmpeg and ffprobe on the PATH, a headless Chromium (`npx playwright-core install chromium-headless-shell`, or `DEMO_CHROMIUM_PATH`), and an ElevenLabs plan that allows commercial use.

Run every CLI command from `demos/`.

## Phase 1: Map features

Read the app: routes, navigation, main screens, feature flags, README. Fill `demos/features.md`, one row per user-facing feature: name, entry URL, user goal in one line, key steps, data it needs, whether selectors are stable, priority. Note where recordings run, the fake seed, and wording limits (simulated or planned features, icon-only states, prices). Propose a pilot of three to five high-value features with stable UI.

If an element has no stable selector, propose adding `data-testid` attributes in a separate small change rather than relying on fragile CSS.

**Gate:** the user approves the inventory and the pilot list.

## Phase 2: Write and check scripts

Give the `script-writer` agent the approved feature row. It writes `demos/scripts/<slug>.yaml`:

```yaml
feature: create-task          # the slug: lowercase, hyphenated, same as the file name
title: Plan your week in a minute
start_url: /tasks?demo=1      # appended to base_url
steps:
  - say: "Planning a week of work shouldn't take a meeting."
    do: []
    pad_ms: 400               # optional: hold the screen this long after the line
  - say: "Start from a template instead of a blank list."
    do:
      - click: "role=button[name='Templates']"
      - waitFor: "text=Weekly plan"
```

Actions are `click`, `hover` and `waitFor`, each with a Playwright selector string. A click or hover target must match exactly one element. Writing guidelines: 45 to 90 seconds at about 130 to 150 spoken words a minute; open with the user's problem, show the steps, close with the result; one line per on-screen action, plain sentences under 20 words; say what the viewer sees and why it matters rather than reading labels aloud; every claim must be visible on screen.

Then give the script to the `script-checker` agent (never the writer). It runs `npx narrated-demos check <slug>` against the non-production build, compares each line with the screen, and reports pass or the exact failures. Loop writer and checker until it passes.

**Gate:** the user approves the script text. Changing a line later costs a new clip.

## Phase 3: Voice

`npx narrated-demos voice <slug>` makes one clip per step in `out/<slug>/audio/` and writes `out/<slug>/timings.json`. Clips are cached by a hash of the voice id and the exact request, so only changed lines (or lines next to a changed line, because neighbours are sent as context) are billed again. Changing `voice.config.json` or the voice re-voices everything; say so before doing it.

Ask the user to listen to every clip. Fix mispronunciations by respelling the word in `say`, then re-run voice.

**Gate:** the user approves the narration.

## Phase 4: Record

Optional: the `camera-editor` agent writes `demos/camera/<slug>.mjs` with zooms and highlights (interface in the README and in the agent). Without a plan the video stays on the full frame with cursor and click ripples.

`npx narrated-demos record <slug>` replays the script headless at 2x pixels, holding each step for its clip plus `pad_ms` plus a 250 ms breath, and writes `out/<slug>/cues.json`. It prints any step that ran long; a slow action makes the narration wait and is never cut short. If a selector fails, go back to Phase 2.

## Phase 5: Merge

`npx narrated-demos merge <slug>` writes `out/<slug>/<slug>.mp4` (1920x1080 H.264 crf 20, AAC 192k at -16 LUFS) and `<slug>.srt`. It fails if any clip ends less than 250 ms before the next one starts, and prints the gaps and loudness. `npx narrated-demos run <slug>` does voice, record and merge in one go once each phase is approved.

## Phase 6: QA

Give the finished MP4 to the `qa-scrubber` agent (never the agent that built it). It scrubs frames for real names, emails and numbers, checks sync against the .srt, loudness, length, format and the 250 ms gaps, and reports pass or the exact timestamps that fail. If real data shows anywhere, re-seed and re-record; do not blur it.

**Gate:** the user watches the video, in a browser and on a phone, and signs off. Publishing is the user's decision and is outside this process.

## Where things stand

For a slug, the files say how far it got: `scripts/<slug>.yaml` (Phase 2), `out/<slug>/timings.json` (Phase 3), `out/<slug>/cues.json` and `recording/` (Phase 4), `out/<slug>/<slug>.mp4` (Phase 5). Approval is not in the files; ask.
