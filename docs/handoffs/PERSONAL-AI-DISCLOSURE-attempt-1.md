# Implementation-session handoff

Goal and attempt: PERSONAL-AI-DISCLOSURE (the third gaps report §3; Luis: «Sigue con lo que queda en la cola»), attempt
1. A draft for Luis and legal review: not to merge before they approve it.
Human owner / executor resource: Luis (review, with legal; merge) / Claude Code session in worktree `Sophia-e2e`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-e2e`, branch `personal/ai-disclosure` from `origin/main`
(`07364e11`)
Writable scope: this worktree only (`apps/studio`, `docs/plans`, `docs/handoffs`); no API.
Runtime unit: Luis's Windows host (Playwright through `.claude-guards/safe-run.ps1`, two workers); CI as the run on
record.
Existing authority: Luis 2026-10-16, «Sigue con lo que queda en la cola». The report sends the words to legal review,
so this PR is a draft.
Ending commit/tree: `179ef0eb18f5` (tree `15824a4d6852`), the last commit of `personal/ai-disclosure`'s own that changes code (later
commits on the branch merge its base forward or touch only this record). 9 files changed against
`origin/main` at that commit: `e2e/personal-ai-disclosure.spec.ts`, `src/features/personal/AiDisclosure.tsx`, `src/features/personal/PersonalComposer.tsx`, `src/features/personal/PersonalSpace.tsx`, `src/features/personal/Talk.tsx`, `src/features/personal/help-lines.test.ts`, `src/features/personal/help-lines.ts`, `src/features/personal/personal.css`, `docs/plans/personal-ai-disclosure.md`. The review notes below name the commit of each later change.

## Outcome

- **A line under Personal's field:** «Sophia is an AI, not a person.» It stays for as long as the conversation is open,
  and a talk by voice says it too.
- **«Help now»** at its end opens a sheet of crisis lines, each to call, text or open:
  - the local emergency number;
  - the 988 Suicide & Crisis Lifeline;
  - Canada's 9-8-8;
  - Samaritans;
  - Línea 024;
  - findahelpline.com.

## Evidence

- Plan: `docs/plans/personal-ai-disclosure.md`.
- Written first and failing (commit of the tests):
  - `help-lines.test.ts`: the line's words and every number;
  - `personal-ai-disclosure.spec.ts`: the line under the field, the sheet and its presses, Esc back to «Help now», the
    line in a talk.
- **Found on the way:** the phone's capture showed «Help now» at 24 px, under the places' 40 px for a control on a
  touch screen. A check came first (commit `89a57538`), then the fix: the target reaches past the line, which keeps its
  height.
- **After the change, locally:** 210 checks, all passing:
  - the new ones;
  - all of `personal.spec.ts`, desktop and phone;
  - `knowledge-honest`, `light-breath`, `light-mode`, `message-links`, `personal-first-talk`, `press-answers` and
    `spaces-companion`.
- After the touch fix, Personal's 19 phone checks passed again. Type-aware lint over the whole repository, typecheck and
  Prettier are clean.
- **Captures** (`evaluacion-2026-10-16/capturas/ai-1-line.png` to `ai-5-talk.png`): the line under the field (desktop
  and phone), the sheet (desktop and phone) and a talk.
- **Each number, checked on 2026-10-16:**
  - 988, call or text, and chat at 988lifeline.org: SAMHSA's 988 fact sheet;
  - Canada's 9-8-8, call or text, any time, English or French: Government of Canada news release, 2023-11-30;
  - Samaritans' 116 123, free, any time, UK and Ireland: samaritans.org;
  - Línea 024, free, any time: Spain's Ministry of Health (sanidad.gob.es);
  - findahelpline.com, free helplines by country: ThroughLine's own site.

## Decisions and changes

- **A line that stays,** not a notice that goes: NY asks for the notice at the start and at least every 3 hours. A line
  always in sight covers both, if legal agrees.
- **Every line is listed:** the Studio doesn't know the person's country.
- **The sheet goes to the places' root,** as a talk does: the space under it moves (its shift), and a fixed sheet inside
  it would move with it.
- **In a talk, the line alone:** the talk is a modal whose Esc ends it, so a sheet over it would end the talk on its own
  Esc. «Help now» is one press away once the talk ends.

## Remaining obligations

- **Legal review** of the words, of whether a line that stays meets the 3-hour rule, and of the list of lines.
- **Detection and Sophia's answer** to suicidal ideation or self-harm: the API's, with Davide (issue #365). NY and
  California ask for it, and the Studio can't do it alone.

## Next bounded action

- Luis, with legal: review the words and the lines. Once approved, mark the PR ready; it merges on green with no open
  P1.
- Source IDs consulted: none from the source register. The work read this repository and the services' own pages named
  under Evidence.
