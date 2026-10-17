# Versions by name, outside work by its words: no ids in what people read

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), V3 (the Studio's side), from Luis's «Sigue con la
> cola … y el nuevo informe-25». Studio only. The projection's «…not connected in this slice» reasons are Davide's
> (WBC-02, `packages/coordination/src/projection.ts`): proposed to him, not changed here.

## What was measured

- In production a version's id is its source id, a UUID. It reached the words in a task's sheet («Current · <uuid> ·
  Markdown», «Reading <uuid>…», «<uuid> can’t be read right now») and on the board's return band («… has a new result:
  <uuid>», «<uuid> isn’t current any more»).
- «Observed outside the plan» printed each row's work id (a UUID in production) after who has it.
- A decision bound to a plan held nowhere here said «About <work id>, in plan r9, not shown here».
- Two of the projection's «in this slice» reasons reach people (Guidance on every operable sheet, and Ask's); the
  review candidate's is never shown. A review's version and a decision's candidate are not production leaks today:
  the projection sends them null.

## What changes

- **`results.ts`:** `versionNames(view)` names each listed version `v1`, `v2`… in the order made (when, then id),
  withdrawn ones counted; `nameIn` says «a version not listed» for one the view no longer lists. `reviewSaid` and
  `versionSaid(name, c)` use the names. The id stays the key and what a read is sent with.
- **`TaskResult`:** each version and each read («Reading v1…», «v1 can’t be read right now») by its name.
- **`seen.ts`:** the return band says «has a new result: v2», and a result gone from the list «its last result isn’t
  listed any more».
- **`plan.ts` `outsideSaid`:** outside work in words, who has it and where it stands, its id kept in `data-work`. Rows
  that would read alike are told apart by their order, «Observed more than once (1 of 2)», so Codex F-045's two rows
  never read as one.
- **`PlanBoard`:** outside rows from `outsideSaid`; a decision bound to a plan held nowhere here says «About a task in
  plan r9, not shown here».
- **The fixtures' ask reason** says «…isn’t connected yet.»

## Checks, written first

- `results.test.ts`: names in the order made, withdrawn counted, ties by id; a review of a UUID version said «for v1»
  with no UUID; «a version not listed» when gone; `versionSaid('v2', c)`.
- `seen.test.ts`: a new result by its name; a lost one gone from the list said without an id.
- `plan.test.ts`: `outsideSaid` for the F-045 sample (two ambiguous rows told apart, one unassigned) and one assigned
  row, no ids.
- `work.spec.ts`: the stale pass («Review passed for v1, not this version», «v2 · Markdown», no «retry-v»), the failed
  revision («v1 · Markdown», no v2), two current («…for v1, no single current version…»), the late read («Reading
  v1…»), the defects sheet, the rebound decision, the ask reason without «slice», and outside work by name only, the
  two alike rows numbered.

## Limits

- Names count what the view lists: if a projection ever drops old versions, the names shift with it.
- A decision's candidate tail (`· <ref>`) still prints the ref; it is null in production today, and the board has no
  view there to name it from.
- The Guidance reason «…not connected in this slice» still reaches every operable sheet in production until Davide
  takes the proposed wording, or the Studio drops those actions while unavailable.
