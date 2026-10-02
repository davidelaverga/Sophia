# Implementation-session handoff: LFE-06, attempt 12 (a request said once)

- **Goal and attempt:** Luis asked what single thing to remove from the resource sheet to cut its visual clutter. The answer was the request waiting on its owner: five lines that said the same things three times. He said to go ahead.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `lfe-06/declutter`, stacked on `lfe-06/effort` (#55) at its tip, 2026-10-02.
- **End:** pending: the commit after the content commit fills it in.
- **Writable scope:** `RequiredActions.tsx`, the stylesheet, the fixture (`answerRequest()`), the checks and LFE-06's records. **No contract, schema or API changed.**

## Outcome (UI)

- **Before:** the operation; "Session claude-worker"; "Answer it in Claude Code, session claude-worker."; a "Waiting" tag; then the expiry and Copy session id. That was five lines, with the session named twice and "waiting" said a third time under its heading "Waiting on you" (and once more on the worker's row).
- **After, for the owner:** three lines. The operation, then "Answer it in Claude Code, session claude-worker.", then "expires in 40 min · Copy session id".
  - The session is named once, in the line that says where to answer.
  - "Waiting" is said by the heading.
- **For everyone else,** whose line ("Only Davide can answer this, in Claude Code.") doesn't name the session, "Session claude-worker" stays.
- **A request no longer waiting** (answered, denied, expired, superseded) still says what it became in its tag: "Answered".
- **"Copy session id" now sits next to the expiry.** Its label keeps the width of its longest words (SwapLabel), and the short one was centred in that width, so it floated.

## Evidence

- The RES-03 checks now say:
  - the owner sees the session once and no "Waiting" under the heading;
  - Luis sees the session line;
  - a request answered in its tool (the fixture's `answerRequest()`) says "Answered".
- **Four mutations** each made their check fail:
  - the session said twice to its owner;
  - the session said to no one else;
  - "Waiting" under its heading again;
  - an answered request not said.
- **A race in attempt 8's check, fixed here.** "The view opens as its viewer left it" reloaded before the order's glide had applied and been kept: one failure in 122 runs. The check now waits until the order is kept, as a person reloading would, and passed 10 of 10 alone.
- `test:browser --repeat-each=2`: 122 of 122.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm contracts:check` pass. `pnpm test`: 595 pass, plus the 5 known Windows failures.

## Next bounded action

- If Luis wants a second cut: under Capacity, the two meta lines ("6 readings · since 3 h ago" and "shared by 2 sessions · 1 min ago") as one. Then the list view and grouping by owner.
