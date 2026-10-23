# No request offered where no one answers it

> 2026-10-17 · informe-25 (`evaluacion-2026-10-17/informe-25.md`), DL-06, from Luis's «Sigue con la cola … y el nuevo
> informe-25». Studio only. Stacked on `prod-honesty.md`, whose `?vision=off` lets a browser check measure production.

## What was measured

- **Request review** was a goal's one filled press everywhere. It sends to the lead's review ('lead.review' in the
  outbox), and nothing consumes that destination yet: the runtime claims only `native.%` and `control.settle`. Its
  receipt («Sent · Review requested. The status changes when Sophia confirms.») waited for ever.
- **Ask Sophia on a task**: the served board gives the sheet neither a conversation to ask in nor one to go to, yet the
  chips, the field and Ask were drawn, and every press was kept as «Not answered here…». The room's demo board had the
  same dead end.

## What changes

- **`labels.ts`:** `goalCommands(status, vision)`: a goal's commands in its state, in order, Request review only under
  the vision flag (the fixtures' lead answers it there). `WorkControls` uses it, so in production a goal shows Hold and
  Stop as text and no filled press; goal-controls-text.md's «one filled press» holds under the flag.
- **`PlanBoard`:** `portsOf` says whether the page has a conversation at all (`onAsk` or `onOpenConversation`). With
  none, the sheet gets no asks and `AskSophia` draws nothing. A conversation that only dropped mid-session (the work
  space) keeps its asks, with why (Codex F-005).

## Checks, written first

- `labels.test.ts`: Request review under the flag only; Resume while held; Stop alone when ready, without the flag;
  nothing once completed.
- `prod-asks.spec.ts`: at Tasks with `?vision=off` no «Request review», no filled press, Hold and Stop as 24 px text;
  the room demo's sheet «Review the first-week report» has no `.ask-sophia` and no ask field; the work space's first
  task still offers the field and its chips.

## Limits

- The room demo's task sheets lose their ask chips: they were a dead end there too.
- When the lead's review gets a consumer, Request review comes back by dropping the flag check in `goalCommands`.
