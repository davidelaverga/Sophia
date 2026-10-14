# The demo's Resources tells the pilot's story

> 2026-10-14 · `evaluacion-2026-10-13/informe-resources-20.md`, finding 1. Luis's queue: work that needs no asking.

## What was measured

- The demo's project is «Onboarding pilot». Its Tasks tell the board fixture in the pilot's words (`demo-work.ts`:
  Davide is Marco; the PDF retry is the checklist's translation). In Tasks, the waiting permission is «Marco's Claude
  Code», «Asked to open the shared onboarding folder».
- Its Resources mounts `ResourcePanel` over `resources-data.ts` as it is: «1 request waits on Davide», «Run a shell
  command: pnpm --filter @sophia/report test», «Implement the PDF retry», «Review the report pane». Counted over the
  demo's seven views, Resources is the only one that says «Davide», «PDF» or «report pane».

## What changes

- **The demo's resources are told as the board is.** The owner Davide is Marco, with no picture: Tasks draws his
  initial. Each assignment's title and each request's words are in the pilot's words (`demo-work.ts`'s own list). Each
  resource's id and its requests' are renamed alike, so a copied link says `#resource-marco-claude`. Readings join
  resources by account (`entitlement_id`), which doesn't change. The resources' own page (`resources.html`) is
  untouched.

## Checks

- `e2e/demo-resources.spec.ts`: Resources says «waits on Marco», «Translate the checklist…» and «Review the first-week
  report», and none of «Davide», «PDF» or «report pane». The request's sheet says «Open the shared onboarding folder»
  and its address is `#resource-marco-claude`.
- Prettier, type-aware lint, typecheck; CI as the run on record.
