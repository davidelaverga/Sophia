# A view that fails to draw doesn't take the Studio with it

> 2026-10-16 · the third gaps report (`informe-brechas-3.md` §4, platform). The Studio had one error boundary
> (`LoadFailed`) around everything signed in. A view that failed to draw, say on data shaped other than expected,
> replaced the whole page with «Sophia couldn't finish opening»: the header, the other views and the call went with it.
> Studio only.

## What changes

- **`ViewFailed`,** an error boundary around each project view's page body (`ProjectShell`, every view but the Studio's
  stage). On a failure the view's place says:
  - «This view couldn't be drawn.»
  - **Try again:** the view draws anew.
  - **Load the page again.**
  - The header, the other views and the call stay.
- **It is keyed by the view,** so moving to another view starts it clean. What failed reaches the crash reports, as
  `LoadFailed`'s does.
- **The Studio's own view,** with the room's stage and dock, keeps the outer boundary for now. Its own needs the dock
  kept outside it, a later step.
- `LoadFailed` stays for what loads before any view: the signed-in Studio's chunk, a room's door.

## Checks

- **`view-boundary.spec.ts`:**
  - in the demo's Goals, a goal served with no criteria fails to draw: the view says so, the header's views stay, and
    another view opens fine;
  - once the goals are whole again, Try again draws Goals anew.
- **The fixture:**
  - `goals=broken` serves the demo's first goal with `criteria: null`, data shaped other than the contract;
  - `window.fixture.healGoals()` makes it whole again, and the project moves.
