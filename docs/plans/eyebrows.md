# The small capitals, one tracking

Luis, 2026-10-12: «Continua puliendo». The project views' section labels, measured together after the kit's section
heads (#248): what the eye reads as one voice is set three ways.

## What was measured

Headless Chromium at 1280, dark and light (`evaluacion-2026-10-12/views-type-measures.json`), every distinct text style
in Knowledge, Updates and the Conversations context pane:

| Label                                        | Set as                               | Tracking         |
| -------------------------------------------- | ------------------------------------ | ---------------- |
| Knowledge «Carried in from Personal» (`.eyebrow`, the kit's token) | 12/500 mono, capitals | 0.72 px = 0.06em |
| Updates «Since you last looked», «Meetings» (`.updates-part > h3`) | 12/500 mono, capitals | 1.08 px = 0.09em |
| Updates «Decided», «Made»… (`.updates-part > .recap-section h4`)   | 12/500 mono, capitals | 1.08 px = 0.09em |
| Conversations' day («OCT 6», `.conv-day`)                          | 12/400 mono, capitals | 1.08 px = 0.09em |
| The palette's groups, the floor's label, the report's meta, a field's label | 12/500 mono, capitals | 0.72 px = 0.06em |

Everywhere else in the Studio the small capitals take the token's 0.06em (`theme.css:327`); Updates and the day label
alone take 0.09em, a third wider: over «SINCE YOU LAST LOOKED» that is 6 px, enough to read as another family beside
Knowledge's label one view away. The personal space's labels (`.hw-date`, `.c3-label`, 0.08em) are the companion's
own voice and stay; the context pane's labels are sentence case by design (C9) and stay.

## What changes

- `.updates-part > h3` and `.updates-part > .recap-section h4`: `letter-spacing: 0.06em`, the token's.
- `.conv-day`: `letter-spacing: 0.06em`.

Nothing else: sizes, weights, inks and cases are as they were.

## Checks (written first)

- `e2e/eyebrows.spec.ts`: on Knowledge, Updates and Conversations, every uppercase 12 px label in the view has one
  tracking, 0.72 px; the Studio's token read on Knowledge is the same value.

## Left

- The context pane's labels (12/600, sentence case, the second ink) stand at the size of the pane's own 12 px lines
  (decisions, descriptions): the hierarchy there is by weight alone. Noted for Luis's eye; C9's choice, not changed.
- The meeting rows in Updates stand 51 px tall (10 + 20 + 8 + 3 + 10): the 3 px bar keeps them off the 4 px grid by
  one. Left as it is.

## After the review (Codex on #260)

- The day label is data at the label size (10.5 px, Codex on #241) and keeps the token's tracking, 0.06em (0.63 px).
  eyebrows.spec reads the small capitals at 12 px or 10.5 px against 0.06em of their own size, and checks the day label
  is among them on Conversations.
