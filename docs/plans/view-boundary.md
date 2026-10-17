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
  - the demo's Resources view fails to draw: the view says so, the header's views stay, and another view opens fine;
  - once it can draw again, Try again draws it anew.
- **The fixture:**
  - `resources=crash` makes the Resources view throw as it draws, as a bug in a view would;
  - `window.fixture.healView()` lets it draw again.
  - A snapshot shaped other than the contract can't be the trigger: the client refuses it as «unreachable» before any
    view reads it, which a first try showed.
