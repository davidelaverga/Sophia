# The states are one piece

> 2026-10-10 · Luis: «sigue y encólalas, terminarlas todas». The kit's eighth piece: `Skeleton`, `EmptyState` and
> `ReadNote`, after Button, Field/Search, Segmented, Tabs, SheetFrame, Menu and Card. Informe-30 §2.1: «todas las
> vistas cargan y vacían igual que Resources». No API change.

## What was measured

- **Reading.** Resources draws six tiles' shapes with a light passing (`.resource-placeholder`: bars of 10 and 14 px,
  the light 1.6 s, each 80 ms after the last, busy, «Reading the resources…» for a screen reader). Goals and
  Knowledge draw one faint block of 120 px (`.goal.skeleton`, busy, nothing said). Home's index draws three rows of
  shimmer (`.hw-row.placeholder`, 54 px, its own keyframes). Everywhere else a line of words in `.muted` («Loading the
  report…», «Loading the sources…», «Comparing…», «Reading what came after…»), with no status role: a screen reader
  is not told.
- **Nothing.** Seven empty states, five looks: `.empty` (Goals, Knowledge, the pulse: the third ink, 18 · 24 of
  padding, the body's size by inheritance), `.view-note` (Resources, Goals' search: the small type, 10 · 2),
  `.lane-empty` (the board: a dashed slot, the small type), `.chat-empty` (the conversation: centred, 24 · 8),
  `.ps-empty` and `.c3-empty` (the personal space: `--text-sec`, 4 · 8 and 24 · 0).
- A form's «say what should change first» (`.review-empty`) is an alert, not an empty state; a candidate image's
  dashed box is a media slot. Neither moves.

## What changes

- **`Skeleton`, `EmptyState`, `ReadNote` in `@sophia/ui`** (over the pure `state-class.ts`). A skeleton says what it
  reads (`label`, a status out of sight), marks itself busy and stands in with shapes: loose bars, cards (in the host's
  own grid: `className`) or rows; each shape's light runs 80 ms after the last (its inline delay, inherited by its
  bars). An empty state is the sentence (`children`) and its way forward (`actions`, under it); a `slot` is a box with
  nothing in it. A read note is the one line that says a read is on, a status.
- **One look in `theme.css`**: `.skeleton-shape` (the bars, the light, `skeleton-light` 1.6 s; a card's plane and edge
  for `.skeleton-card`, a 54 px row for `.skeleton-row`; still under less motion), `.empty` (a grid of the sentence
  and its way, 14 apart, 18 · 24 of padding, the third ink, the body type, the sentence at 60ch at most;
  `.empty-slot` dashed and centred at the small type; the pulse's 7 · 0 kept), `.read-note` (the third ink, the body
  type).
- **Everything moves onto them.** Reading: Resources (six cards), Knowledge (three cards in its grid, where one block
  was), Goals (one row of bars), Home's index (three rows); the twelve lines of words become read notes (the report
  pane's four, the PDF's, the history's two, the sources', the brief's, the passkeys', the recap's). Nothing: Goals'
  none and search miss, Knowledge's two, the pulse's, the board's lanes (slots), the conversation's, the personal
  space's notes and projects, Resources'. Their own classes stay for what is theirs (the pulse's padding, the recap's
  column) and for the specs that name them (`.lane-empty`, `.ps-empty`, `.resource-placeholders`).
- `e2e/states.spec.ts`: Resources reading (six shapes, busy, said, the light's name, 1.6 s and 0 … 400 ms of delay,
  none under less motion); Goals with none, a board lane, Knowledge with nothing matching, the personal space with
  no notes: every empty state in the third ink at 13 px (a slot at 12 in its dashed edge), with the padding of its
  place, its sentence first and its way forward after. `state-class.test.ts`: the classes and the scale.

## States

- A skeleton has one state: reading (busy). Under less motion its light is still. It never takes the focus.
- An empty state: at rest; its way forward's presses have the press's states. A slot the same, in its lane.
- A read note: a status, read once when it comes; the words unchanged (the specs name them).
- A screen reader now hears every read («Reading the goals…», «Reading your projects…») where before it heard the
  resources' alone.

## Checks (written first)

- The spec's measure before the change: Goals' block 120 px with no status, no shapes; Knowledge's the same;
  `.view-note` at 12 px with 10 · 2 of padding; `.chat-empty` centred at 12; `.ps-empty` at 4 · 8.
- Mutant, with the control passing: `.empty`'s padding set to 10 · 2, every empty state measures it and the measure
  reports it; the inline delay removed from the shapes, the light's delays read 0 s on every shape.
- `pnpm check` clean.

## Left

- `ProjectContext`'s `Waiting` («Reading the project's context…») has its own wait and words; it stays.
- The sending lines («Sending…», «Asking for the PDF…») are an action's progress, not a read: they stay in `.muted`.
- The kit's pieces from informe-30 §2.1 are all in: Button, Field/Search, Segmented, Tabs, SheetFrame, Menu, Card,
  the states. Next: the Chip row (the Tag's radii) and the typography scale (§2.2).
