# Home claims nothing it hasn't read

> 2026-10-19 · costuras.md seam #7, first cut (`evaluacion-2026-10-18/experiencia/costuras.md`); Luis 2026-10-18:
> «Que sigue>» after «Todo trabajo nuevo que hagas ten en cuenta nuestro cuello de botella actual. Si se puede hacer en
> un pr, excelente o como veas, que alivie la presión pero hay que seguir trabajando». Studio only; one line taken
> away, none added.

## What was measured

- Under the greeting Sophia says one sentence (`sophiaSays`, `places-view.ts`): the call you are in, else a session
  within 10 min (`SOON_MIN`), else the busiest live room. With none of those it says «Your projects are as you left
  them.»: on every return, after an hour or after a week of decisions.
- Nothing backs it. Home reads `ProjectSummary` alone (id, title, role, members, room, next session, releases): no
  field says what changed. The since window (A34, `getSince` in `api/vision.ts`) has one caller, Updates
  (`UpdatesView.tsx`), so Home never reads it.
- Saying nothing is a state Home already draws. While the projects load, or when their read fails, `sophiaSays`
  returns nothing and `Greeting` draws no `.hw-says`; «You and Sophia» then keeps its own 48 px under the greeting.
- The report's lever doesn't match the code. `home.html?projects=four` shows «Standup in Product launch starts in 10
  min.», because its Standup starts in 10 min (`home.spec.ts` asserts that sentence). No fixture set shows the claim
  today.
- Arriving with quiet projects moves the page today. While the projects load there is no sentence. When they come,
  the claim arrives and pushes «You and Sophia» and the rows down by its height, 46 px at a desk (a 22 px margin
  and a 24 px line).

## What changes

- **`sophiaSays`** ends with nothing where it made the claim. The call, the session soon, the live room and the
  invitation with no projects keep their words.
- **Why nothing, and not another line.** Each existing line says something true about what Home read: a call, a
  session, a room, or no projects. None of them fits a person whose projects are quiet. A new sentence, even «You have
  4 projects», would be a claim of its own, and the rows already say each project's people. Saying nothing claims
  nothing and adds no element. Once since reads exist, the full #7 puts a true line in this place.
- **Nothing moves when quiet projects arrive.** The page draws them as it draws the loading state, so the greeting
  and «You and Sophia» stay where they were.
- **The lever:** `home.html?projects=quiet`. It holds the same four projects, with Product launch's Standup moved to
  tomorrow, so nothing starts soon and nobody is in a room. That is a return after a while away.

## Checks, written first

- **Unit** (`places-view.test.ts`): Sophia's sentence for quiet projects, or for a session later today, is nothing. The
  old assertion of the claim is inverted. The cases for the call, the session soon, the live room and no projects stay
  as they are, word for word, with the strong part on the project's name.
- **Browser** (`home.spec.ts`, `home.html?projects=quiet`): the four rows are there, and there is neither «Your projects
  are as you left them.» nor a `.hw-says`. The greeting and «You and Sophia» sit at the same offsets as on
  `?projects=loading` (on main «You and Sophia» sits 46 px lower). The greeting's own checks (`home-first-glance`, the
  phone mark checks in `home.spec`, `home-needs`, `home-phone-needs`) run on `four` and stay as they are.

## Limits

- The line now arrives into an empty place. If a session comes within 10 min, or someone enters a room, while Home is
  open, everything under the greeting moves down by the line's height. Before, the claim held that place and was
  replaced where it stood. Keeping an empty place would leave a gap on every quiet Home, and on loading too.
- First cut only. The full #7 needs a since read per project on Home. Its line would be «Since you last looked: 2
  decisions and a new report in “Product launch”. Open Updates», said once per window, plus an arrival line inside the
  project with Open Updates. Both are left for the next step (see the handoff).
- `docs/plans/home-welcome.md` still lists the old sentence. It is the record of that design, and this note
  supersedes that line.
