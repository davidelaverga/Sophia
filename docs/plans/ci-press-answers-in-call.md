# The press sweep in a call waits for the call

> 2026-10-19 · The reliability baseline's gap #1, «el job de la sala roza el límite y falla ~1 de cada 5» (flake ≈ 12 %,
> `evaluacion-2026-10-19/fiabilidad/linea-base.md` §2.2, §5); Luis 2026-10-19: «quisiera trabajar en la fiabilidad y
> resiliencia. Ahí tendríamos que también medir. Lo que no se mide, no se puede mejorar» and «Arranca R2 en paralelo».
> Tests and one fixture lever; nothing the person sees changes.

## Measured

- **The failure (CI on #470, run 39297874484, job 118215336621, shard 1 of 2):** `press-answers.spec.ts:183`, «on the
  room in a call», said four presses don't answer: `button.device-open «Check audio and video»`, `button.round «Chat»`,
  `«People»`, `«Brief»`. (The «+ 6» in the diff counts lines, brackets included.)
- **The cause, in the code:** the in-call sweep waits for the room's Invite alone (`DRAWN.room.slice(0, 1)`), then lists
  the presses once and reads each by its place in that list (`lookOf`, `querySelectorAll(...)[i]`). Since #466 the call
  joins a tick after the shell's first effects (`useJoinOnOpen`, call-ends-on-open.md). Out of the call the dock holds
  Join (disabled while joining, so not listed) and «Check audio and video»; live, `LiveControls` puts the microphone,
  camera, reactions, the floor, Sophia's controls and Leave there. The panel toggles (Chat, People, Brief:
  `PanelToggles` in the stage's corner) come after the dock in the page, so their places shift. A list made before the
  call is live points at a press that is gone and reads other presses for the ones under the pointer: exactly the four.
- **Reproduced:** locally the call is always live by the time Invite shows (16 of 16 probes, also at a 6× CPU throttle;
  10 of 10 sweeps passed at 4×), so load alone did not bring it here. With the call's token held 1.5 s, the sweep fails
  5 of 5 with the same four presses as CI.
- **The report's count against the logs:** `reliability-report.mjs --ci` counts failures by `file:line`, and the
  sweep's `test(` line is shared by its 13 pages. Its 32 at `press-answers.spec.ts:128` are 31 «on the work space» and
  one «on the room», all on 10-12/13, the spec's first days, before the sweep let entrances finish (`892bef716`,
  `8aa10e77f`). None of them is the in-call page, which is new since #466. The other two at the top are older flakes
  already fixed: `resources.spec.ts:461` is «arrow keys move across the tiles» (18, all on 10-12, fixed by `b3676be54`;
  failures after the fix are branches not yet rebased) and `home-phone-needs.spec.ts:79` is «crossing 860 px leaves a
  focus outside the list» (16, all on 10-16, fixed by `f374b5288`). Neither shares this cause.

## What changes

- **Fixture lever `token=late`** (`fixtures/room.tsx`, `fixture-api.ts`'s `tokenAnswer`): each room token answers
  1.5 s late. The in-call sweep's address uses it, so the order CI met by chance is the order every run meets.
- **The in-call sweep waits for Leave in the dock** before it lists the presses, as `light-states.spec.ts`
  (`e7940b963`) and `light-stage.spec.ts` (#466) already do for their dock checks. The other pages are unchanged.

## Checks (written first)

- `test: … (failing)`: the in-call address with `token=late`, nothing else. Red for the right reason: the four presses
  CI listed, every run.
- The fix: the same sweep, waiting for the call. Green through the guard, 30 of 30 repeats with the token late, then the
  whole spec and its neighbours (the lit states and stage, the device check that uses `failToken`, the dock in the
  header).

## Limits

- The sweep still reads presses by their place in a list made once. Any other press that comes or goes mid-sweep would
  shift it the same way; today nothing else does on these pages once they have drawn.
- The sweep's other failures in the report's window were not chased here: sign-in's «Terms» and «Privacy notice» (2, on
  10-16) and Home's listening microphone (4, on 10-13, around `8aa10e77f`, which fixed its rest read). None since.
