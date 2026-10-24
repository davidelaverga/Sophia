# Implementation-session handoff

Goal and attempt: FND-B-HTML-RETAINED-RECOVERY-01, attempt 1. This adds a supported way to try a failed HTML design of a
report again, from its frozen content package.
Executor: Claude Code lane B (runtime `60d65501-d779-4a4c-80e8-89485d10c86e`). The packets and their sha256:
- source continuation `79aacc86…`;
- API allocation `71a83c24…`;
- race correction `6f3daf58…`.

Namespace reserved by P:
- `db/migrations/0081_retry_failed_design.sql` and `sophia.retry_failed_design`;
- `POST /api/v1/projects/{projectId}/native-tasks/{taskId}/html-retry`, `retryFailedDesign`;
- `DesignRetryRequest`, `DesignRetryReceipt`, amendment A42.

Start: `8d454289` (Main), branch `fix/retained-html-recovery-20261024`.

## The gap

A create design that ended `failed` had no way back:
- `request_design_edit` revises published pages only;
- `request_research_design` answers once, and only while the research runs;
- `design_fail` is terminal.

The retained case: the designer was blocked by the renderer's `widths_visible` sweep timeout.

## The change

- **0081 `retry_failed_design(project, job, request)`**, editor-only. It locks the project row and checks the role
  again under that lock: a removal or demotion (0056 and 0058 take the same lock first) that commits while the call
  waits refuses it.
  - It refuses: a design that is not a failed create, or whose package was never frozen; a version that is not
    current, or already has a page; a withdrawn source; a package whose stored bytes no longer hash to its recorded
    hash; a design under way or a later one; the 16-per-report limit; no designer or capture renderer.
  - **Money:** the project's research grant must be enabled, be the one named (revision and approval reference), be
    newer than the latest design of the version, and be unused by any retry in the project. One owner approval
    therefore admits at most one retry, of one report, whichever it is (PR480 SEC). The retry's design is stamped with
    its admission's own time (R2 exchange 2). The grant's total cap still bounds every allowance of the project
    together.
  - **Admission:** a NEW goal and attempt (`design_attempt`) and a NEW allowance (cap = the grant's task cap, no
    searches or reads). The design task is bound to the SAME package source and hash, version and Markdown hash, and
    its first revision is a copy of the failed task's last one.
  - **Unchanged:** the failed task, its job, attempt, candidates, goal, reason and allowance. Only the research task's
    current design pointer moves.
  - **Idempotent:** keyed by the hash of the request key; the same key with another version or package is a conflict.
  - **Fail-closed migration:** it refuses if any `sophia.retry_failed_design` already exists. It relaxes
    `design_tasks_edit_binding` only so a create may carry a key; edits still need theirs, audits none.
- **A42**: the route, its two schemas, and `DesignProgress.retry`. That field tells an editor reading a failed design
  whether it can be retried: `fresh`, `stale` or `closed`, with the approval to name. Persistence `retryFailedDesign`
  and `readDesignProgress` cover these.
- **Studio**: the failed design card shows **Try again** only under a fresh approval, with one key per card so a resend
  is the same retry. Otherwise it says what the owner must do. A `stale_revision` refusal (the owner approved again,
  or a retry used the approval) reads the card's detail again, so the next press, the person's own, names the current
  approval; nothing is sent again by itself (PR480 CODE). A card waiting on a stale or closed approval offers **Check
  again**, a read of its detail, since the owner's approval changes nothing the failed card watches; only a later press
  of Try again admits work (PR480 CODE r4367645448).
- **Paid behaviour, stated plainly:** an admitted retry is a NEW designer agent attempt. Its model calls are real paid
  inference under the new allowance; every call still reserves first (`reserve_research`), so a closed gate refuses
  before any provider call.

## Evidence (journal `B-HTML-RECOVERY-01-logs`)

- **Old FAIL, without 0081, final test bytes:** the routine is missing (51). Without the under-lock recheck, the
  demoted editor's retry was admitted (73). With the old `DesignCard`, the 3 Studio specs fail (85).
- **Fixed:**
  - `design.db.test.ts` 32/32 (90), including 2 new cases;
  - install test 1/1 (91), `test:sql` with 81 migrations (92);
  - Studio `design-retry`, `design-refusal` and `revise-section` 10/10 (84);
  - `pnpm check` exit 0 (93).
- **The real-PG cases cover:**
  - stale, closed, wrong revision and wrong reference;
  - outsider and stale version;
  - two keys racing (one admitted);
  - replay and conflict;
  - the new allowance and goal; the frozen package served to the new attempt;
  - the reservation charged to the new allowance, and a closed gate refusing a reservation;
  - under way, and not failed;
  - the failed history unchanged;
  - demotion and removal racing (403, no goal, job, allowance or outbox row);
  - HTTP 401, 409 `stale_revision`, then 202 and replay.

- **Focused correction (FND-B-PR480-FOCUSED-CODE-SEC-01):** two reports of one project under one approval, in
  sequence and racing, admit one retry. The other is refused with nothing admitted; the winner's key replays; a new
  approval admits the other. The old SQL admitted both (journal log 125). The Vite control: refused under the replaced
  approval, one detail read, no automatic second POST, and the next press sends the new approval under the same key;
  the old `DesignCard` fails it (journal log 127).
- **Approval refresh (FND-B-PR480-APPROVAL-REFRESH-UI-01):** a card waiting on a stale or closed approval, the owner
  approving while the page stays open, Check again reading the detail, Try again then offered, and nothing sent until
  it is pressed. The old `DesignCard` fails it (journal log 142); the fixed one passes (143).

## Limits

- The Studio witness runs on the Vite fixture page, not on built bytes.
- No production, provider, inference, capture or deploy. The retained production design was not touched.
- The 150 s renderer sweep (F01) is source-only until the renderer and native are updated. A retry on the old
  renderer can fail the same way.
- "Fresh approval" is the project grant being re-set by the owner after the latest design. It is not a per-retry
  amount: the allowance takes the grant's task cap.
