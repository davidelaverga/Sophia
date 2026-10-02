# Implementation-session handoff: reading a PR to break it, attempt 1

- **Goal and attempt:** a rule in CONTRIBUTING for reading a PR before it is ready. It comes from what the reviews of #23 and #24 found: ten real defects in three rounds, all missed by those PRs' own checks. First attempt; not a pack goal. Luis started it on 2026-09-30, after those rounds.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `contributing/before-ready` from main `ba983e7` (#23's merge), 2026-09-30; first commit `431f6d5`.
- **End:** the docs at `ba9de57` (tree `46a64af19212`), with main merged in. The commit after it changes only this line. Changed: `CONTRIBUTING.md` (its top list) and this file.
- **Writable scope:** this repository. **No hosted service was changed.**

## Outcome

CONTRIBUTING's top list gains four rules, and the regression-test rule one sentence:

- **A test that can hang is not a check.** Race what is awaited against a sentinel and assert that the sentinel lost: `node --test` counts a hang as cancelled, not failed.
- **Before writing a feature, write down its states.** List each state and transition (screen, keyboard and screen reader, on a phone and wide), what the change covers or unmounts, its failures, and the platforms the build targets.
- **One concern per PR.**
- **Before a PR is ready, read it to break it:**
  - walk the states each changed function can meet;
  - follow a new state or failure into every caller;
  - fix a finding as a class;
  - read every returned error;
  - remove a race rather than fence it;
  - before each push, get one independent review of the whole diff;
  - check a rule against the code before writing it.
- **Merge after the last push's review.**

Missing or unverified: these are working rules, and nothing in the gate enforces them.

## Evidence

- `pnpm format:check`: clean. Docs only; no code changed.
- The PR's description lists the pattern each rule answers and where it happened (#23, #24).
- Codex's reviews:
  - on `431f6d5`, one P2: a hang guard raced a value already settled. Fixed in `c5d1bbe` and `9281b56`.
  - on `04fcd8d`, one P1: this handoff was missing. Fixed here.

## Decisions and changes

- **Rules, not a checklist file:** they sit in the top list that every PR is held to.
- **The personal space's 28 review rounds since then** (#30) bear them out. Fixing a finding as a class, and the inventory by invariant, are recorded in `docs/handoffs/PS-01-attempt-1.md`.

## Remaining obligations

None.

## Next bounded action

Review and merge, after this push's review.
