# What a person reads names nobody who builds the Studio

> 2026-10-10 · Luis: «Empieza con el 3 y el 2» (the microcopy review's patterns; this is the third: names of the team
> in what users read). No API change.

## What was found

- Resources, while its records don't exist yet (`PendingView`, shown in production with the vision flag off), told
  every customer «The engineering connections the owners run (Davide’s Codex and Claude, Luis’s Claude) will be listed
  here.»
- The access sheet (`Connections`, behind the flag) said connecting an assistant «is an integration Davide qualifies
  client by client».

## What changes

- Resources: «The tools your team connects to this project will live here.», as its siblings say what will live there.
- The access sheet: «No assistant is connected, and none can be connected from here yet.»
- A check (`src/app/no-team-names.test.ts`, now `what-is-read.test.ts`) reads every string in the code the Studio
  builds, as TypeScript parses it (literals, a template's parts, JSX text: never a comment), and finds no name of the
  people who build it; tests and test data aside.

## Checks (written first)

- The new check failed on exactly the two strings; with the change it passes. `project-connections`, whose check held
  the access sheet's words, says them as they are now, and passes.
- Mutants, with a control that passes: a name put back in a string fails the check, a name after a `//` inside a
  string too (what a regex that strips comments would have hidden); a name in a comment doesn't (comments are for us).
