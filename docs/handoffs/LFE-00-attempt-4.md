# Implementation-session handoff: LFE-00, attempt 4 (a lost call, with the panel open on a phone)

- **Goal and attempt:** [LFE-00](../execution/2026-10-01-unified/frontend/LFE-00.md), session 00.3, follow-up to [attempt 3](LFE-00-attempt-3.md). Codex left one P2 on #41: the phone check closed Chat before the call dropped, so it read the lost call only from the dock. A message missing from the panel would have passed. Luis asked for it to be fixed.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-00/drop-in-panel` from main `9dd0019`, 2026-10-02.
- **End:** the check and docs at `c4c3c8f` (tree `59e4fee8200c`), the head the checks below ran on. The commit after it changes only this line.
- **Writable scope:** one browser check and LFE-00's records. **No product code, schema, dependency or hosted service was changed.**

## Outcome

[`room.spec.ts`](../../apps/studio/e2e/room.spec.ts), `BASE-03 @phone · leaving, a lost connection and the way back`: the call now drops while the Chat panel covers the room. The check reads the lost call where the product says it:

- **With Chat in view:** the chat's foot says "You were disconnected from the room.", and Chat with Sophia is in reach (`footError` in `Composer`). The panel's own line stays empty while the chat is in view, by design (`panelNote`).
- **With Brief in view:** the panel's line says it.
- **After Close:** Try again in the dock is in reach and brings the call back.

## Evidence

- `pnpm --filter @sophia/studio test:browser`: 6 of 6 pass locally.
- **Sixteen mutations of product code** each made their case fail, every run on a fresh fixture server. The code was restored after each one. They are attempt 3's fourteen plus two new ones:
  - the chat's foot says nothing of the room's error;
  - the panel's line says nothing of the call.
- `pnpm format:check`, `pnpm lint` and `pnpm typecheck` pass.

## Remaining obligations

- **Davide confirms the one-writer map** ([attempt 1](LFE-00-attempt-1.md#remaining-obligations)).
- BASE-01 to BASE-03 in a live call, and BASE-04, when a hosted candidate exists.

## Next bounded action

- LFE-02 with PR32's author: the report and PDF UI. Then LFE-03 on fixtures.
