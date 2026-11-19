# An equal-as-of tie is known only when its projections are identical

> 2026-11-16 · The natural Codex review 5920809739 of `90a0af7e` on PR 519 raised a P2 (comment 4586355991). An
> independent review confirmed it and Root adopted the repair (Root120). Pure domain module only; no API, SQL or
> runtime change.

## What was measured

- `reconcileObservations` picks the latest current readings. When several share that as-of, `selectTop` decides
  whether they agree.
- **The flaw:** it compared only `status`, `effectiveFloor`, `effectiveCeiling`, `attributed` and `unattributed`
  (`projectionSignature`). When those matched, it returned the **first projection by observation id** as the canonical
  `projection`, and only ANDed coverage into a separate `diagnostics` field.
- **Remaining case:** two readings of 800 at the same as-of, one open effect with 1000 used so far.
  - A has a qualified attribution q 1000; B has none.
  - Both project `bounded_unknown_ceiling`, effective ceiling 800. Only A is complete.
  - The result was `known` with A's projection (`coverageComplete: true`) while `diagnostics.coverageComplete` was
    false. Swapping the ids flipped the canonical claim.
- **Consumed case:** consumed 800, one final total of 1000.
  - A has q 0 (X 1000..1000, complete, not a lower bound).
  - B has no attribution (X 0..unknown, incomplete, a lower bound).
  - The old signature is the same for both, so A was returned as known.
- **Flags:** a flag present in only one tied projection (for example `used_exceeds_bound`) disappeared the same way.

## What changes

- **`projectionSignature`** (`capacity-exposure.ts`) becomes the canonical form of the whole projection: every own
  field in sorted key order, with `reasons` and `flags` compared exactly.
  - Equal-as-of readings are one `known` result only when their projections are identical.
  - Any difference goes to the existing conservative `tie_bounded` path: lowest effective floor, highest effective
    ceiling, null when any is unknown, and every per-observation projection retained. That covers coverage, reasons,
    flags, the exposure interval, the lower-bound flag, fact conflict, freshness and every other field.
- **Diagnostic arrays are not normalized.** Their `#n` positions index each observation's own effect list, so sorting
  could equate reports about different effects. Exact comparison never upgrades knowledge. It can only send a tie to
  the bounded path.
- **Unchanged:** the arithmetic, finality and N10, epoch, q, alias partition, qualification, the field grammar, the
  sorting by as-of and id, freezing, and input immutability. A missing q stays unknown; it is never copied from another
  reading or taken as 0.
- **Not chosen:** a merged canonical projection was the alternative. The held W1 consumer recomputes its designated
  reading and does not read merged diagnostics, so merging alone would not reach it; sending mixed ties to
  `tie_bounded` needs no W1 change. Whether W1 handles a real mixed consumed tie correctly is for the next coherent
  integration to exercise.

## Checks

- **New regressions in `capacity-exposure.test.ts`**, with inline synthetic fixtures; the frozen JSON is untouched:
  - the remaining witness;
  - the consumed witness;
  - a flag-only difference;
  - both id assignments with every input order, showing no change of knowledge from id or order;
  - a truly equal tie that stays `known` with complete diagnostics;
  - no input mutation, a frozen result, and retained projections equal to the direct per-observation ones.
- **Order of runs:**
  1. Run them against the old module first; they must fail on the intended status assertion.
  2. Then the fix.
  3. Then a causal control that restores only the old signature and must fail the same way.
  4. Exact restoration.
- **Finals:** the full pure unit file, including all 64 frozen vectors and the five FG witnesses; format, type-aware
  lint and typecheck; the build and the 8 artifact identities VERIFY, unchanged and not re-recorded.
