# Implementation-session handoff: LFE-06, attempt 1 (the resource panel, on a simulated fixture)

- **Goal and attempt:** [LFE-06](../execution/2026-10-01-unified/frontend/LFE-06.md), sessions 06.1 and 06.2, plus 06.3's display (RES-03): the three enrollments, their capacity, and the requests waiting on an owner.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/resource-panel` from main `6510504`, 2026-10-02.
- **End:** the panel, checks and docs at `029b6ba` (tree `431420101a79`), the head the checks below ran on. The commit after it changes only this line.
- **Writable scope:** the Studio's new `features/resources/`, its fixture and checks, CONTRIBUTING and LFE-06's records. **No contract, schema, API, dependency or hosted service was changed. Nothing in the Studio shows the panel yet.**

## Outcome

- **[`ResourcePanel`](../../apps/studio/src/features/resources/ResourcePanel.tsx)** shows one card per enrollment, for `davide-codex`, `davide-claude` and `luis-claude`. Each card holds:
  - the owner and native tool;
  - the host state and how long ago it was observed;
  - each session's role, its reported model and effort ("Model not reported" when none), and its assignment;
  - the route's controls in words (supported / not qualified yet / not offered), with no buttons.
- **Capacity** ([`CapacityBlock`](../../apps/studio/src/features/resources/CapacityBlock.tsx), [`resource.ts`](../../apps/studio/src/features/resources/resource.ts)):
  - shown once per account, with the number of sessions that share it;
  - the limiting observed window in a line, and every window on request, as an accessible disclosure;
  - a reset already due is "Refresh pending", never fresh capacity, and its old value isn't shown;
  - no observation, or one that can't see the account, is "Capacity unknown", never 0 % or 100 %;
  - what the tool can't see is named; the owner's reserve is said apart; there is no total across providers.
- **Required actions** ([`RequiredActions`](../../apps/studio/src/features/resources/RequiredActions.tsx)) name the owner, native session, operation, state and expiry.
  - Only the owner is told where to answer: "Answer it in Claude Code, session claude-worker." Anyone else reads "Only Davide can answer this, in Claude Code."
  - There is no Approve, no link without a safe target, and seeing a request answers nothing.
- **The shapes:** `Resource`, `Session` and `RequiredAction` are the Studio's proposal for SCM-01/02. `QuotaObservation` follows the continuation's `sophia.capacity.observation.v1` field names.

Missing or unverified:

- **Fixture evidence only.** No API serves resources yet; SCM-01/02 aren't started.
- **RES-04** (Stop while an action waits) is LFE-06.4. **RES-05** needs live observation.

## Evidence

- `pnpm --filter @sophia/studio test:browser`: 7 resource checks (`e2e/resources.spec.ts`), with Explore's and the room's. With `--repeat-each=3` and 4 workers, 75 of 75 pass.
- **Eleven mutations of the new code** each made their check fail, every run on a fresh fixture server:
  - unknown capacity shown as a number;
  - a due reset counted as fresh;
  - one account counted per session;
  - everyone told how to answer;
  - an Approve button;
  - providers added up;
  - the host's age dropped;
  - a model made up;
  - the reserve not said;
  - the windows not a disclosure;
  - the panel calling a tool.
- `node --test` on `resource.test.ts`: 5 pass.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. The production build has no fixture string. `pnpm test`: the new tests pass, plus the 5 known failures on Windows, as on main.

## Decisions and changes

- **Production is untouched**, as with Explore: the panel joins the Studio once resources are served.
- **`now` is passed in.** Every age and reset counts from it, so the checks are exact.

## Remaining obligations

- **Davide:** the resource and action shapes, and the capacity observation as SCM-02's collector will send it.

## Next bounded action

- LFE-06.4 (guidance, Hold, Stop) once assignment ids and epochs exist. LFE-02 when PR32 is in `main`.
