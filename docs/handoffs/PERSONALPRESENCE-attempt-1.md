# Implementation-session handoff

Goal and attempt: Personal's presence pass (`docs/plans/personal-presence.md`), attempt 1  
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine  
Native session: a local Claude Code session; its identity is unknown (not exported)  
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `personal/presence` from `main` at `5dec922`, 2026-10-04  
Ending commit/tree and changed files: content commit `4809316` (tree `836834dacc53`); these files changed:
- `apps/studio/src/features/personal/personal.css`;
- `apps/studio/e2e/personal.spec.ts`;
- `docs/plans/personal-presence.md`.

## Outcome

**What a person meets now in Personal:**
- the conversation rests on the field: a phone's first visit had 394 px of nothing between her greeting and where you write; now it has 48 px or less;
- her turns read first, at 17 px, over yours at 15;
- an exchange reads as one: her answer sits 12 px under what you said, and the next thing you say starts 28 px after;
- a failed reply stands where her answer would;
- "Write to Sophia…" reads at 4.5:1 or more (it was about 2:1).

**The independent review found no P1.** Its two P2s:
- **Fixed:** the resting check could pass vacuously (a missing bar, or a list that overflows). It now needs both elements and a list that fits.
- **Disproved:** the reviewer suspected the placeholder check was vacuous. That check failed before the change (1.99:1), and it kills its mutant.

Its P3s are fixed too:
- rows tied to a turn keep their offsets;
- the 9 px for her half applies only to her 17 px turns;
- the placeholder is at full opacity;
- the guard checks assert non-null;
- the note's viewport is aligned with the tests.

## Evidence

**Commands** (browser checks through `D:\Descargas\SophiaV4\.claude-guards\pw-safe.ps1`: 3 workers, below-normal priority, watchdog, no GPU):
- **Tests first:** `pw-safe.ps1 e2e/personal.spec.ts -g "presence|five sizes"` failed 6 of 7 before the change. The one that passed is the guard against an unsafe `end`.
- **Personal:** `pw-safe.ps1 e2e/personal.spec.ts --repeat-each=2`: 84 of 84 passed.
- **Full suite:** `pw-safe.ps1`: 330 of 330 passed.
- **Mutations** (`<scratchpad>/mutate-presence.py`, using Git's bash and the guards): 8 product mutants killed, and the control survives.
  - top of an empty room;
  - greeting far from the field;
  - first day unreachable;
  - her voice at 15;
  - answers drift;
  - faint placeholder;
  - failed far from you;
  - her half off-centre.

**From the repo root** (Node 24.21): `pnpm format:check`, `lint`, `typecheck` and the Studio's build pass.

**Source-register IDs consulted:** none.

## Decisions and changes

**`safe end`, not `end`.** A long conversation must still scroll to its first day. If a browser doesn't parse `safe`, the declaration is dropped and the list falls back to the start.

**A fifth size (17 px), for her turns only.** Her set-apart pieces stay at 15, because they are asides, not her turn: the week's look back and a suggestion.

**The checks measure at rest.** They wait for each turn's arrival animation. Without that wait they flaked by the animation's travel.

`theme.css` (Davide's #76) is untouched.

## Remaining obligations

**This PR awaits Luis's merge OK.**

**The next small PR: Codex's P2s on #89 and #90.**
- wait for cross-tab admission before dismissing the week;
- stop dictation before a live talk;
- contrast in the empty notes and on the talk's status line, with the contrast check reaching the portalled talk.

**P3s still open:**
- `.room-pill .live` names a missing `ps-dot-pulse`;
- the focus line is 2.71:1 against the unfocused hairline;
- Home's first-line placeholder (`.hw-say`) is at about 3.9:1.

## Next bounded action

Luis reviews the PR. Then comes the P2 follow-up PR.
