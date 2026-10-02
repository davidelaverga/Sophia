# Implementation-session handoff: LFE-06, attempt 2 (capacity honours valid_until and applicability)

- **Goal and attempt:** Codex's two P2s on #47 ([attempt 1](LFE-06-attempt-1.md)). Luis asked for both to be fixed.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `follow-ups/capacity-validity` from main `cb78c86`, 2026-10-02.
- **End:** the fix and docs at `cecea8b` (tree `503ae03ae79b`), the head the checks below ran on. The commit after it changes only this line.
- **Writable scope:** `apps/studio/src/features/resources/`, its fixture and checks, CONTRIBUTING and LFE-06's records. **Nothing else changed.**

## Outcome

- **A reading past its `valid_until` is unknown** ([`resource.ts`](../../apps/studio/src/features/resources/resource.ts)). The line reads "Capacity unknown: the last reading expired 10 min ago", and every window up close says "Expired" with no value. Before, the old percentage stayed on screen as current capacity.
- **Only a window known to apply limits the resource.** A window with `applicability` `unknown` or `partial` is still shown, with its value and "· may not apply here" or "· applies in part", but it never becomes the headline. When no window is known to apply, the line reads "Capacity unknown: no window is known to apply here".
- **The fixture** has Davide's Claude account report a model-scoped window that may not apply (88 %, while the headline stays at the 5-hour 63 %). `stale=1` expires Codex's reading.

## Evidence

- **New checks.**
  - The RES-02 browser check now also looks for the window that may not apply.
  - A new browser check covers the expired reading.
  - Two new unit tests (`resource.test.ts`: 7 pass).
- **Mutations.** Thirteen resource mutations each make their check fail, every run on a fresh fixture server. The new ones:
  - an expired reading shown as current;
  - a window that may not apply limiting the resource.
- `pnpm --filter @sophia/studio test:browser`: 26 checks. With `--repeat-each=3` and 4 workers, 78 of 78 pass.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: the new tests pass, plus the 5 known failures on Windows, as on main.

## Remaining obligations

- **Davide:** the resource and action shapes, and the capacity observation as SCM-02's collector will send it.

## Next bounded action

- LFE-06.4 once assignment ids and epochs exist. LFE-02 when PR32 is in `main`.
