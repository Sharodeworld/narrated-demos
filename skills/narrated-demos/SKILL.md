---
description: Makes narrated product demo videos with the narrated-demos CLI, one phase at a time with a person approving each phase. Use when asked to map features for demo videos, write or check a demo script, generate narration, record, merge or QA a demo video.
argument-hint: "[phase] [feature-slug]"
---

# Narrated demo videos

You run a phase-gated process that turns a YAML script into a narrated demo video (1920x1080 MP4 plus a separate .srt). Narration is generated first; the recording is paced to it, so voice and screen stay in sync without hand editing. The `narrated-demos` CLI does the mechanical work. Your job is the judgement around it, and stopping at every gate.

Arguments, if given: `$ARGUMENTS` (a phase and a feature slug). Without them, find out where the work stands (see "Where things stand") and propose the next phase.

## Rules that always apply

- **A person approves every phase.** End each phase by showing what it produced and asking for approval. Do not start the next phase in the same turn, and do not treat silence or an agent's report as approval.
- **Ask with the question tool.** At every gate, and whenever the user has to choose, ask with the host's interactive question tool (`AskUserQuestion` in Claude Code) rather than in prose, so each answer is a click. Write each question so it stands alone: name the slug, say what was produced and where to look, because the user may see only the dialog. A call holds up to four questions with two to four options each; batch related questions into one call, and use `multiSelect` when several answers can apply. If you recommend an option, put it first with "(Recommended)" after its label, but never recommend Approve or Sign off: the user judges those by reading, listening or watching. There is always an "Other" box for free text: treat it as the user's own answer (revision notes, at a gate). When there are more choices than fit, offer the likeliest and let "Other" take the rest. When the user picks an option that needs detail, such as Revise or Re-voice, ask a follow-up question for it. Only you ask; the plugin's agents report back to you. Ask only for decisions, never for something the files or config already answer. If the host has no such tool, ask the same question in chat with numbered options and wait for the reply.
- **Secrets stay in `.env`.** The ElevenLabs key and voice id live in `demos/.env` (git-ignored) or the shell environment. Never ask for them in chat, never echo them, never write them into a file the user did not ask for, never commit them. If one is pasted into chat, tell the user to rotate it.
- **Non-production, fake data only.** Record against a local or staging build seeded with fictional people, companies, emails and round numbers. Never a production URL and never real customer data. If `base_url` looks like production, stop and ask.
- **Independent review.** The agent that wrote a script never checks it, and the agent that built a video never QAs it. Use the plugin's agents: `script-writer` drafts, `script-checker` checks, `camera-editor` plans zooms, `qa-scrubber` scrubs the final video. A reviewer that finds a problem reports it; the author fixes it; the reviewer checks again.
- **At least one revision round.** Nothing is great in one take. Every script and every video goes through at least one review, a revision by its author and a second review before the user sees it, even when the first review passes. Reviewers always name improvements, not only failures. When you show the user the result, say what the revision changed.
- **Report what you verified.** Say which checks ran and what they showed. A script that has not been dry-run is not checked; a video nobody has watched is not QA'd.
- `out/` holds generated files and is git-ignored. Never commit it.

## Setup (once per app)

