# Implementation-session handoff

Goal and attempt: the fixture pages as one project at work, behind `?demo=1` (`docs/plans/demo-data.md`), attempt 1. Luis, before the walkthrough video: «Simula lo más cercano posible a la experiencia real», and a readout «con estadísticas, gráficos, algo que sí sería útil».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `demo/video-data` on `main` `95c375c`, 2026-10-07
Ending commit/tree: the final change is commit `04dac8af3246da4af0de912a43c680643200807a` (tree `aeb8b8c051b7f13e910d8578c8f3a6675a99dfd6`): `tamper=html` now alters the demo's designed page as it does the fixture's (Codex on #151, P2), with its check in `apps/studio/e2e/report.spec.ts`. Before it: `6c95092` and `f14b1850d893271e86f08a78d7d6b75e3cb2dafe` (tree `793fab259070d8af8813ea9cb6a410c66af579c2`), which touch only `apps/studio/fixtures/` (15 files) and `docs/plans/demo-data.md`. The commit after it changes only this file.

## Outcome

**Fixtures only.** Nothing under `apps/studio/src/` changes, and nothing ships in the Studio's build.

**With `demo` in the address,** every fixture page tells one project: «Onboarding pilot».

- The readout «Pilot readout: what kept 12 of 14 teams», in two versions with four cited sources.
- A designed HTML page for each version: four key figures, charts in inline SVG, findings, a timeline, a comparison table, recommendations. Static, as the viewer's sandbox requires.
- Around it: the meeting's decisions, three conversations, Home's live room, the viewer «Luis», and a shared screen that draws the pilot's weekly active teams.
- Every page keeps its label, «Demo · simulated data».

**Without `demo`:** every value is the fixture's, as before; the checks' words are untouched.

## Evidence

- **Hashes:** each version's Markdown and designed page match their SHA-256 (a one-off script over `demo.ts` and `demo-page.ts`: v1 `4403c3ff…fc6d` / `7bd1bc66…7a92`, v2 `58e28210…970d` / `4b579aa4…074c`). The viewer refuses a mismatch on screen, and it shows both.
- **On screen:** every demo page was scanned for «fixture», «synthetic», «labelled» or «test data»; none left. The walkthrough video Luis received (3 min 40 s) was recorded on these pages.
- **Gates:** `tsc --noEmit`, `oxlint --type-aware` on the 15 files, Prettier.
- **Codex on #151 (P2):** `?demo=1&tamper=html` served the demo page unaltered. A new check failed first, then passes; the eight `HTML ·` checks pass.
- **Browser checks:** not run locally on this branch; CI runs the full suite without `demo`, which must pass as on `main`.

## Remaining obligations

- The A13 search proposal should say a snippet is plain words (the demo strips citation ids and emphasis marks from its snippets).

**Source-register IDs consulted:** none.

## Next bounded action

Merge on green and no Codex P1. Then Knowledge's first «$20» slice (K1) builds on these pages.
