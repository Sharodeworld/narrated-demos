# Feature inventory for demo videos

Phase 1. One row per feature a user can see and use. A person reviews this list and picks the pilot before any script is written. The example row is for a fictional app; replace it.

**Where recordings run.** Name the non-production build the recorder uses (URL, branch or commit, and how it starts) and the fake data it is seeded with. Never a production site, and never real customer data.

**Selectors.** Say how the recorder finds elements: `data-testid` attributes, or role and accessible-name locators such as `role=button[name='Save']`. List any element that needs a test id first, and add those in a separate small change.

**Seed.** Describe the fake data the videos rely on (workspaces, records, round numbers), so a re-seed keeps every video valid.

## Proposed pilot

Three to five features with high value and a stable UI.

1. Create a task from a template

## Features

| Feature | Entry URL | User goal | Key steps | Data it needs | Stable selectors? | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Create a task from a template | `/tasks?demo=1` | Plan a week of work in a minute | Open templates, pick the weekly plan, see the tasks added, point at Assign | One empty fake workspace | Yes, by role and name | Pilot |

## Wording limits for the scripts

List anything the narration must not claim: features that are simulated or planned, states shown only as icons, numbers that change with the seed, prices.
