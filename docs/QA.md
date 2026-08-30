# Cross-device QA matrix

What has been verified, how, and what still needs a human with a real device.

## Automated, every commit

| Check | Where |
| --- | --- |
| Content schema, house style, dead ends, coverage of all 131 objectives, hints, post-mortems, post-incident reviews | `manage.py validate_content --require-all-chapters` in CI |
| Engine rules: reputation, perks, time budgets, progression, migration, mastery, review drills, post-mortems | 60 Vitest tests in CI |
| API, back office, content pipeline | 59 pytest tests in CI |
| Type check and production build | `vue-tsc` and `vite build` in CI |

## Verified by hand with a headless Chromium

Run at 320, 390, 768 and 1440 CSS pixels against the built app.

| Width | Layout | Result |
| --- | --- | --- |
| 320 | Single column, choices full width, map behind a thumbnail | No horizontal page scroll. No element overflows its container except command panes, which scroll inside themselves. All visible touch targets at least 44 px tall. |
| 390 | As above | Career screen renders all nine chapters and 75 quest cards with no horizontal scroll. |
| 768 | Feed plus collapsible map side panel (304 px) | Side by side, no horizontal scroll, map renders 29 nodes. |
| 1440 | Persistent two-pane: feed 808 px, map 416 px | Side by side, no horizontal scroll. |

Also verified: dark theme tokens apply to body, cards and text; the map opens as a
full-screen sheet on phones and closes again; a wrong answer costs reputation,
opens the post-mortem, and only then re-prompts from the remaining options, with
the claw-back applied on a correct lesson; the resolved-encounter debrief reveals
the options not taken; a closed incident shows the senior's diagnostic path with
ran and missed markers; the hint perk posts its nudge without ruling anything
out; a due follow-up drill runs end to end with reputation untouched and the
ladder stretched; a schema-1 save with a run mid-encounter migrates in place and
resumes; command output renders in the monospace console pane; a completed quest
offers the next one.

## Still needs a real device

The engines behind headless Chromium and a phone browser are not the same, and
some of the things most likely to break are hardware behaviors:

- **Safari on iOS**: safe-area insets on a notched phone, momentum scrolling
  inside the command pane, and pinch zoom on the full-screen map sheet.
- **Chrome on Android**: the address bar collapsing and expanding against
  `min-h-dvh`, and pinch zoom on the map.
- **Tablet landscape**: the 1024 px boundary between the collapsible panel and
  the persistent two-pane layout.
- **Reduced motion and increased text size**: the app honors
  `prefers-reduced-motion` and uses a fluid type scale, neither of which is
  exercised by an automated run.

None of these are blocking: the layout is a single column below 640 px with no
fixed widths, which is the configuration least likely to break on a real phone.
