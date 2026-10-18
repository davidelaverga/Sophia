# A new version: follow-ups to #432

> 2026-10-18 · Luis · "Procede con los arreglos" · the Codex P2 left on #432, after [new-version](new-version.md)

| Follow-up | Measured | Change |
|---|---|---|
| A word between the notice's drawing and its listening (Codex P2 on #432) | The notice reads `heard()` as it is drawn and listens from its effect. A word that falls between the two (an eager import's failed preload as React first draws) found no listener, and `onHeard` told only later words: the notice never showed until another part failed. On main, a listener added after a word is told nothing (the unit: 0 calls, not 1). | `onHeard` tells a listener that comes after a word of it as it starts listening, once (`new-version-signal.ts`). Adding the listener and telling it are one synchronous step, so no word falls between them. The notice's code is unchanged (its comment names the case): it still reads `heard()` as it is drawn, so a word before that shows it on the first paint. |

## Checks (written first)

- **Unit** (`new-version-signal.test.ts`): a listener that comes after two words is told once as it starts listening,
  then each word after. Main's `onHeard` tells it nothing (0, not 1).
- **Browser** (`new-version.spec.ts`, «a word after the notice was drawn, before it listened, still shows it»), on its
  own fixture page (`fixtures/new-version.tsx`): the notice, and after it in the tree a part that says it is gone from a
  layout effect. Layout effects run before any passive one, so the word falls after the notice's render and before it
  listens. On main the notice should never show; not run here (browsers wait for the serial e2e run). The page has no
  StrictMode, as a build runs: its second run of the effects would say the word again around the notice's listening.

## Limits

- The app's own page can't place a word in that gap on demand: it depends on when the scheduler yields. Hence the
  fixture page, which draws the real `NewVersion` and the real signal over its own ear.
- A notice put away with Not now isn't shown again by this: the notice listens once, as it mounts.
