# S1-05A checkpoint D: access and recovery gaps closed

**Recorded:** 2026-09-25, S1-05A attempt 1 (Claude Code). **Base:** checkpoint C (`07dc4fb`). The environment was the same as checkpoint C: Node 24.21.0, pnpm 11.7.0, PostgreSQL 16.13, and the pinned `livekit/livekit-server:v1.13.7` image. No provider key was used.

## What now works

- **Removing a guest from the call is a durable obligation** (amendment A07, migration 0014). This applies when a guest who was let in is declined or blocked.
  - **Recording.** The decision records a pending removal in the same transaction. The database already refused them a new token; the removal takes away the call they may still be in.
  - **Immediate attempt.** The API tries once, right away.
  - **Settling.** A removal settles only on the LiveKit server's evidence: `removed`, or `absent` when the server itself lists the guest gone. A failed call or an unreachable server leaves it `pending` with the error and the attempt count. The old helper's `false` is gone, and nothing waits for token expiry.
  - **Retries.** The worker (`apps/worker/src/room-removals.ts`, sophia_worker login) claims due removals under a short lease and retries failures. The backoff doubles from 1 s up to 60 s, and retries continue for as long as it takes.
  - **Watch.** After settling, the removal keeps watch until any token issued before the decision has expired (10 min), so a guest who reconnects with it is taken out again.
  - **Re-admission.** Letting the guest in again cancels the removal.
  - **Visibility.** Members see the state in the snapshot and in the decision's reply. The invite sheet's guest list says "taking them out of the call…", then "not out of the call yet · tried N times" with the last error on hover, then "out of the call". The Updates view names each step.
- **Guest quiescence before admission** (built in checkpoint C, confirmed here): a guest's token waits for the bridge's acknowledgement that Sophia's input is closed and her output cleared, or for trusted absence of `sophia` in the room. Otherwise the guest waits (503). While a guest, or anyone whose standing the API did not sign, is present, the exchange stays paused. Resuming refuses until the room is member-only, and even then needs an explicit member action.
- **Holder departure** (built in checkpoint C, confirmed here):
  - Forwarding stops at once and the exchange pauses (`holder_left`).
  - After a 5 s grace the floor is cleared by compare-and-set against the old holder and input epoch, so a stale callback cannot clear a newly transferred floor.
  - A holder who returns within the grace does not silently reopen listening.
- **Scope separation** (§7): the `sophia.*` attributes and presence reports carry state, never content. Guests' replies do not carry removal detail. A guest cannot read project records or admit work; this is unchanged from S1-04A and exercised again in the crossing.

## Commands and results

| Command | Result |
|---|---|
| `node --test packages/persistence/src/removals.db.test.ts` | 7/7: obligation on decline and none for a guest never let in; a failure stays pending with backoff; the lease fences a second worker; watch after settling; re-admission cancels; decline then block keeps one obligation; a member identity can neither claim nor settle |
| `node --test apps/api/src/media.db.test.ts` | 11/11. New since C: over HTTP, a decline with the API's LiveKit unreachable replies `removal.state: pending, attempts: 1` with the error; the snapshot agrees; the guest gets no new token (409); the worker's pass settles the removal `removed` on the remover's evidence |
| `pnpm test:livekit` | 2/2 against the real server. New: the worker's remover takes a real rtc-node guest out of a live room (the guest's client is disconnected), then reports them `absent` by the server's own list; a room nobody is in is `absent`; an unreachable server is `failed` |
| `pnpm test:db` | 127 pass (119 + 7 removal + 1 HTTP) |
| `pnpm test:sql` | 14 migrations and the pack's SQL test pass |
| `pnpm test` | 190 pass |
| `pnpm check` | see [the handoff](../../handoffs/S1-05A-attempt-1.md) for the final run |

## Mutation checks (migration 0014; each restored byte for byte, SHA-256 unchanged)

| Mutation | Caught by |
|---|---|
| a failed removal recorded as removed | 1 test |
| no obligation recorded on decline | 7 tests |
| re-admission does not cancel | 1 test |
| no lease fence on settlement | 1 test |
| no watch after settling | 1 test |
| a member identity may claim | 1 test |

## Acceptance case touched

**A12**: guest admission pauses project-aware AI before any guest media access (checkpoint C). A guest cannot read project records or admit work. A failed removal stays pending and is reconciled. **Met locally**, with real LiveKit for removal. Hosted pending.
