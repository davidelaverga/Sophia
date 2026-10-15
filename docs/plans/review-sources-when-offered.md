# Review sources is offered only where there is something to review

> 2026-10-14 · Q3 of the real-stack run (`evaluacion-2026-10-14/e2e-real`): a goal offered «Review sources», and the
> form said «No report version can be reviewed yet.» Luis: «Sí, oculta Review sources».

## What was measured

- On the real dev stack, a project's first goal showed «Review sources». Opened, the form listed no source and said
  nothing can be reviewed yet: an entry that leads nowhere.
- The entry shows wherever Sophia enables the pilot (`availability.enabled`), whatever it offers to review.

## What changes

- **The entry shows only where there is something to review:** the pilot enabled and at least one source offered
  (`offered` in `review-sources.ts`).
- **A proposal still unanswered keeps its way back**, sources or not. The form is where it is asked about again, and
  only Sophia's answer lets it go (`review-proposal.ts`); hiding the entry would strand it.
- The form keeps its «No report version can be reviewed yet.» line for sources that go away while it is open.

## Checks

- `review-sources.test.ts`, «where Review sources is offered»: enabled with sources, yes; no sources or not enabled,
  no; a proposal unanswered, yes, but never where the pilot is not enabled.
- `work.spec.ts`, «E2E-Q3»: with Sophia's answer read (`sources=0`), no Review sources; a lost proposal found again
  on a page with nothing to review is still reachable and asked about again.
