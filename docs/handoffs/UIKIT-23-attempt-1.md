# Implementation-session handoff

Goal and attempt: UIKIT-23 (A15: what needs the calling person, in one read — the contract proposed for Davide, the
Studio's client wired into Home behind the vision flag), attempt 1
Human owner / executor resource: Luis (merge) · Davide (the service's route) / Claude Code session in worktree
`Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/needs-api` from `ui/board-why` at `1b804658`
(stacked on PR #244 → #243 → … → #220; the base retargets as each merges)
Ending commit/tree: `1587135c03e4` (tree `4072ccdfc7f0`), the last commit of `ui/needs-api`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 32 files changed against
`ui/board-why` at that commit: `e2e/home-needs.spec.ts`, `e2e/resources.spec.ts`, `e2e/work.spec.ts`, `fixtures/fixture-api.ts`, `fixtures/home.tsx`, `fixtures/work.tsx`, `src/api/needs.test.ts`, `src/api/needs.ts`, `src/app/SignedIn.tsx`, `src/app/account-cache.ts`, `src/app/useProjectRoute.ts`, `src/features/personal/Places.tsx`, `src/features/personal/Welcome.tsx`, `src/features/personal/places-view.ts`, `src/features/personal/turn-shown.ts`, `src/features/personal/useNeeds.ts`, `src/features/resources/RequiredActions.tsx`, `src/features/resources/ResourcePanel.tsx`, `src/features/resources/link.test.ts`, `src/features/resources/link.ts`, `src/features/work/GoalList.tsx`, `src/features/work/planning/PlanBoard.tsx`, `src/features/work/planning/ServedWork.tsx`, `docs/handoffs/UIKIT-23-attempt-1.md`, `docs/plans/needs-api.md`, `packages/contracts/amendments/A15-needs-you.json`, `packages/contracts/openapi/openapi.json`, `packages/contracts/scripts/generate-validators.ts`, `packages/contracts/src/generated-types.ts`, `packages/contracts/src/generated/validators.d.ts`, `packages/contracts/src/generated/validators.js`, `packages/contracts/src/validate.ts`. The review notes below name the commit of each later change.

## Outcome (the final contract, after every review round)

- **A15** (`packages/contracts/amendments/A15-needs-you.json`): `GET /api/v1/me/needs` → `NeedList { needs, readAt }`,
  bearer, owner-only, at most 200 by a deterministic order; and `POST /api/v1/me/needs/{id}/seen` (owner-only,
  idempotent, 204): for a reply it advances the person's last seen personal turn; for any other kind it changes
  nothing. A `Need` has `id` (`<kind>:<projectId, or personal>:<ref.within, or ->:<ref.id>`, unique across projects),
  `kind` — four: decision · permission · guest · reply (no review until a request record exists) — `title` (up to 1200
  characters), `projectId` / `projectTitle`, `expiresAt` (a decision's only), `detail`, `at`, and `ref`
  (`work_decision` · `work_wait` · `lobby_entry` · `personal_turn`, with `within` and `resourceId`).
- **The Studio** (behind the vision flag): `api/needs.ts` (`listNeeds`, `markNeedSeen`, `needsOf`, `whereOf`, `atOf`,
  `withoutResources`), `useNeeds` (every 20 s; a refusal hides the cached rows, a transient failure keeps them with a
  note). A decision opens Tasks at its own choice (`#decision-`, choosing the goal that holds it); a permission its
  request in Resources (`#request-`), or its task in the signed-in app while Resources has nothing served; a guest the
  room; a reply the personal space, read again, marked seen once its turn is shown.
- **The fixture**: `fixture-api.ts` and `home.tsx` answer both routes; `home-needs.spec`, `work.spec`, `resources.spec`
  and `needs.test.ts` cover the presses, the seen mark, the failures and the refusal.

## Evidence

- `pnpm format`, `pnpm lint` (type-aware), `pnpm typecheck` (studio, contracts): clean; `needs.test.ts` 2 pass;
  `contracts.test.ts` 4 pass (from the repo root; from the package's folder they look for the scripts under the
  wrong path).
- Measured in the page (the pane at 1440×900, `home.html?needs=api`): five rows from the read, in urgency order
  (decision «Fixture project · expires in 20 min», permission «expires in 2 h», review «Davide asks», guest «Waiting
  2 min», reply «Yesterday»); the presses recorded `open work …aa`, `open knowledge …aa`, `open studio …aa`,
  `personal`.

## Decisions and changes

- One route for the person, not five reads from Home: the service already keeps every source and knows the
  memberships; the Studio sorts (the expiring first) and never guesses where a need lives (`ref`).
- `readAt` is the service's clock: expiries compare against it.
- A reply leaves through its seen mark (round 2); every other need leaves when its record is answered where it lives.

## Remaining obligations

- Watch CI; the independent review (Codex) with no P1/P2 before merge.
- Davide: the two routes (`listNeeds`, `markNeedSeen`) in `apps/api`, beside the personal routes, with their tests,
  from four sources (open `WorkDecision`s the person decides; `WorkWait`s of kind native_permission naming them; lobby
  entries in rooms they admit to; Sophia's replies after their last seen turn), `403` for a guest; and two pieces of
  new storage the routes need: `opened_at` beside each wait (a permission's `at`) and `last_seen_turn_seq` on
  `personal_spaces` (the seen mark), each by a migration.

## Next bounded action

The UI evaluation Luis asked for (every page, the premium minimalist bar, onboarding, what stays hidden or unexplained).

## Post-review (Codex on #245)

Fixed in `55e8bb54` (`docs/plans/needs-api.md`, «After the review»):

- **P1, the padlock**: `useNeeds(…, { locked })` from Places' lock: shut, nothing is read and nothing read is shown;
  `forgetPersonalReads` removes `['vision', 'needs']` with the personal reads. `home-needs.spec` (+1): behind `locked=1`
  no list and zero reads of the route (the fixture counts them).
- **P2, the service's clock**: the hook keeps `receivedAt` beside the answer; `clockSkew(readAt, receivedAt)` (tested)
  is added to Home's now before `NeedsYou` compares expiries.
- **P2, the record**: `whereOf` → `at` (`atOf`, tested): `work_item` → `#task-<id>` in Tasks; `artifact_version` →
  the viewer in Knowledge, for which A15's `ref` now carries `artifactId` (null for every other kind; regenerated,
  `generate:check` clean). `useProjectRoute.openAt(projectId, view, at)`. A decision, a lobby entry and a personal turn
  have no address yet: their view. The spec's presses read `… #task-w1` and `… report <artifact> <version>`.
- Measured in the page (`home.html?needs=api`): the five presses as the spec expects; `?needs=api&locked=1`: no list,
  0 reads. `pnpm format`, `lint`, `typecheck` (studio, contracts), `needs.test.ts` 4, `contracts.test.ts` 4: clean.

## Post-review, round 2 (Codex on #245)

Fixed in `9d5f7f32`:

- **P2, a decision is the work board's**: `ref.kind` `mission_decision` → `work_decision` (`WorkDecision`: a decider,
  an expiry, rendered in Tasks); A15's `why` names the source.
- **P2, a reply's read transition**: A15 adds `POST /api/v1/me/needs/{id}/seen` (owner-only, idempotent, 204): for a
  reply it advances the person's last seen personal turn (a mark A10 keeps beside the space); for any other kind it
  changes nothing. `markNeedSeen` in `api/needs.ts`; `useNeeds.open` posts it for a reply and reads the list again.
- The ref's `artifactId` became `within` (the record that holds the named one: a version's report, a decision's work
  item), so `atOf` opens a decision at its task as a version in the viewer.
- Measured in the page (`home.html?needs=api`): the decision's press `open work …aa #task-…c3`, the reply's press
  `personal` then `seen reply:t9`, and the list 5 → 4 rows. `needs.test.ts` 4, `contracts.test.ts` 4, `generate:check`,
  format, lint, typecheck: clean.

## Post-review, round 3 (Codex on #245)

Fixed in `9cbebb22`: a permission is its wait (`ref.kind` `work_wait`, the wait as `id`, its work item in `within` and the
address); a failed read says so on Home (`useNeeds` → `{ seen, read }`, the read in `ReadNotes`, «Couldn’t read what
needs you.» with Try again; the fixture fails until `recover()`). Measured in the page: the note and no list, then
five rows after Try again (reads 2 → 3); the permission’s press `#task-…c1`.

## Post-review, round 4 (Codex on #245)

Fixed in `ed39e193`: no review kind until a request record exists (A11 keeps verdicts); a permission does not expire
(A13’s wait has none: `detail` says how long it has waited); a seen write that fails reads the list again; both
operations marked `contract_only`, goal F2. Measured in the page: four rows (decision, permission «Asked 10 min ago»,
guest, reply), the presses at their work items, the reply leaving (4 → 3).

## Post-review, round 5 (Codex on #245)

Fixed in `06830444`: a poll that fails after a good read kept the rows and said nothing (`readState` saw data). `isError`
is now read apart from the cached rows: the rows read last stay (the list is still actionable), the note says the read
failed beside them, with Try again. The fixture's `breakNeeds()` makes every later read fail; the spec breaks it,
brings the window back (`visibilitychange`, the event the query library hears), sees the note and the four rows
together, recovers, and Try again clears the note. Run locally (home-needs.spec: 8 passed) with lint and typecheck clean.

## Post-review, round 6 (Codex on #245)

Two P2s on the amendment, answered in its words (no schema change, the generated spec and validators regenerated):
`NeedList` names a deterministic truncation (the 200 most urgent by the service's order, the same 200 for the same
records, the rest where they live, no cursor), and `markNeedSeen` says why advancing the mark is sound (a reply opens
the personal space, where every turn since the last seen is shown; the mark only moves forward; later replies stay).

## Post-review, round 7 (Codex on #245)

`within` takes the work item id's shape (1 to 160 characters, as A13's `work_id`), not a uuid: a slug-named item's
decision or permission validates. Spec and validators regenerated; `contracts:check` clean.

## Post-review, round 8 (Codex on #245)

Three P2s: a decision is addressed by its own id (`#decision-<id>`), the board scrolling to its choice instead of
opening the holding task's sheet; a need's title is up to 1200 characters (A13's question); a reply is marked seen once
its turn is shown in the personal space (`turnShown`), not on the press. Spec, validators and `needs.test.ts` with it.

## Post-review, round 9 (Codex on #245)

Four P2s: the decision address moved into the board slot (`useSlot` in `PlanBoard.tsx`): it opens the slot when it is
shut, names the decision for the focus (given by `Decisions` inside its own list) and consumes the address once (a
handled sequence). `turnIsShown` requires a drawn turn (`getClientRects`), so a space mounted under a hidden place marks
nothing. `work.spec.ts` presses on past the focus and re-addresses the decision with the slot shut.

## Post-review, round 10 (Codex on #245)

One P2: a permission need opened only the task that holds its wait, whose sheet names the wait as words; the owner
answers the request in its resource's sheet. A15's `ref` takes `resourceId`; `atOf` gives `{ requestId, resourceId,
taskId }` and `VIEW_OF.permission` is Resources; `openAt` writes `#request-<id>`; `ResourcePanel` (`useAddressedRequest`)
opens the request's resource and focuses its row (`data-request`, `tabIndex=-1`). Spec, validators, `needs.test.ts`,
home-needs.spec (the press reads `open resources … #request-action-1`) and resources.spec (the address opens the sheet
with the request focused, then is the sheet's) with it.

## Post-review, round 11 (Codex on #245)

One P2: a drawn turn is not a seen one. `turnIsShown` requires the turn to meet its scrollport and the window, scrolling
it into sight first (instant). Home's fixture renders a log (`turns=log|hidden`) and hands the real `turnShown` the
turn; home-needs.spec reads the seen mark after the log scrolled, and none when the log is hidden.

## Post-review, round 12 (Codex on #245)

One P1 and eight P2s: a 401/403 hides the cached rows (`refusedBy`; home-needs.spec refuses after a good read); the
handoff's outcome and obligations say the final contract; A15 names the storage its routes need (`opened_at`,
`last_seen_turn_seq`) and makes the id unique across projects; a decision chooses its goal (`GoalPlan.decisions`); a
permission opens its task in the signed-in app (`withoutResources`, tested); the reply's wait observes its place shown,
reads the space again and lasts as long as a read can (`turnShown`).
