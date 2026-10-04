# Implementation-session handoff: the opening, attempt 2 (#85: CI and Codex's P2)

- **Goal and attempt:** this attempt fixes what #85's first run found: one browser check failing on CI, and Codex's P2.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `entry/opening` at `ec023e4`, 2026-10-04.
- **End:** content commit `de6e850`; its checks ran on it.
- **Writable scope:** `src/app/entry.ts`, `entry-progress.ts` and their checks; the opening's fixture. **No contract changed.**

## Outcome

- **Tab stays in the opening.** Stopping the app's key listeners left Tab's own move, so focus could reach a control under the opening and Enter could press it unseen. Tab is now held in the opening: its Start over, once shown. Whatever held the focus under it lets go when it shows.
- **A late frame never makes the bar leap.** CI's slower runners showed the bar step 0.2 in one frame. A frame counts as 34 ms at most, so after a hitch the bar catches up smoothly.

## Evidence

- **Tests first:**
  - the keys check now asserts focus after each Tab. It failed on attempt 1: the fixture's Account button took the focus. Its earlier pass was only the parity of four Tabs over a page with nothing to focus.
  - a unit test: a 1000 ms frame moves the bar as far as a 34 ms one.
- **Mutations, each killed:** Tab not contained; a late frame leaping; the focus kept under it.
- **Gates:** `lint`, `typecheck` and `opening.spec.ts --repeat-each=2` (20 of 20) pass; the unit tests pass (8 of 8).
