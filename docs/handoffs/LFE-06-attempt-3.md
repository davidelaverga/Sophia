# Implementation-session handoff: LFE-06, attempt 3 (a balance heads the capacity; unknown is unknown)

- **Goal and attempt:** M03-RF-0024 (P3), which Codex found on PR #32 and M03 handed to LFE-06 on [#31](https://github.com/davidelaverga/Sophia/issues/31). Also #48's open P2 in the same function. Luis asked for both.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/capacity-balances` from main `3e46e48`, 2026-10-02.
- **End:** the fix and docs at `ea7cad9` (tree `500fa449f54c`), the head the checks below ran on. The commit after it changes only this line.
- **Writable scope:** `capacityLine` in `apps/studio/src/features/resources/resource.ts`, its unit tests and LFE-06's records. **Nothing else changed.**

## Outcome

`capacityLine` now reads only the windows known to apply, in this order:

1. the most used percentage;
2. else "Refresh pending", or "Capacity unknown" for a window whose state is unknown, while any such window is unresolved. A balance can't be weighed against them (Codex's P2 on #49);
3. else an observed balance, as reported: "100000 tokens left", "42 credits left". No percentage is made of it.

Two more cases:

- "No window observed" is kept for a reading with no windows at all.
- Windows that may not apply never shape the line, not even with a due reset. When only those exist, it reads "Capacity unknown: no window is known to apply here".

Before:

- **The bug M03-RF-0024 named:** a balance or an unknown window headed "No window observed".
- **#48's P2:** a due reset on an uncertain window headed "Refresh pending".

## Evidence

- **Unit tests.** `resource.test.ts` has 10 tests. Three are new: M03-RF-0024's two balance units and the unknown window; the uncertain window with a due reset; and a balance beside an unresolved window.
- **Mutations.** Four unit-level mutations each fail them:
  - no balance branch;
  - no unknown branch;
  - uncertain windows counted;
  - the balance checked before unresolved windows.
- `pnpm --filter @sophia/studio test:browser`: 26 pass.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: the new tests pass, plus the 5 known failures on Windows, as on main.

## Remaining obligations

- **Davide:** the resource and action shapes (SCM-01/02).

## Next bounded action

- LFE-06's UX and quality-of-life pass on the panel (Luis asked for it). LFE-02.2 when PR32 is in `main`.
