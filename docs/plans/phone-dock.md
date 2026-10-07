# The room's dock on a phone: icons in one row

> 2026-10-07 · Luis, on a capture of the dock at 390 px: «No me gusta como se ve esa barra. No se ve estético esos
> iconos flotando dentro de ese contenedor enorme». Shown two mock-ups (icons only; short words, which don't fit at
> 390 px), he chose icons only, «en rectángulo, no en círculo».

## The gap, measured

At 390 px the dock wraps into two centred rows («Take the floor», «Speak with Sophia» are wide pills), and its box
stretches to the screen's width: round icons float in a large box with empty sides.

## What changes

**On a phone (≤ 600 px),** every control in the dock is an icon in a 42 px square with 10 px corners, 4 px apart (seven fit one row at
390 px) (the Studio's
squared controls), in one row, and the dock's box hugs them:

| Control                             | Icon                     |
| ----------------------------------- | ------------------------ |
| Microphone, camera, screen, leave   | as today                 |
| Take the floor                      | a raised hand            |
| Pass to … (one person, or the menu) | an arrow handed on       |
| Speak with Sophia                   | her light                |
| Show Sophia your screen / camera    | an eye                   |
| Stop looking                        | an eye struck through    |
| Stop speaking                       | a speaker struck through |
| Resume                              | play                     |
| End                                 | stop                     |
| Allow audio                         | a speaker                |
| Text mode                           | a keyboard               |

- **Words stay as the controls' names:** each word is kept in the button, hidden to the eye on a phone, so a screen
  reader and every check still find «Take the floor». A touch has no hover: a control pressed and held shows its tip.
- **Passing the floor to one person** shows their initial on the arrow: whose the floor becomes, before it goes.
- **The labels «Floor» and «Sophia» go on a phone;** the holder's name stays said to a screen reader, and the eye
  finds the holder in the room (their mark beside them).
- **With more controls than fit** (Sophia speaking, looking and shown at once, eight or more) the row wraps.
- **On a computer nothing changes:** the words, the pills, the round devices.

## Checks (written first)

- **Browser** (`e2e/room-dock.spec.ts`):
  - at 390 px, the floor open and Sophia out: one row of 42 px squares with no words to see, named Microphone,
    Camera, Take the floor, Speak with Sophia, Leave the room, and the box no wider than its row;
  - at 390 px with Sophia in the conversation: End and the others the same, no «Sophia» label;
  - at 390 px with the floor yours and one other: the arrow shows their initial;
  - at 1280 px: «Take the floor» and «Speak with Sophia» read as words, as today.
- **Mutants** with a control.
