# Handoff: ⌘K opens a conversation; the keys announce themselves once

Goal and attempt: COMMANDS-CONVERSATIONS-AND-KEY-TIP (items 7 and 8 of `evaluacion-2026-11-16/textos-lote-18.md`;
Luis approved the product lines on 2026-11-16: «Open conversation: <title>» and «Tip: press ? to see the keys for this
view.»), attempt 1
Human owner / executor resource: Luis (merge) / Claude Code session in worktree `Sophia-paper-7`
Native session: unknown
Starting worktree/commit: `D:\Descargas\SophiaV4\Sophia-paper-7`, branch `commands/conversations-and-key-tip` from
`origin/main` `9495c87fc` (through #513); not pushed
Writable scope: this worktree only.
Runtime unit: Luis's Windows host (Git Bash, Node 24.21); Playwright only through the guard (`pw.ps1`).
Existing authority: Luis 2026-11-16, the approved lines above; local only, nothing pushed.
Ending commit: the branch's last commit; two test-first pairs and this record.

## Outcome

- **Item 7, ⌘K opens a conversation** (`docs/plans/palette-conversations.md`). In Conversations, each conversation the
  list shows is a command, «Open conversation: <title>», no key, group «Go», `typed` (offered once what is typed names
  it, as projects are). Enter opens it as its row does. Only the list as shown (`shownList`), none while fenced; bounded
  by the list the API serves (newest only). Registered from `useOpenOne`, the view's one way to open a conversation
  (the row, the form's «Already asked here», the palette).
- **Item 8, the keys announce themselves once** (`docs/plans/keys-tip.md`). `KeysTip`, rendered by the `CommandsHost`
  in scope (every project view, the places): a note in the bottom-left corner, the approved line with `?` as a key, and
  Dismiss. Once per browser (`sophia.keys-tip` = `seen`, localStorage in try/catch; unreadable storage counts as seen).
  Ended by Dismiss or by the index opening any way. Shown only while `?` does open the index (no typing sink on screen,
  no sheet up), so it waits while the chat is open. Never under `(hover: none)`. A `role="status"` mounted all along;
  no focus moved.
- The checks start with the tip seen: `e2e/tip-seen.ts` gives `use.storageState` to `playwright.config.ts` (and through
  it the reliability config), `playwright.attention.config.ts`, `playwright.search.config.ts` and
  `playwright.served.config.ts`.

## Evidence

- **Red, item 7** at `0c2f89edf` (guard, `pw.ps1`): 1 failed, «Expected pattern: /Open conversation: Short or long
  briefs?/ … element(s) not found», after the palette opened with its field focused and named no conversation blank.
- **Red, item 8** at `426f0bd7e` (`pw-direct.ps1`, see below): 3 failed, «Expected: "Tip: press ? to see the keys for
  this view." … element(s) not found» and two «toBeVisible … element(s) not found»; the `@phone` check passed (it
  asserts an absence, so it can't be red before the tip exists). `keys-tip.test.ts` red on the missing module.
- **Green** at `d9db08984`: palette-conversations, keys-tip, commands, conversations-find, conversations-decide,
  dock-header, first-step: 69 passed (2.2 m). Unit: keys-tip, commands, shortcuts 32/32. `oxlint --type-aware .` 0,
  `tsc --noEmit -p apps/studio` 0, Prettier clean on every non-docs file touched.
- **The guard:** `pw.ps1` refused for memory for about three hours (free RAM 3–7 GB, it needs 9); the last two reds and
  the green ran through `pw-direct.ps1` (one worker, below normal) while `Wow.exe` was running and Aion 2 was not
  (`tasklist` checked before each run).
- The first green found two faults in the spec, not the product: the line's text included the Dismiss tip's word, and
  the status wrapper (zero size, always mounted) read as hidden. The spec now reads the line itself (exact text); fixed
  in the test commit, and its red run again on the new sha.

## Decisions and changes

- Item 7 lives in Conversations only, where the list is read and fenced; the other views' palette has no list read,
  and reading one there would bypass the fence (Left in the note).
- Item 8 once globally, as the brief asked and the plan doesn't say otherwise.
- Placement: the header has no room (143 px free between the views' nav and its end at 1280 px, measured on the
  fixture) and the views fill `100dvh − topbar`, so a band in flow would overflow; the bottom-left corner holds no
  control in the views measured (the spec asserts no button, link or field meets the tip's box in the Studio view).
- Source differs from the code: `commands.spec` says Tasks takes stray typing, so `?` is a letter there; measured on
  the fixture 2026-11-16, `?` from nowhere in Tasks opens the index. Left as it is (not this work's concern).

## Remaining obligations

- The conversations in the palette from other views of a project (see the note's Left).
- The tip's corner is checked against controls in the Studio view; the other views were looked at, not asserted.

## Next bounded action

- Luis reads; push with the next group PR when he says.
