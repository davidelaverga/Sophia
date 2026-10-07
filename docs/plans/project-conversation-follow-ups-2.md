# Project conversations: follow-ups to Codex on #139

> 2026-10-07 · two P2s, none a P1; #139 was merged under the no-P1 rule, these close them.

## The gaps

1. **A receipt that lands after the account was forgotten writes the cache.** Signing out or switching identity
   clears the cached reads and what is kept (`forgetKept`), but a message's receipt still went into the transcript's
   cache and asked for reads again (with the old token); a start's receipt put its conversation in the list. The
   generation fence of #139 guarded only the kept store.
2. **The wait for Sophia is never let go.** The view keeps since when Sophia was asked, and the line shows while no
   answer of hers comes after it in the pages read. Once six newer messages push her answer out of the newest page,
   «Sophia is answering…» comes back, for good.

## What changes

1. `useHeldWrite.run` notes the generation as it sends; a reply after a forgetting returns nothing, so nothing on the
   page follows from it: no cache write, no read again, no conversation opened, no wait kept. The message's cache
   writes move out of the send to after `run`, with the start's already there.
2. Her answer seen after the ask, the view lets that wait go; a newer ask made meanwhile stays. (As before, an answer
   of hers that lands after a newer ask counts for it too: `answeredAfter` compares times only.)

## Checks (written first)

- **Unit** (`held-write.test.ts`): a reply to the account still here is the press's; one after `forgetKept` is nothing.
- **Browser** (`e2e/project-conversation-follow-ups.spec.ts`): a receipt that lands after `forgetAccount` (the
  fixture's sign-out) sets off no read; asked, answered, then a page's worth of plain messages
  and a trip to another conversation and back: no «Sophia is answering…», no «hasn’t answered yet».
- **Mutants** with a control.
