# Say the way out of an erasure held by an unanswered copy

> 2026-11-08 · Hunt report on main (evaluacion-2026-11-08/caza-main.md, finding 5). Luis: «Procede y corrige», with the
> two lines below approved word for word.

## Why

- **What #498 guarantees, unchanged here:** every Personal clipboard write is counted as unanswered from its press
  until the browser answers it and any emptying it led to (`unanswered`, copy.ts). Meanwhile no other Personal copy
  starts, and Delete everything waits the browser's wait (`WRITE_WAIT_MS`) and erases nothing (`ErasureWaits`).
- **What the person sees when the browser never answers:** every Delete everything waits 4 s and says «Nothing is
  deleted yet: your browser hasn’t answered the last copy. Delete once it has.» Nothing says when the browser has
  answered, and the one way out, reloading the page, isn't named.
- **Checked:** `unanswered` and `erasing` are module state in copy.ts, held in memory only (no storage of any kind). A
  reload loads the module again with an empty set, so Delete everything works on the reloaded page. #498's handoff
  says the same («A reload drops the page's count»).

## What changes

- **The refusal names the way out** (`NOTICE.eraseAfterCopy`): «Nothing is deleted yet: your browser hasn’t answered
  the last copy. Delete again in a moment, or reload the page.»
- **The answer is said once.** When an erasure was refused for an unanswered write, the page listens for the moment
  the set empties. Then the toast says, once: «Your browser answered the copy. You can delete now.»
  (`NOTICE.copyAnswered`). It is the app's toast (role status, polite), so it takes no focus.
  - `eraseAfterWrites(erase, answered?)` keeps `answered` from its refusal; the last refusal's is the one heard. It is
    called when the last unanswered write settles, then forgotten, so a second settle says nothing.
  - No refusal, no line: a copy that is merely slow says nothing new.
  - An erasure already under way when the set empties says its own outcome («Deleted…»), so the line is dropped then.
  - On Your data, a copy that lands with its sheet still open is said copied and, at once, answered. The toast holds
    one line, so the answered line is the one left: it is the one the person was waiting for.

## Not changed

When the fence lifts, which writes it counts, the wait, the take-back, the Copy refusal's words. No API or storage.
