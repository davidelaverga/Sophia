# Implementation-session handoff

Goal and attempt: E2E-TOLERANT-READERS (a client reads what a newer API adds without failing; Luis: «Sí, haz que el
Studio tolere campos desconocidos»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `contracts/tolerant-readers` from `main`
(`084afc66`)
Writable scope: this worktree only (`packages/contracts`, `docs/plans`, `docs/handoffs`); no deploy.
Runtime unit: Luis's Windows host; CI as the run on record.
Existing authority: Luis's instruction; merges on green with no open P1.
Ending commit/tree: `1cf6ebef3405` (tree `0763e80c60e2`), the last commit of `contracts/tolerant-readers`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 5 files changed against
`origin/main` at that commit: `docs/plans/tolerant-readers.md`, `packages/contracts/scripts/generate-validators.ts`, `packages/contracts/src/generated/validators.js`, `packages/contracts/src/validate.test.ts`, `packages/contracts/src/validate.ts`. The review notes below name the commit of each later change.

## Outcome

- `scripts/generate-validators.ts` compiles the readers with `removeAdditional: true`. Where a schema says
  `additionalProperties: false`, a property it doesn't list is dropped, at any depth, instead of refused. The generated
  code now has 144 places that drop a field and none that refuses an additional property.
- `assertDropSafe()` refuses to generate a reader whose schemas hold an `anyOf` with more than one object branch. Ajv
  drops fields while trying a branch, even one that then fails. None of the 87 schemas the 45 readers reach has such a
  union.
- `validate.ts` says so. Nothing changes in the API's own request validation: Fastify's Ajv still refuses an unknown
  request field (422).

## Evidence

- Plan: `docs/plans/tolerant-readers.md`.
- Written first and failing (commit `b63536c5`), in `validate.test.ts`:
  - a snapshot with a new top-level field and a new field on a message;
  - a receipt with an extra field;
  - a frame with an extra field;
  - a wrong type or a missing field beside an extra one, still refused.
- After the change:
  - The contracts tests pass 24/24.
  - Type-aware lint over the whole repo, typecheck, Prettier and the contracts check are clean.
- The guard fires: with `ResearchContextReply` listed as a reader for a moment, `generate --check` failed with «a reader
  would drop fields inside a union of objects: ResearchContextReply». The list was put back.
- The unit suite fails the same tests with and without the change, compared name by name. Those are the Windows host's
  failures: symlinks, the renderer probes, `byte-backup`. The only differences are the three new tests, which the change
  makes pass.

## Remaining obligations

- CI, including the browser suites; Codex with no open P1.
