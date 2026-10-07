# Implementation-session handoff

Goal and attempt: the room's dock on a phone, icons in one row (`docs/plans/phone-dock.md`), attempt 1. Luis, on a capture at 390 px: «No me gusta como se ve esa barra … esos iconos flotando dentro de ese contenedor enorme». Shown two mock-ups, he chose icons only, «en rectángulo, no en círculo».
Human owner / executor resource: Luis / Claude Code in the Claude desktop app on Luis's Windows machine
Native session: a local Claude Code session; its identity is unknown (not exported)
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-lfe003`, branch `polish/phone-dock` on `main` `95c375c`, 2026-10-07
Ending commit/tree: on `polish/phone-dock`, `7786660` (the dock) and the commit after it (Codex's P2: a tip for every control held on a phone); a squash folds them into one.

## Outcome

**On a phone (≤ 600 px),** every control in the dock is an icon in a 42 px square with 10 px corners, 4 px apart, in one row, the box hugging it. Seven fit at 390 px (Sophia in, speaking, the floor yours).

- **`DockWord` (new):** an icon shown on a phone only, and the words, hidden to the eye there, which stay the control's name. Used by Take the floor, Pass to …, Speak with Sophia, Show Sophia …, Stop speaking, Stop looking, Resume, End, Allow audio and Text mode.
- **New icons in `@sophia/ui`:** a raised hand, Sophia's light, eye (and struck through), speaker (and struck through), play, keyboard, and an arrow handed on.
- **Passing the floor to one person** shows their initial on the arrow.
- **Pressed and held,** a control shows its tip; a touch has no hover. Controls with no tip of their own (take and pass the floor, stop looking, resume, allow audio) carry one for a phone (`DockWord`'s `said`), shown nowhere else (Codex on #147, P2).
- **«Floor» and «Sophia» go on a phone.** The holder's name stays said to a screen reader.
- **On a computer nothing changes,** and the icons stay out of sight.

**Independent review:** no P1 in the code. Its P1 was in the check: a range's box ignores the clip, so the words hidden to the eye still measured. The check now measures the box the words sit in.

P2s fixed:

- the holder's name kept for a screen reader;
- the initial on the arrow;
- a tip on press-and-hold, and Sophia's icon no longer like a record button.

P3s fixed: a refusal opens over the dock's middle; Join is as tall as the squares; play is filled as stop is; the note matched to the code.

Left:

- an empty floor group adds 4 px;
- a wrapped row (eight or more controls) spans the width.

## Evidence

- **Browser** (under the guard, once the machine had the memory):
  - `room-dock.spec.ts` 5 of 5, then 7 of 7 with the held-press checks (Sophia speaking; Sophia paused);
  - `room-dock`, `room`, `room-people`, `room-present`, `room-made` and `voice-chat` together: 72 of 73, the one failing being the dock check's own strict-mode slip, since fixed.
- **Not run first:** this check was written before the code but ran only after it, the guard holding every run back (free RAM under 8 GB).
- **Mutations,** 7 of 7 killed, and the control survives:
  - no squares on a phone;
  - the words shown on a phone;
  - no initial on the arrow;
  - the labels kept on a phone (checked at 560 px: under 420 px an older rule already hides them);
  - the icons on a computer;
  - a control with nothing to say when held (resume; the pass arrow).
- **Captures:** the mock-ups and the built dock (open floor, Sophia in, passing to one) sent to Luis.
- **Gates:** `tsc`, `oxlint --type-aware` and Prettier pass on the touched files.

**Source-register IDs consulted:** none.

## Remaining obligations

- None beyond the two cosmetic leftovers above.

## Next bounded action

The strip beside a shown screen on a phone (branch `polish/phone-strip`), then its PR.
