# Implementation-session handoff

Goal and attempt: UIKIT-23 (A15: what needs the calling person, in one read — the contract proposed for Davide, the
Studio's client wired into Home behind the vision flag), attempt 1
Human owner / executor resource: Luis (merge) · Davide (the service's route) / Claude Code session in worktree
`Sophia-kit`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-kit`, branch `ui/needs-api` from `ui/board-why` at `1b804658`
(stacked on PR #244 → #243 → … → #220; the base retargets as each merges)
Ending commit/tree: `3c6a0cfd` (tree `e187d6abec46`): 17 files, 5 new (`amendments/A15-needs-you.json`, `api/needs.ts`,
`api/needs.test.ts`, `features/personal/useNeeds.ts`, `docs/plans/needs-api.md`); the contract's generated files
(`openapi/openapi.json`, `generated-types.ts`, `generated/validators.*`), `generate-validators.ts`, `validate.ts`;
`useProjectRoute.ts`, `SignedIn.tsx`, `Places.tsx`, `fixtures/fixture-api.ts`, `fixtures/home.tsx`,
`e2e/home-needs.spec.ts`. The commit after it adds only this handoff.

## Outcome

- **A15** (`packages/contracts/amendments/A15-needs-you.json`): `GET /api/v1/me/needs` → `NeedList { needs, readAt }`,
  bearer, owner-only; a `Need` with `id`, `kind` (decision · permission · review · guest · reply), `title`,
  `projectId` / `projectTitle`, `expiresAt`, `detail`, `at`, `ref` (the record it names). `generate` regenerated the
  types and validators (`parseNeedList`); `generate:check` clean; the contracts' tests pass from the root.
- **The Studio** (behind the vision flag): `api/needs.ts` (`listNeeds`, `needsOf`, `whereOf`), `useNeeds(token, go)`
  (every 20 s, as the projects), Places hands Welcome `{ items, open }` at Home: a decision or a permission opens
  the project's Tasks, a review its Knowledge, a guest its room, a reply the personal space (`useProjectRoute.openAt`,
  `Places.onOpenView`). Without the flag nothing is read.
- **The fixture**: `fixture-api.ts` answers the route (`needsAnswer`, one need of each kind, out of order); the Home
  fixture's `needs=api` reads through the Studio's own client from that answer. `home-needs.spec.ts` (+1): the rows in
  urgency order with the project's title; the presses go to `work`, `knowledge`, `studio` and `personal`.
- **Davide's**: the route in `apps/api` (the five sources, owner-only, `readAt`, `403` for a guest), named in
  `docs/plans/needs-api.md`.
- Unverified here: the Playwright run (the local guard); CI is the run on record. Places' own call site (the real
  app at Home) has no fixture page: its wiring is typechecked and the hook it calls is the one the fixture exercises.

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
- Marking read is left out of A15 on purpose: a need leaves the list when its record is answered where it lives.

## Remaining obligations

- Watch CI; the independent review (Codex) with no P1/P2 before merge. The base is `ui/board-why` until #244 merges.
- Davide: the route (`listNeeds`) in `apps/api`, beside the personal routes, with its tests.

## Next bounded action

The UI evaluation Luis asked for (every page, the premium minimalist bar, onboarding, what stays hidden or unexplained).
