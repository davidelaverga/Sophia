# LFE-03 — make Explore a real image-direction workspace

Package: [frontend/LFE-03](../execution/2026-10-01-unified/frontend/LFE-03.md). Implementation and integration: Luis. Product and the image backend (S1-06, B-IMAGES): Davide. Read on 2026-10-02.

## Where the source stands

| What | State | How it was observed |
|---|---|---|
| Image job contract | `startImageJob` (`POST /api/v1/assets/image-jobs`, `ImageRequest`): one model route per job, `generate` or `edit`, 1–4 outputs | `packages/contracts/openapi/openapi.json` |
| Reading jobs and candidates | No contract, no endpoint. `ArtifactVersion.format` has no image format | the same file |
| API | Nothing implements `startImageJob` | `apps/api/src` |
| S1-06 backend | No branch or PR | `gh pr list`, `git ls-remote` |
| Explore in the Studio | Still the "coming" lens, unchanged | `StudioShell.tsx` |

## LFE-03.1 — the direction gallery (fixture)

`apps/studio/src/features/explore/`:

- **The gallery and the detail.** `DirectionGallery` and `DirectionDetail` show every candidate a direction's jobs returned, with its state in words. The detail shows the candidate's provenance and the choice.
- **The shapes are a proposal.** `direction.ts` holds `Direction` and `Candidate` for S1-06's read contract, for Davide to confirm or change. The bytes and the choice are ports (`ReadBytes`, `Choose`), not endpoints. There is no generation port.
- **Where it runs.** The gallery runs on `apps/studio/fixtures/explore.html`, labelled "Simulated — no image service". It isn't in the Studio yet.
- **[Handoff](../handoffs/LFE-03-attempt-1.md).**

## Acceptance cases

| ID | Status |
|---|---|
| IMG-01 Select one of two alternatives | fixture: passes in CI. Exactly one choice is asked and every alternative stays. There is no generation port. Live: not run |
| IMG-02 One provider refuses or times out | fixture, display half: passes in CI. The refusal and the unknown outcome are said in words, and the other image stays usable. Reconciling an unknown outcome before a paid retry needs S1-06 |
| IMG-03 Source image changes during edit | not run: edits are LFE-03.3 |
| IMG-04 Phone comparison and keyboard selection | fixture: passes in CI. Two candidates side by side on a phone; the keyboard alone moves, opens, chooses and returns; states in words |

## Next

1. **Davide:** confirm or change the proposed read shapes (`Direction`, `Candidate`, `ImageAsset`) and say where a candidate's bytes and the choice will live (S1-06).
2. **LFE-03.2:** generate and compare intentionally, once `startImageJob` has an implementation to bind.
3. **Explore shows the gallery** only once the route is real (the package's rule).
