# Home: her light as Umbral, and a first visit that says one thing

> 2026-10-04 · Luis · design note before code · after [home-welcome](home-welcome.md)

## Why

Luis asked whether the Welcome is worth "$20". Not yet, for two reasons on Home:

- **Her light reads as a generic orb.** At rest it is a soft violet blur with a white centre, and it is the page's one focal point. It carries none of the brand.
- **A new account's Home says the same thing twice.** "Start talking" and the line under it both open the conversation, so two of its three rows are one action.

## What changes

- **Her light on Home is Umbral, formed:** your half and hers, with her light standing behind them on the line between you. It is the mark the sign-in forms (`formed`, `Threshold.tsx`), now kept alive on Home.
  - It forms once, on arrival: her half grows from the light and yours rises to meet it. Under reduced motion it is simply there.
  - Out of sight (Home starts hidden when someone lands on another place), the box has no size, so the mark waits: it is never placed at nothing, and it forms when Home is first seen.
  - It is 96 px wherever the light's box has room (320 px or more), else 48.
  - Her light pours past the halves in soft rays. They turn towards the pointer and, while you write or speak to her, towards the line.
  - Rest, listen and hidden behave as before: no frames while Home is out of sight.
- **The rays follow whom she attends to:** the light behind the mark aims at the engine's `attention` when one is given, else at the pointer. The sign-in gives no attention once formed, so it is unchanged. Under reduced motion it stays where it stands, and once the pointer leaves the page it rests.
- **A first visit:** with no conversation yet (`youDoor` → null), "You and Sophia" holds only the line: it is the way in. Locked, still loading, or with a conversation, the row stays.
- **Focus on the way back from Personal** lands on your row, else on the section's heading: never in the line, which would open a phone's keyboard and set her listening.
- **Phone:** the 48 px mark sits on the greeting's line, her half's right edge on the gutter. The greeting scales down on narrow phones, so it stays clear of the mark, and Home never scrolls sideways.

## Not in this slice

- Personal's own "$20" pass: the next PR.
- Codex's three P2s on #86 (handed words while another tab sends, dictation after hiding, focus while projects load): their own follow-up.

## Checks

- **Home's light shows the mark:** the light carries `data-mark` with a 96 px mark on desktop, and its SVG is visible.
- **The rays follow attention:** `aimOf(attention, pointer)` in `threshold.ts`, unit-tested: attention first, else the pointer. That the engine calls it has no check: the rays' direction isn't observable from the page.
- **Out of sight at first:** no mark while hidden, never a mark at `0 0`, and the gesture runs once Home is shown.
- **Focus landing:** your row; on a first visit, the heading.
- **First visit:** with `you=new` there is no row in "You and Sophia", the line is there, and its label stays.
- **Phone, at 320, 360 and 390 px:** the mark sits clear of the date and of "Good afternoon," over a long name, her half's edge on the gutter (within 1.5 px), and neither the page nor Home's own scroller goes sideways.
- **Captures** of rest, pointer and writing on desktop and phone, and one video for Luis.
