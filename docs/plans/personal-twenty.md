# Personal: what would make it worth $20 a month

> 2026-10-04 · Luis · design note before code · after [personal-pass](personal-pass.md) · the backend part is for Davide

## Why

Luis asked whether Personal is worth $20 a month. Measured against what people pay for now (2026):

| Product | Price | What the price buys |
|---|---|---|
| ChatGPT Plus | $20/month | memory across chats, natural voice |
| Replika Pro | $19.99/month | a companion, voice calls; its voice doesn't share memory with the text |
| Rosebud (a journal) | ~$12.99/month | long-term memory, weekly reports, voice journaling |
| Mindsera (a journal) | $14.99/month | analysis of your entries |
| Pi | free | an empathetic companion with voice |

Not yet. In production nobody answers: the API only has the development rehearsal, and the Companion agent (D1 in `docs/goals/personal-space.md`) is parked.

Even with a companion, a private chat alone competes with free Pi and with ChatGPT at $20. Sophia earns $20 as a whole: Studio and Personal, joined by a bridge nobody else has (a private space, and a note carried to your team only if you choose). Personal alone needs what the journals sell: memory you can see, a look back at your week, a reason to come back each day, and her voice.

Luis: "Avancemos todo lo que podamos para llevarlo a 20 y lo demás se le deja documentado a Davide. Hacemos la muestra con fixtures."

## What the Studio does now

### Real: wired to the API as it is, live once Sophia answers

1. **Arriving each day.** On a day with nothing said yet, under her latest greeting (today's, or an earlier one nobody answered), three quiet answers:
   - "Light today", "Steady", "Heavy today": one press sends it, as a way to start does;
   - beside them, the session about to start (below), if there is one.
2. **Getting ready for what's next.** When a session in one of your projects starts within 24 hours, a row offers to get ready for it with her.
   - For example: "Get ready for Standup · Product launch, in 10 min".
   - It sends: "Help me get ready for Standup in Product launch. It starts in 10 min."
   - It shows in the ways to start, and in the day's answers. The bridge begins here: what you prepare can then be carried to the project as a note.

### Shown with fixtures: hidden until the API gives their data

Each part takes optional props that `Places` doesn't pass yet. Without them, nothing of it shows, and nothing looks usable that isn't (no dead affordances).

3. **What she remembers.** At the top of the notes column, under "She remembers":
   - the few things she keeps about you, each with when she learned it;
   - each can be corrected or forgotten;
   - a line under them: "She uses these to know you. Nothing here leaves this space."
4. **Your week with her.** Once a week, her look back is the newest thing in the conversation, at its end:
   - a short paragraph and its themes;
   - three actions: "Talk about it" (sends), "Keep as a note", "Not now". Each puts it away.
5. **Talking with her.** "Talk with her" in the head opens a live talk, a modal:
   - her light as Umbral, large in the middle, speaking or listening;
   - captions for both of you;
   - Mute and End (Esc too).

   It ends at once if the space locks or goes out of sight. What was said lands in the conversation as turns, as typed ones do, and the focus goes back to "Talk with her".

## For Davide: what the backend needs

In order:
1. **The Companion agent (D1).** It answers personal turns and greets after a quiet spell, behind the `Companion` interface (`apps/api/src/companion.ts`). Nothing in Personal has value in production without it.
2. **Memory.** A store of short facts the companion keeps, owner-only like the rest of the space, and erased with it. Proposed:
   - `PersonalSpace.memory?: PersonalMemory[]`;
   - `PersonalMemory = { id, text, learnedAt }`. A `fromTurnId` could link it back to where she learned it, but the Studio doesn't use one yet;
   - `POST /personal/memory/{id}/forget`;
   - `POST /personal/memory/{id}/correct { text }`.

   The companion reads them as context and proposes new ones. Whether it may keep one without asking is D5-like and needs a decision.
3. **The weekly reflection.** A job that, once a week, writes a reflection from the week's turns, notes and check-ins. Proposed:
   - `PersonalSpace.reflection?: { id, weekOf, text, themes: string[] } | null`;
   - `POST /personal/reflection/{id}/dismiss`;
   - "Keep as a note" uses the existing keep-note command.
4. **Check-ins kept as data.** The day's answers are sent as messages today. Recording them as `{ day, mood: 'light' | 'steady' | 'heavy' }` would let the reflection speak of the week's shape:
   - `day` is the person's local day, so a time zone goes with it, since the Studio decides "today" by the device clock;
   - a daily reminder needs web push: a PWA subscription, a per-person time, quiet hours.

   A greeting once per local day, rather than once after a quiet spell, would let her open each day herself. The Studio shows the day's answers under an earlier greeting nobody answered, so no day goes without them.
5. **Personal voice.** A media bridge for the personal space: a one-person LiveKit room with the companion's voice preset (D2). The room's bridge (`/v1/media/*`) is the model, but the context is owner-only and never a project's.
   - Its transcript is written as personal turns, hers with `replyTo` set, so a reply in a talk never reads as her greeting.
   - The Studio starts a talk once per opening. Under StrictMode (development) `start` runs twice and the first is ended at once, so starting must be cheap to undo (no microphone prompt, no room joined yet), and a talk ended with nothing said writes nothing (`Voice` in `extras.ts`).
6. **The Studio side is ready.** The props named above are where each part plugs in (`PersonalSpace` → `NotesPanel`, `Conversation`, `Head`).

## Not in this slice

- Mood graphs and streaks. They wait for check-ins kept as data.
- Home's row speaking of the week. It waits for the reflection.
- Codex's P2 follow-ups on #85–#87.

## Checks

- **Unit:**
  - the day's answers show only on a day with nothing said;
  - the session to get ready for is the soonest within the day;
  - the words each sends.
- **Browser, on the Personal fixture:**
  - the day's answers send; "Get ready" shows and sends;
  - memory, reflection and talk appear only when their props are given;
  - forget, correct, dismiss, keep and talk act through their props;
  - talk shows her light and captions, and End brings the turns back;
  - phone; reduced motion.
- **Mutations with controls.**
- **A fixture video for Luis.**
