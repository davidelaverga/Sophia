# Handoff: a chat with Sophia asks for no microphone, attempt 1

Goal and attempt: TEXT-CHAT-NO-MIC (`docs/plans/text-chat-no-mic.md`; Luis 2026-11-28, «Sigue con la cola de mejoras
de UI»), attempt 1.
Human owner / executor resource: Luis (review and integration) / Claude Code (Opus 5.5) in the desktop app.
Native session: this Claude Code session; its id is not recorded in the repository.
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-ui-mejoras`, branch `ui/text-chat-no-mic` from `origin/main`
`0d5a85222`.
Changed files: `muted-speech.ts` and its test, `livekit-room.ts`, the room fixture's `fake-livekit.ts`,
`e2e/muted-speech.spec.ts`, the note, this record. Studio only.

## Outcome

In text mode the room no longer listens on the microphone for «You're muted», so «Chat with Sophia» joins without
asking for it. By voice, with the microphone off, the hint works as before.

## Evidence

- Unit: 11/11 in `muted-speech.test.ts`; the new rule seen failing under a mutant.
- Room fixture in the browser pane: by voice, muted speech says «You're muted»; in text mode it says nothing (main's
  fake said it).
- Format, types and lint clean.

## Remaining obligations

- CI is the record for the new spec case (the Playwright guard refuses while Opera is open).
- Not checked on a real LiveKit room with a real browser prompt: the rule is the same code path the fake mirrors.
- Whether «Chat with Sophia» should join the call at all stays with Luis (the note's «Not covered»).
