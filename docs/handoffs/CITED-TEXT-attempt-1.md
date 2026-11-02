# Implementation-session handoff

Goal and attempt: FND-HTML-SOURCE-REMAINDER-03-CITED-TEXT, attempt 1
Human owner / executor resource: Davide (owner); B, the sole source writer in the foundation coordination (P coordinates, R2 reviews, V releases)
Native session: Claude Code desktop session `local_cf492b49-c8d1-4ab7-b811-95eaefc2b61c`
Starting worktree/commit: `sophia-ask-context-alternative`, branch `fix/html-source-review-remainder-20261102` from Main `3a61652491f4e20f36d1a4d2a4520c36976c67b0` (tree `113d8466…`)
Ending commit/tree and changed files: the local commit that carries this file (see `git log`). The changes are the files under `docs/plans/cited-report-text.md` § What changes, plus their tests.

## Outcome

- From a readable published report's Sources, a current member can open a cited project input's text in place, as plain text: «Show text» / «Hide text».
- The service checks membership, published version, recorded citation, project input, released and ready, inline text, size and withdrawal closure at each read. Every refusal is one `not_found`.
- Studio checks identity, type, UTF-8 size and sha256 before showing anything.

What this does not do:

- It does not repair the retained brief's content.
- It does not read the production note (f22): its bytes remain unread here.
- It does not change any research goal, prompt, native bundle, renderer or verdict.

The research outcome and prompt slice is next and separate.

## Evidence

- `apps/api/src/cited-report-text.db.test.ts`: 16/16 on PostgreSQL 17.11 (owned, local) through the API login and HTTP.
  - On Main's code: 15 fail (the route is 404, no 0090). The one that passes is the unchanged `getSourceContent` check.
- SQL guard mutations: each clause removed fails its test.
  - The scope/eligible/ready clause alone survives, because `source_withdrawn`'s closure holds the source itself. With both removed, the private and withdrawal tests fail.
- The route's hash-check mutation fails the mismatch test.
- `apps/studio/src/features/artifacts/cited-text.test.ts`: 6/6. It fails to import on Main.
- `apps/studio/e2e/cited-text.spec.ts`: 8/8 (7 desktop, 1 phone). On Main all 8 fail.
  - Mutations fail it: HTML instead of text, no byte check, always open.
- `apps/studio/e2e/app-auth.spec.ts` «cited text · another account…»: passes.
- `pnpm check`: exit 0.
  - Unit: 4124 tests, 4054 pass, 70 skipped.
  - Integration: 156 tests, 154 pass, 2 skipped.
  - An earlier run failed lint on the new spec. That was fixed.
- `pnpm test:db`: the one full run gave 1411 pass and 1 fail.
  - The failure was `readiness.db.test.ts`, whose fixture expected readiness without 0090. The fixture was corrected.
  - That is not a full passing run. The second full run was stopped on purpose (P: focused checks only) and is no result.
- Focused DB after the correction, on a fresh owned cluster: readiness, cited text and `getSourceContent`, 23/23.
- Browser:
  - The affected report and Knowledge suites pass, after `knowledge-origins.spec.ts`'s six generic row-button selectors were narrowed to the origin's press.
  - `app-auth.spec.ts`: 57/57.
  - The full default suite was pending when this was committed. Its result is in the journal handback, not here.

## Decisions and changes

- One contextual read (report + version + recorded citation), per P's selected scope and R2's boundary.
- 0090 was used because the canonical withdrawal rule is not the API's to execute. It opens no table, helper or other function.
- A11 is amended in place: one `why` line and one path. `SourceContent` is reused unchanged.
- `/ready` requires 0090 with EXECUTE.

## Remaining obligations

- R2 must review the whole candidate before any push. P dispatches the push, V the release, migration and retest.
- No production SQL, deploy or model was used.
- The local PostgreSQL clusters are owned and local (ports 55532, stopped with data kept; 55533). They are stopped with their data kept at the end of the session.

## Next bounded action

- R2 independent review of this candidate.
- Then P's publication packet.
- Then the next separate slice: neutral research outcome (new forward migration) and the versioned research prompt clarification.

## Repair R1 (R2's CITED-TEXT-R1, P's REPAIR-01)

- **What R2 found.** 0090 checked the cited text, but not whether the caller may still read the report itself. A published version whose own source was blocked, deleted, made private or unreleased still served its cited text by direct HTTP, while `getSourceContent` refused the report.
- **The repair.** 0090 now binds the version's own source to the existing report reader's rule: ready, and the caller's own or a released project source. No universal parent-dependency rule was added: a report with another citation withdrawn stays readable, as 0033 keeps history.
- **The evidence.**
  - Three tests were added to `apps/api/src/cited-report-text.db.test.ts`.
  - On 61f, 2 of them fail; the sibling and the 23 existing checks pass.
  - After the repair, 26/26 pass on a fresh owned cluster.
  - Two mutations of the new guard each fail a test: removing the owner branch, and removing `ready`.
- **Frontend inputs** (`apps/studio`, `packages/ui`, `packages/contracts`, `packages/report`) are byte-unchanged from 61f.
