# Five decisions for Luis: the size scale, text targets, the empty room, the hand, the phone's panels

> 2026-11-23 · From the independent evaluation of 2026-11-22 (`mejoras-ui.md`): improvements 11, 12, 19, 22 and 23
> meet a written decision or are design calls, so they get a proposal and no code («Decisiones ya tomadas no se revierten
> por tu cuenta»). Each has two options, what each costs, and a recommendation. Nothing is built until Luis says yes.
> Measured on the fixture pages at `d1e6b1410` (`main`), 1280 × 800 and 390 × 844, unless said otherwise.
>
> **Decided** 2026-11-23 · Luis: «Yes, all five». 11 and 19 close with no change; 12 is built in a batch of its own;
> 22 waits on Luis picking the glyph, 23 on the mock-up.

## Summary

| #   | Question                                        | Recommendation                                     | Cost if yes                 |
| --- | ----------------------------------------------- | -------------------------------------------------- | --------------------------- |
| 11  | Three heights and three radii?                  | **Keep the scale we have**; close 11               | none                        |
| 12  | Hold and Stop bigger under a mouse?             | **Widen the target, not the drawing** (34 × 28)    | one CSS rule, one check     |
| 19  | Something in the empty room?                    | **Keep it empty**; the next session is already there | none                      |
| 22  | Another icon for «Take the floor»?              | **Yes, its own glyph**; the hand means raise hand  | one icon, Luis picks it     |
| 23  | Chat, People, Brief near the thumb on a phone?  | **Yes, above the dock**, after a mock-up           | CSS on `--dock-h`, captions |

## 11 · A scale of sizes with names

**Measured.** The scale already exists and holds:

- Presses stand on 24 · 28 · 32 · 36 (`control-heights.md`, fenced by `control-heights.spec.ts`); on Tasks, the work
  space, the room, Resources and the personal space, 0 presses off it (the only 20 px ones are the fixture's own
  «Leave Home» and «Lock (fixture)»).
- Fields stand on 36 · 44 (`field-scale.md`, `field-scale.spec.ts`); every search measured 36. A field's input is 28
  inside its 36 group: the evaluation's «28» is that input, not a second field height. Its 29 and 37 did not
  reproduce; Home's line is 45, its own composer.
- Radii are four tokens, `--r-1`…`--r-4` = 4 · 6 · 8 · 12 (`chips-radii.md`, `chips-radii.spec.ts`); on those five
  pages every painted radius is one of them.

**Option A · keep the four steps.** The evaluation measured the scale, not a drift from it. Cost: none.

**Option B · three heights and three radii, as asked.** Drops one step from each: every 24 px text button (27 on
those five pages) or every 36 px press moves, and one radius folds into another (`--r-2` is written 27 times in
`theme.css`, `--r-3` 25); three notes Luis approved are reverted and their three specs rewritten. Cost: a batch of its
own, and a visible change on every page.

**Recommendation: A.** Close 11 with no change.

## 12 · Hold and Stop under a mouse

**Measured** (`document.elementFromPoint` on every pixel within 20 px of each, the work space at 1280, fine pointer): «Hold»
and «Stop» are 28 × 24 and press only inside their box (28 × 24, 690 and 672 points); they stand 6 px apart beside a
28 px «Request review». 24 × 24 meets WCAG 2.2's minimum target (2.5.8, AA). Under a finger the guide already widens
them to 44 × 44 (`theme.css`, `.controls .control-row .text-button::after`, checked by `goal-controls.spec.ts`).

**Option A · leave them.** They pass AA. Cost: none.

**Option B · widen the target under a mouse, not the drawing.** The same `::after` under a fine pointer, as tall as
the row (28) and 3 px out on each side (half the gap), so the two targets touch and never overlap: 34 × 28. Nothing
on screen changes; one primary per goal stays (`goal-controls-text.md`). Cost: one rule under `(pointer: fine)`, a
check in `goal-controls.spec.ts` that measures the target with `elementFromPoint` and the two targets apart.

**Recommendation: B.** Invisible, cheap, and the row's 28 is the height the eye already reads.

## 19 · The empty room

**Measured.** Alone in the room, the stage shows her light and «The floor is open»; when the calendar has a session,
the line under it already names it (its title, «Today · 18:30 – 19:30», «starts in 15 min»: `sessionNote` in
`RoomStage.tsx`). The evaluation proposed the next session, the last recap or the view's keys: the first is there, the
keys are in each control's tip and behind `?`, the recap is in Updates and opens after a call.

