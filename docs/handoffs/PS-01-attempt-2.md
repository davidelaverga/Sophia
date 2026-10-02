# PS-01 · Attempt 2 — the follow-ups to #30

- **Goal:** [docs/goals/personal-space.md](../goals/personal-space.md). Attempt 1 ([PS-01-attempt-1.md](PS-01-attempt-1.md)) built it: #35 (data) and #30 (Studio), merged on 2026-10-01.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `personal/follow-ups` from main `7e640bc` (#30's merge), 2026-10-01.
- **End:** the code at `<code>` (tree `<tree>`), the head the checks below ran on. The commit after it changes only this line.
- **Writable scope:** this repository. **No hosted service was changed.**

## Outcome

Codex's last review of #30 (on `84a7c76`) found two P2 and no P1, so #30 merged under Luis's rule (merge when there is no P1) and these two came here:

- **A note carried twice.** The carry's guard ended with its 440 ms slide. With a slow write, the note came back within reach and could be carried to another project; one of the two writes was refused, and its notice could replace the first's. Now the note stays crossed, out of reach, until its write settles, and comes back if the write failed. The write goes through `presses.ts`, keyed by the note, as Take back does.
- **A clipboard write past the padlock.** Once the browser has the text, the write can't be called off. One that settled after the sheet closed or the padlock shut still landed, and said "Copied". Now such a copy is taken back: the clipboard is emptied as far as the browser lets a page, and nothing says it was copied.

Missing or unverified:

- **Emptying the clipboard needs the page focused** (in Safari, a press), so where the browser refuses it the text stays. A system clipboard history may keep what was written.
- **Chromium only.** The clipboard was checked there, on a stand-in that writes 1.5 s late.

## Evidence

- **Gates:** format, lint, typecheck, contracts check, the build and the Studio build. Unit tests: 552 pass, plus the 5 known failures on Windows. Studio tests: 320.
- **Browser** (`personal-followups`, on the personal stack):
  - a note carried while its write is slow: it stays crossed and out of reach, one write goes, and it says where it went;
  - a copy whose clipboard write is slow, with the sheet closed meanwhile: nothing of the space stays on the clipboard, and nothing says Copied;
  - a note whose carry fails: crossed while the write is on its way, then back within reach, with the failure said.
- **Earlier suites:** the ten earlier personal suites that copy or carry all pass.
- **Mutations:** each fix undone once fails its test or scenario (4 of 4).

## Decisions and changes

- **The carried note stays out of reach** rather than saying "Carrying…": it no longer bounces back after its slide, and nothing in it can be pressed while it crosses.
- **Emptying the clipboard is the most a page can do** after the fact. The alternative, holding the padlock until the write settles, would let a call wait on a clipboard.

## Remaining obligations

None: no hosted service was changed, and the local stack is stopped.

## Next bounded action

Review and merge this PR, under the same rule: no P1.
