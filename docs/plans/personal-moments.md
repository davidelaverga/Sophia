# Personal: touch, moments and ease (the "$20" features)

> 2026-10-04 · Luis · after [personal-presence](personal-presence.md) · "Una pasada más de 20 que sea de features, de micro interacciones, de momentos especiales, de quality of life. Que cubra todas las bases"

## Why

Personal now looks right and reads as a conversation. What a paid companion also has, and Personal lacks:

| Base | Missing today |
|---|---|
| Touch | Her words can't be copied. A reply that lands while you read further up passes unseen. Nothing says a note was kept except a toast. |
| Limits | The field stops at 4,000 characters without a word (the #86 follow-up). |
| Moments | The room is the same at 8 in the morning and at 2 at night. Coming back after two weeks reads like any other day. The day you began, and a month together, pass unmarked. |
| Ease | No way to find something said last week. Offline, a message fails, and only then do you learn why. |

Everything here is the Studio's own: the API's data as it is today, no new endpoint. Each part is one small PR with its own tests, mutants, review and handoff, in this order.

## 1. Touch (`personal/touch`)

- **Copy her words.** On her turn, beside the time: "Copy". On hover or focus, or on a tap on touch screens, as the time shows. A press copies the turn's words and says "Copied" for 1.6 s. If the browser refuses, it says "Couldn't copy". Your own turns keep "Note this".
- **She answered while you read up.** A reply that lands while you are further up no longer pulls you down. A quiet "Sophia answered ↓" appears at the foot of what you see, on a bar of no height between the list and the field, so it moves nothing. A press brings you there, and the focus stays in the conversation. So does scrolling to the end, and the line goes either way. A reply that lands while the space is out of sight counts as unseen once you're back.
- **The field's limit, said before it bites.** From 3,600 characters, a count shows over the field's line, at its right, and the draft's note stays at its left: "3,612 / 4,000". At 4,000 it turns warm and says "4,000 / 4,000 · the most one message holds". The field's description includes it.
- **A long unbroken word stays in the field.** Found while measuring the count: a pasted link with no spaces widened the field to its full length (12,600 px), and the whole column left the screen. It now wraps inside the field.
- **A note kept lands somewhere.** When Note this keeps a note, a small light flies from the turn to the notes' count, which brightens once. With less motion asked for there is no flight, and the count still brightens.

## 2. Moments (`personal/moments`)

- **Her light follows the hour.**
  - Morning (5–11): the wash is clearer.
  - Day: as it is now.
  - Evening (18–22): it is warmer.
  - Night (22–5): it is lower and deeper.
  - At night the field says "Still up? Write to Sophia…".
  - The hour follows the app's own clock, which moves every 20 seconds.
- **Coming back after a while.** A day that follows the one before by 7 days or more says so on its divider: "Today · 12 days later".
- **Where you began.** When the conversation's first day is loaded (no earlier days left to read), its divider reads "Sep 21 · Where you began". On the first day itself it says nothing yet. A day's moment is written in her warm hand.
- **After an erasure** the conversation begins again: its first turn is where you began, and time together counts from it. Erasing is for good.
- **One moment per day.** Time together comes first, then where you began, then time away.
- **A month together.** On the day a month, three months, six months or a year has passed since that first day, today's divider says it: "Today · a month together". It shows only while the first day is known.

## 3. Ease (`personal/ease`)

- **Find in your conversation.**
  - **Opening it:** the head carries a find button (tip "Find · Ctrl F"). Ctrl or Cmd F opens it while you are in Personal; anywhere else, the browser keeps it.
  - **Results:** matches are marked in the turns with "2 of 5". Enter goes to the next, Shift Enter to the one before. Esc closes it and gives the focus back.
  - **Earlier days:** it searches what is loaded. When earlier days exist, "Look further back" loads them.
- **Offline, said before you send.**
  - **The field:** while the browser is offline it says "You're offline. Your words wait here", and send waits. The draft is already kept.
  - **Back online:** it says nothing; the field is ready again.

## Not in this pass

- **Anything that needs the companion or a new endpoint.** That means editing a sent turn, reactions she reads, or reminders. Those are in [personal-twenty](personal-twenty.md)'s list for Davide.
- **Streaks and counts of days.** A companion doesn't keep score of you.
- **Codex's P2s on #89 and #90.** They are behaviour fixes and stay their own PR after these.

## Checks

Each part's checks are written first and fail before its change:
- copy and its refusal;
- the line when she answers while you read up, and its absence at the end;
- the count's thresholds;
- the flight, and its absence under reduced motion;
- the light per hour, with a fixed clock in the fixture;
- the dividers' words;
- find: marks, steps, Esc, earlier days;
- offline and back.

`theme.css`, `board.css`, `resources.css`, `Sheet.tsx` and `TaskTile.tsx` (Davide's #76) stay untouched.