**Option A · keep it empty.** «Say less»: the light is the room, and what is next is already said. Cost: none.

**Option B · one more line: the last recap.** Under the session's line, «Last call · Yesterday · 3 decisions», opening
the recap. Needs a mock-up first, a read of the recaps in the room when nobody is in a call, and a new text for Luis.
Cost: a small batch (a pure module, the line, a spec), and one more line on a stage built to be quiet.

**Recommendation: A.**

## 22 · The hand

**Measured.**

- At 1280, «Take the floor» is a pill with its words and no icon; «Raise hand» is the round hand with a wave
  (`handRaise`). One hand on screen.
- At 390, the dock is one row of seven 42 px squares (`phone-dock.md`): the hand there is «Take the floor» (`hand`),
  and «Raise hand» is the first item of React's menu (`raise-hand.md`, as Meet's phone has it).
- **With #548** (the compact dock, batch E), at 640 the dock turns to icons: «Raise hand» and «Take the floor» are
  two hands two squares apart (captured on `ui/mejoras-e-visual`). The two glyphs differ only by a small wave.

**Option A · keep both hands.** The two decisions stand; the words and the tips tell them apart. Cost: none.

**Option B · «Take the floor» gets its own glyph.** The hand then means one thing everywhere: asking the room for a
turn. The floor is the input to Sophia, so its glyph speaks of that (two or three drawn for Luis to pick: a speech
bubble with her light in it, a lectern, a baton). No text changes; the phone's row stays seven. Cost: one icon in
`Icon.tsx`, the phone dock's table in `phone-dock.md`, the dock's specs where they name the icon.

**Recommendation: B.** Once #548 lands, two hands sit side by side in the dock at the widths in between.

## 23 · Chat, People and Brief on a phone

**Measured** (390 × 844, in a call). The three toggles are 36 × 40 at x 253–368, y 170, under the lenses; the dock is
at y 778. On a computer they sit in the stage's corner level with the dock (`.stage-corner`); under 800 px of stage
they go up to the lenses' line so the dock keeps its band. The dock's row of seven is full (`phone-dock.md`), so they
can't join it.

**Option A · keep them up top.** They are where the eye finds the lenses; a tap opens a sheet that covers the screen
anyway. Cost: none.

**Option B · just above the dock, on the right.** On a phone the corner sits `--dock-h` plus 8 px over the bottom
(the dock's height is already published for that), a short reach from the thumb. The captions above the dock move
up by the corner's height. Cost: a mock-up for Luis, about ten CSS lines on the existing mechanism, the phone checks
of `room-dock.spec.ts` and the captions' spec.

**Recommendation: B, after the mock-up.** It is how the corner already sits on a computer; the phone is where the
reach matters most.

## Checked, no change: 7 · «Up to date»

The guide's «Reconnecting» works. On the room fixture, with the whole API cut (`window.fixture.outage(true)` and the
stream dropped), the bar said «Reconnecting» in 61 ms; the project, its title and its dock stayed on screen; with the
API back it said «Up to date» about 3 s later (the stream's wait). No request went unanswered. `feed-recovery.spec.ts`
already checks the same path. A write that fails says so in its own place, as the evaluation saw; the bar speaks of
the feed.

On the real rehearse stack (2026-11-24, `main` ffc32c4fd, Luis in the founder project, 1280 × 800), three cuts:

| Cut                                                          | «Reconnecting»                    | «Up to date» again       |
| ------------------------------------------------------------ | --------------------------------- | ------------------------ |
| API process killed (dev-stack restarts it in 2 s)            | 25.0 s after the cut              | 0.8 s after              |
| API killed again each time it came back, 40 s                | 21.9 s after the cut              | as soon as it stayed up  |
| The browser offline for 20 s (`setOffline`), the API is fine | 11.5 s after (25 s from last byte) | 54 ms after it came back |

The word is its own `role="status"`, so each change is announced. The 61 ms on the fixture holds only when the stream is
closed. When it is cut silently, the bar keeps «Up to date» until the stream has been quiet for
`STREAM_IDLE_TIMEOUT_MS` (25 s, `api/stream.ts`; the API's heartbeat is 10 s). A silent cut happens when the dev proxy
holds the browser's side open after the API dies, and when the person's own network drops, which can happen in
production too. Not checked: how Render's proxy closes a stream when the API process dies.

That is by design (2.5 heartbeats of silence), so nothing changes here. A possible follow-up without the API, for Luis:
when the browser reports `offline`, end the stream at once, so the third row reads «Reconnecting» in milliseconds
instead of up to 25 s.
