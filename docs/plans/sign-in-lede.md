# What opens, said at the door

> 2026-10-11 · Luis: «Procede», after informe-ui-premium §4 (the onboarding): the sign-in is the first screen and says
> only «Sign in to Sophia»; a person who followed a link knows nothing of what opens. The guest's door (JoinFlow) says
> it in one line: «“Project” is a room where people and Sophia think together.» No API change.

## What was measured

- `SignIn` → `Centered` draws the light, the mark, the title (`.screen-title`, 22–26 px) and the body: the account
  providers, the email field with «Email me a link», then «New here? The same link creates your account.» (14 px,
  `--text-2`). Six text nodes, 2 % of the screen; no sentence says what Sophia is.
- The door (`join.html`) under the same light: a title, one sentence of what the room is, the session's line, the
  name field. Seven nodes; the sentence is the one thing the sign-in lacks.
- The body is a centred column of `min(26rem, 100% − gutters)`, `gap: 14px`; a paragraph in it is `--text-2`, at most
  42ch, 14 px.

## What changes

- **One line under the title**, before the providers, in the door's voice and tense: «A room where your team and
  Sophia think together.» A `p` like the body's others (14 px, `--text-2`), so the screen keeps its three sizes
  (title, text, label). Only on the sign-in step: «Check your email» and the offer to continue keep their own words.
- Nothing moves: the light's rest, the title, the field and the buttons are where they were; the column grows by one
  line of 20 px and the gap.

## Checks

- `e2e/signin-lede.spec.ts`: the line sits right under the heading, at 14 px in the second ink, inside the column, at
  1440 and on a phone (no horizontal overflow); once the link is sent it is gone; and the screen still speaks in three
  text sizes (`typeSizes` of `.screen-body`).
- `pnpm format`, `pnpm lint`, `pnpm typecheck`; measured in the pane before the push.
