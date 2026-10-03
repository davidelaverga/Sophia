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
- **Attempt 2** ([handoff](../handoffs/LFE-06-attempt-2.md)): a reading past its `valid_until` is unknown, and a window that may not apply never limits.
- **Attempt 3** ([handoff](../handoffs/LFE-06-attempt-3.md)): M03-RF-0024, handed over by M03 on #31, plus #48's P2. The capacity line is decided by the windows known to apply, in this order:
  1. a percentage;
  2. a pending reset, or an unknown window, while any window is unresolved;
  3. an observed balance, as reported;
  4. "No window observed" only for a reading with no windows.
- **Attempt 4** ([handoff](../handoffs/LFE-06-attempt-4.md)): Luis's UX, quality-of-life and coherence pass.
  - The panel now sits in the Studio's existing Resources view (`ProjectShell`'s `resources`; the fixture fills it), in the Work view's language: a list under the view's head, rows ruled like goals, and what waits on an owner in a side column like the pulse.
  - Each tool shows its own mark.
  - The owner copies a waiting request's session id.
  - Measured at 1280×720: the request waiting on an owner moves from y 489, last on the page, to y 80, at the head of the side column.
- **Attempt 5** ([handoff](../handoffs/LFE-06-attempt-5.md)): Luis found attempt 4 too loaded ("no sé dónde mirar"), with no search for ten or twenty resources, and preferred tiles.
  - Each resource is a tile of four lines: tool and host, owner, what it does, capacity. Its detail opens in the app's sheet.
  - A search (`/`) and four filters with counts find one among many. What waits on an owner is one line on top, only while something waits.
  - Measured at 1280×720 with the three resources: 78 words on the view (206 before attempt 4); the waiting line at y 118.
- **Attempt 6** ([handoff](../handoffs/LFE-06-attempt-6.md)): subtle motion and interaction, at Luis's request.
  - A filter glides the tiles to their new places. Tiles arrive one after another, and meters fill as they appear.
  - A tile's light follows the pointer in its tool's colour.
  - What waits keeps a slow pulse, and a light runs once along the waiting line.
  - Nothing moves when reduced motion is asked for.
  - A meter turns amber from 75 % used and red from 90 %.
  - Codex's review: a tile now tells assistive technology all its lines (P1); the search's `/` is in its tip; the windows' chevron is still with reduced motion.
- **Attempt 7** ([handoff](../handoffs/LFE-06-attempt-7.md)): what needs someone found at a glance among many, and a meter that reads against time.
  - Tiles sort by attention by default (never by how used: LFE-06.2 forbids weighing providers' percentages), or by owner or tool. A waiting tile's edge warms; an offline one steps back and says how long it has been gone.
  - A meter marks how much of its window had passed when it was read, only where the length is certain (Claude Code's windows, not Codex's yet); the sheet says when the account runs out before the reset at that pace.
  - #50's P2 is closed: a spend limit passed keeps its meter's range true.

## Acceptance cases

| ID | Status |
|---|---|
| RES-01 Two Claude sessions use the same owner account | fixture: passes in CI. Two sessions listed apart, one capacity block, "2 sessions share this account" |
| RES-02 Quota/window/host observation absent | fixture: passes in CI. "Capacity unknown" with no number; a due reset is "Refresh pending"; a reading past its `valid_until` is unknown with its age; a window that may not apply never limits; a balance never heads while another window is unresolved; ages shown; no total across providers ([attempt 2](../handoffs/LFE-06-attempt-2.md), [attempt 3](../handoffs/LFE-06-attempt-3.md)) |
| RES-03 Luis views Davide's owner-only request | fixture: passes in CI. Luis sees the request and that only Davide answers it; nothing to press for either |
| RES-04 Stop while native action waits | not run: controls are LFE-06.4 |
| RES-05 Worker idle or observer disconnected | not run: needs live observation (SCM-02) |

## Next

1. **Davide:** confirm or change the proposed resource and required-action shapes, and the capacity observation as the collector will send it (SCM-01/02).
2. **LFE-06.3:** the native destination, once a qualified safe target exists.
3. **LFE-06.4:** guidance, Hold and Stop over real assignment ids and epochs.