1. The CLI is a dev dependency of the app: `npm i -D github:Sharodeworld/narrated-demos`.
2. `npx narrated-demos init` creates `demos/` with `demo.config.json`, `voice.config.json`, `features.md`, `scripts/`, `camera/`, `.gitignore` and `.env.example`.
3. The user fills in `demos/.env` themselves (copy from `.env.example`). Check only that the variable names exist, for example with `grep -c '^ELEVENLABS_API_KEY=.' demos/.env`; never print values.
4. Edit `demo.config.json` with the user: `base_url` of the non-production build, `viewport` (16:9), brand name, colors, optional logo, and the card text (`cards.title`, where `{title}` becomes the script's title, and `cards.end`).
5. Prerequisites: Node 20.12+, ffmpeg and ffprobe on the PATH, a headless Chromium (`npx playwright-core install chromium-headless-shell`, or `DEMO_CHROMIUM_PATH`), and an ElevenLabs plan that allows commercial use.

Run every CLI command from `demos/`.

## Bubble apps

When the app is built on Bubble, set `"platform": "bubble"` and `"bubble": { "app": "<app id>", "branch": "<branch>" }` in `demo.config.json` instead of `base_url` (README, "Bubble apps"). The BuildPrint CLI (`buildprint`) must be installed. These steps and rules add to the ones above.

1. **Branches.** List them with `buildprint branch list <app> --json`, then ask which branch to use as the default (`bubble.branch`), with the branch names as the options. In Phase 1, ask for each feature which branch it lives on; a script for a feature on another branch sets `branch: <name or id>`.
2. **Map from a read-only copy.** Read the pages, elements and workflows from a clone of that branch (`buildprint project clone <app> --branch <branch> --dir <dir>`), or from `buildprint open <file.bubble>` on an export the user gives you. Only read it.
3. **Sign-in.** The user runs `npx narrated-demos login <email> --branch <branch>` themselves, from `demos/`, with a test user's email. Do not run it for them. Never open, print or paste anything in `demos/.auth/`: it holds a live session and the run-mode password.
4. **Never record live.** `check` and `record` refuse the live branch and stop if a page leaves the development branch. Never open the live app (its root URL or `/version-live`) in any browser either.
5. **One shared database.** All development branches share one database, so seeding demo data for one branch changes every branch. Before creating or changing any data, ask with the options to keep the data as it is or to create or change exactly the records you list.
6. **No changes to the app without approval.** Never run `buildprint apply`, any data write, or `buildprint branch create` or `delete` unless the user has explicitly approved that exact action.
7. **Selectors.** Bubble element names never reach the page and its class names are generated. Tell `script-writer` to use role and accessible name first, then visible text, then an HTML id the user adds to the element on the development branch. Hidden elements are not counted as matches. If a list renders late, add `ready: <selector>` to the script.

## Phase 1: Map features

Read the app: routes, navigation, main screens, feature flags, README. Fill `demos/features.md`, one row per user-facing feature: name, entry URL, user goal in one line, key steps, data it needs, whether selectors are stable, priority. Note where recordings run, the fake seed, and wording limits (simulated or planned features, icon-only states, prices). Propose a pilot of three or four high-value features with stable UI.

If an element has no stable selector, propose adding `data-testid` attributes in a separate small change rather than relying on fragile CSS.

**Gate:** the user approves the inventory and the pilot list. In one call, ask whether to approve the inventory (Approve or Revise) and which features to pilot, as a `multiSelect` question with your proposed pilots as the options.

## Phase 2: Write and check scripts

Before the first script, ask who the videos are for (for example prospects, existing customers, the internal team, or one named client) and who narrates (the company as "we", or a neutral voice), and pass both answers to `script-writer`. Give the `script-writer` agent the approved feature row. It writes `demos/scripts/<slug>.yaml`:

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

Actions are `click`, `hover` and `waitFor`, each with a Playwright selector string. A click or hover target must match exactly one visible element. Writing guidelines: 45 to 90 seconds at about 130 to 150 spoken words a minute; open with the user's problem, show the steps, close with the result; one line per on-screen action, plain sentences under 20 words; say what the viewer sees and why it matters rather than reading labels aloud; every claim must be visible on screen.

Then give the script to the `script-checker` agent (never the writer). It runs `npx narrated-demos check <slug>` against the non-production build, compares each line with the screen, and reports pass or the exact failures, plus the improvements it would still make. The writer revises, and the checker reviews the revision. Loop until it passes, and do at least one revision round even if the first check passes.

**Gate:** the user approves the script text. Changing a line later costs a new clip. Ask with the options Approve, Revise and Stop (leave this slug at Phase 2), and put the `say` lines in the Approve option's preview so the user can read them in the dialog.

## Phase 3: Voice

`npx narrated-demos voice <slug>` makes one clip per step in `out/<slug>/audio/` and writes `out/<slug>/timings.json`. Clips are cached by a hash of the voice id and the exact request, so only changed lines (or lines next to a changed line, because neighbours are sent as context) are billed again. Changing `voice.config.json` or the voice re-voices everything; say so before doing it.

Ask the user to listen to every clip. Fix mispronunciations by respelling the word in `say`, then re-run voice.

**Gate:** the user approves the narration. Ask with the options Approve and Re-voice; on Re-voice, ask which steps and what is wrong (for example a mispronounced word).

## Phase 4: Record

Optional: the `camera-editor` agent writes `demos/camera/<slug>.mjs` with zooms and highlights (interface in the README and in the agent). Without a plan the video stays on the full frame with cursor and click ripples.

`npx narrated-demos record <slug>` replays the script headless at 2x pixels, holding each step for its clip plus `pad_ms` plus a 250 ms breath, and writes `out/<slug>/cues.json`. It prints any step that ran long; a slow action makes the narration wait and is never cut short. If a selector fails, go back to Phase 2.

## Phase 5: Merge

`npx narrated-demos merge <slug>` writes `out/<slug>/<slug>.mp4` (1920x1080 H.264 crf 20, AAC 192k at -16 LUFS) and `<slug>.srt`. It fails if any clip ends less than 250 ms before the next one starts, and prints the gaps and loudness. `npx narrated-demos run <slug>` does voice, record and merge in one go once each phase is approved.

## Phase 6: QA

Give the finished MP4 to the `qa-scrubber` agent (never the agent that built it). It scrubs frames for real names, emails and numbers, checks sync against the .srt, loudness, length, format and the 250 ms gaps, and reports pass or the exact timestamps that fail, plus the improvements it would still make (pacing, camera, what the viewer sees). Revise the script, camera plan or recording, re-render, and have it QA the new cut: at least one revision round, even if the first QA passes. If real data shows anywhere, re-seed and re-record; do not blur it.

**Gate:** the user watches the video, in a browser and on a phone, and signs off. Publishing is the user's decision and is outside this process. Ask with the options Sign off and Needs changes. On Needs changes, ask what to change as a `multiSelect` question: camera (too zoomed in or too wide), pacing (silent gaps or rushed lines), words, and data on screen.

## Where things stand

For a slug, the files say how far it got: `scripts/<slug>.yaml` (Phase 2), `out/<slug>/timings.json` (Phase 3), `out/<slug>/cues.json` and `recording/` (Phase 4), `out/<slug>/<slug>.mp4` (Phase 5). Approval is not in the files: ask whether the last phase the files show was approved, with going on to the next phase as one of the options.
