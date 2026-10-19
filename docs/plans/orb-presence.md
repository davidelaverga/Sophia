# Her orb tells where she is

> 2026-10-17 · Luis: «además de que sea bonita, debe reaccionar apropiadamente a lo que sucede en la sala». Studio only.
> Stacked on `paper-orb.md`. From the paper-orb workflow's survey of the room: the biggest true differences the orb
> showed nothing of.

## What was measured

- Her light read the same whether she was in the conversation or not, joining, or paused: the engine got `rest` (or
  `work`) for all of them.
- While this person's link came back, her light kept `listen` or `speak` from her participant's last, stale attributes
  (`inCall` holds through reconnecting), though the line already said Reconnecting….
- Speaking while this browser blocked her sound, her light rested like any idle moment.

## What changes

- **`sophia-view.ts`:** `presence`: `away` (no conversation, or her voice unavailable, and no work of hers running:
  working, she is busy, not dormant), `joining` (her voice not ready
  or recovering, her participant not in the room yet, or this person reconnecting), `paused` (her conversation is), or
  `here`. While this person reconnects her light rests (`work` if work runs): never listening over a dead link.
- **`SophiaLight`:** `presence` and `sound` become `data-presence` and `data-sound` on the box; its marks come from one
  `boxData` helper.
- **`RoomStage`:** her light moves to a small `StageLight`, which also gives it her presence and whether her sound is
  blocked (`needsAudio`); `observedSophia` passes `reconnecting`.
- **The paper orb (theme.css):** away, dormant (her violet greyed to 0.6, her inner light at 0.45, nothing turning but
  a shallow breath); joining, gathered and still, her inner light forming between 0.9 and 0.55 over 2.8 s; paused,
  drawn in and held, her violet kept. None of them is moved by a voice or leans toward anyone. Blocked sound: no voice
  in her, and a slow call on her rim and in her glow until it is allowed. Under reduced motion each stands still at its
  own values.

## Checks, written first

- `sophia-view.test.ts`: away without a conversation or a voice; joining while the voice gets ready, recovers, before
  her participant is in the room, and while this person reconnects (and then resting, `work` while work runs); paused
  for a guest or a paused input; here listening, speaking, at rest and outside the call.
- `orb-presence.spec.ts`: away greys and stills her; here keeps her whole and turning; her participant leaving and the
  link lost make her form (never listening), and the link back brings her back; a guest pause holds her with her violet;
  blocked sound calls on her rim until Allow audio; reduced motion keeps away greyed and still.

## Limits

- The dark page's WebGL light doesn't draw these yet: only the paper orb reads `data-presence` and `data-sound`.
- Over a link coming back she is joining, and her light carries no blocked-sound call; Allow audio stays
  (`orb-follow-ups.md`).
