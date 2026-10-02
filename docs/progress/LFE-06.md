# LFE-06 — make all three resources and their work visible and controllable

Package: [frontend/LFE-06](../execution/2026-10-01-unified/frontend/LFE-06.md). Implementation and integration: Luis. Product, runtime and the coordination backend (SCM-01/02/03): Davide. Read on 2026-10-02.

## Where the source stands

| What | State | How it was observed |
|---|---|---|
| Resource, enrollment, capacity or required-action API | None in the repository | `apps/api/src`, `packages/contracts` |
| Coordination contracts | Proposed schemas in the continuation (`contracts/coordination`), including `sophia.capacity.observation.v1`; not in the generated contracts | the pack |
| SCM-01/02 (adapters, collectors) | Not started in any branch | `gh pr list`, `git ls-remote` |

## LFE-06.1/.2 — the resource panel (fixture)

`apps/studio/src/features/resources/`:

- **`ResourcePanel` shows the three enrollments:** owner, native tool, host state and its age, each session's reported model and effort, and each session's assignment.
- **Capacity** is shown per account: the limiting observed window and every window on request. A reset that is already due shows as pending. Unknown stays unknown. The owner's reserve is shown apart from the windows.
- **Controls** are listed in words, from the control-support matrix.
- **Required actions** name their owner and session. Only the owner is told where to answer, in the native tool.
- **The shapes:** the resource and action types are the Studio's proposal for SCM-01/02. The capacity observation follows the continuation's schema field names.
- **Where it runs.** On `apps/studio/fixtures/resources.html`, labelled "Simulated — no tool, host or account read". It isn't in the Studio yet. [Handoff](../handoffs/LFE-06-attempt-1.md).

## Acceptance cases

| ID | Status |
|---|---|
| RES-01 Two Claude sessions use the same owner account | fixture: passes in CI. Two sessions listed apart, one capacity block, "2 sessions share this account" |
| RES-02 Quota/window/host observation absent | fixture: passes in CI. "Capacity unknown" with no number; a due reset is "Refresh pending"; ages shown; no total across providers |
| RES-03 Luis views Davide's owner-only request | fixture: passes in CI. Luis sees the request and that only Davide answers it; nothing to press for either |
| RES-04 Stop while native action waits | not run: controls are LFE-06.4 |
| RES-05 Worker idle or observer disconnected | not run: needs live observation (SCM-02) |

## Next

1. **Davide:** confirm or change the proposed resource and required-action shapes, and the capacity observation as the collector will send it (SCM-01/02).
2. **LFE-06.3:** the native destination, once a qualified safe target exists.
3. **LFE-06.4:** guidance, Hold and Stop over real assignment ids and epochs.
