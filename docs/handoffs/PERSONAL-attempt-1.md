# Implementation-session handoff: Personal, attempt 1 (the "$20" pass)

- **Goal and attempt:** Luis asked to apply the "$20" pass to the Personal space, where Home's main action leads. Design note: `docs/plans/personal-pass.md`.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `personal/pass` from main at `2712f2c`, 2026-10-04.
- **End:** content commit `484e390`; its checks ran on it.
- **Writable scope:**
  - Personal: `Conversation.tsx`, `PersonalSpace.tsx`, `PersonalComposer.tsx`, `personal.css`;
  - a new fixture page (`fixtures/personal.*`) and its checks (`e2e/personal.spec.ts`).
  - **No contract changed.** Davide's #76 files (`theme.css`, `Sheet.tsx` and the others) are untouched.

## Outcome

- **Measured before** on the real app: grey boxed bubbles, a 7 px dot, a boxed field with a violet ring, bordered pills, and her dot 6 px from a phone's edge.
- **Now:**
  - Umbral's halves mark the speakers, with no bubbles;
  - Home's head, rows and line;
  - her suggestion as a line, and the notes as a hairline column.
- **The independent review's P1 is fixed.** Between 861 and about 1250 px the see-through notes lay over the conversation. They are see-through only where they sit beside it; elsewhere they keep their opaque ground.
- **Its P2s are fixed:**
  - the toggle at touch size;
  - "Sophia is writing…" said in words;
  - the note form under your turn.
- **Most P3s are fixed:**
  - the phone head;
  - focus rings inside their boxes;
  - "Only she hears this" as the field's description;
  - a steady "No notes";
  - dead CSS removed;
  - her turns sized to their words;
  - the gutter lane only on narrow screens;
  - stronger checks;
  - the note matching the code.
- **Found outside this slice (for #85's follow-up):** while the opening is still up, about 5 s after Home is ready, "/" doesn't reach Home's line, but letters reach the app's keys. In a recording a "D" opened Your data.

## Evidence

- **Tests first:** 14 browser checks on the fixture. The 9 design checks failed before the change, and the review's new checks failed before their fixes.
- **Mutations:** 18 of 18 killed; 2 controls survive. The harness used Git's bash.
- **Gates:** `format:check`, `lint`, `typecheck`, `contracts:check` and the Studio's build pass. Unit: 114 of 114.
- **Browser suite:** 301 of 302. The one failure, Resources' "act · its owner acts", is untouched by this change and passed 4 of 4 alone.
- **Personal's checks:** `--repeat-each=3`, 42 of 42.
- **Real app** (Chrome, a new `@sophia.test` account): desktop and phone recordings sent to Luis.
