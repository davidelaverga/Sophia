# Implementation-session handoff: Home, attempt 4 (#86: a correction, and the checks it asked for)

- **Goal and attempt:** attempt 3 reported its mutations as 22 of 22 killed. That count was wrong: the script ran its checks through Windows' own `bash` (WSL's, absent here), so every check failed and every mutant read as killed. This attempt measures again, adds the two missing checks, and fixes the microphone checks' flakiness found on the way.
- **Owner / executor:** Luis. Claude Code in the Claude desktop app on Luis's Windows machine.
- **Native session:** a local Claude Code session; no exported identity.
- **Start:** branch `home/welcome` at `974db38`, 2026-10-04.
- **End:** content commit `3a5163d`; its checks ran on it.
- **Writable scope:** Home's fixture and its checks. **No product code changed.**

## Outcome

- **Measured properly** (Git's bash, two control mutants that must survive, and a pause for the dev server): on `974db38`, 20 of 22 mutants were killed. Two survived:
  - pressing the microphone again didn't need to stop it;
  - on a phone, "Join the room" could be said only to a screen reader.
- **Both now have a check,** and all 22 are killed. Both controls survive.
- **The microphone checks raced a 700 ms timer** under load. The fixture's voice now hears when the check says so (`homeFixture.hear()`).

## Evidence

- **Mutations:** 22 of 22 killed; 2 of 2 controls survive.
- **Home's checks:** `--repeat-each=5`, 90 of 90. Format, lint and typecheck pass.
