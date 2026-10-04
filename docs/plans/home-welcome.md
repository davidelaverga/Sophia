# Home: the Welcome (the "$20" pass)

> 2026-10-04 · Luis · design note before code · after [entry-opening](entry-opening.md)

## Why

Luis, on the first take (two doors in the Studio's tile language): "aún lo siento cheap y que no vale 20". He also rejected two richer dashboards: "ninguno se ve minimalista y premium". He chose direction **C2, editorial**: "C2 y la elevamos".

Minimal and premium means:

- **One focal point:** Sophia's light.
- **Type does the work,** with room around it.
- **No cards,** only hairlines.
- **One accent,** only when something is urgent.
- **One sentence** that matters.

## The idea: an editorial page that knows you

- **On the left, one column:**
  - **The date**, as a mono label.
  - **The greeting** in two lines, large and light: "Good evening," with your name below it in grey.
  - **Sophia's sentence:** the one thing that matters now (`sophiaSays`):
    - the call you are in;
    - else a session about to start;
    - else people in a room;
    - else "Your projects are as you left them";
    - with no projects, an invitation.
- **You and Sophia** (Luis: "¿dónde está la parte de personal?"), first, since it is private. Its label is warm.
  - One row says where you left off (`youDoor`: "Continue · Friday · the launch pressure", or "Start talking"), marked by her small light. Locked, it says "Unlock".
  - Your notes, when you have some.
  - Then the line to her.
- **Projects:** the three projects Work shows first (the ones the opening warmed), numbered 01–03, on hairlines.
  - Each row has its title and, quietly on the right, what matters there (`rowNote`): a session soon (amber), people in the room (teal), else its people.
  - One press opens it, joins its room, or takes you back to your own call; a press never hangs up.
  - "All N projects" ends the index. With none, one row starts the first.
- **A line to write or speak to Sophia,** no box, with a microphone (Luis: "¿y poder hablarle en voz?"). On-device dictation, as in Personal: your voice never leaves the device. She listens while you speak, and what she heard lands in the line to read and send.
- **The line itself:** "Say something to Sophia"; its padlock says "Only she hears this".
  - "/" reaches it, unless a sheet or a menu is open over Home: those keep their keys.
  - Enter hands your words to Personal, which opens and sends them as its composer would: one at a time, under their own key, kept while they go, and back in its field if they don't (`handed.ts`, `useHanded`). Home sends nothing itself, so a message never goes twice or around a read that Personal still owes (an erasure, Sophia unavailable).
  - While Personal can't take them yet, they wait in its field, said ("From Home · send it when Sophia is ready").
  - Locked, there is no line: your row unlocks your space.
  - The microphone stops when Home goes out of sight: nothing heard lands where you can't see it.
- **On the right, alone: Sophia's real light.**
  - She turns and leans a little towards the pointer anywhere on the page.
  - She listens while you write or speak to her.
  - Under reduced motion she rests. While Home is hidden she follows nothing and asks for no frames.
  - Her glow fades out before her box does.
- **Transitions with meaning:** Personal grows out of her light; Work grows out of the index (`data-door`).
- **Arrival:** the lines come in one after another, and the index's hairlines draw from the left.
- **Keys:** ↑/↓ move in the index, Enter opens, "/" reaches the line, H/P/W/D/L/T as everywhere.
- **Focus on the way back:** Home lands on the row of the side you left: your row with Sophia from Personal, the first project from Work.
- **Phone:** one column. Her light sits behind the greeting, top right, smaller.
- **Gone from Home:** the two doors, the padlock between them and the first-visit note about them. The privacy is said by the line itself, and the padlock stays in the bar (L).
- **Coherence without collisions:** Davide's #76 files stay untouched; Home's styles live in `personal.css`.

## Not in this slice

- A live voice conversation with Sophia in your personal space. Rooms have one (LiveKit and Gemini Live); the personal space would need its own media bridge. That is Davide's side, to plan with him.
- A name for email-only accounts: the greeting is then one line ("Good evening.").
- Decisions waiting on you, in Sophia's sentence. They need the owner of each pending action mapped to the person; a later slice.

## Checks

- The index: Work's first three, numbered, in Work's order; each note and each press as above; "All N projects"; empty, loading and failed.
- ↑/↓ and Enter in the index.
- Sophia's sentence, case by case.
- The line:
  - "/" focuses it, but not under a sheet;
  - Enter hands the words over and clears the line;
  - what Personal does with them (send, wait for the one on its way, keep them in its field) is checked in `handed.test.ts`;
  - locked, there is no line and the row unlocks.
- The microphone: what it hears lands in the line; it stops when Home goes out of sight; no microphone without speech on the device.
- Her light listens while the pointer moves and rests once it leaves; under reduced motion it rests.
- Her light asks for no frames while Home is hidden.
- Phone: nothing past the screen. Reduced motion: nothing moves.

## Before the PR

Luis sees a recording.
