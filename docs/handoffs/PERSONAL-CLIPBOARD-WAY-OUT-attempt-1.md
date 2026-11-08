# Handoff: Personal · an erasure held by an unanswered copy says the way out

Goal and attempt: hunt report on main (evaluacion-2026-11-08/caza-main.md), finding 5, attempt 1  
Human owner / executor resource: Luis (owner, «Procede y corrige», the two lines approved word for word); the Claude
Code session that built it  
Starting worktree/commit: `D:/Descargas/SophiaV4/Sophia-paper-4`, local branch `personal/clipboard-way-out` from main
`953e5dc3d` (through #500)  
Changed files: `apps/studio/src/features/personal/copy.ts`, `DataSheet.tsx`, `notice-view.ts`, `copy.test.ts`,
`apps/studio/e2e/app-auth.spec.ts`, `docs/plans/personal-clipboard-way-out.md`, this file.

## Outcome

#498 holds Delete everything back while any Personal clipboard write is unanswered. If the browser never answers it,
the set never empties for that page: every Delete everything waited 4 s and said «… Delete once it has.», with no word
of when that was and no way out named.

Now:

- The refusal reads «Nothing is deleted yet: your browser hasn’t answered the last copy. Delete again in a moment, or
  reload the page.» Checked first: `unanswered` and `erasing` are module state in copy.ts, never stored, so a reload
  starts with an empty set (as #498's handoff says).
- An erasure refused for unanswered writes leaves `answered` with copy.ts (`eraseAfterWrites(erase, answered)`). When
  the last of those writes settles, it is called once and forgotten. Your data's is the app toast (role status,
  polite, takes no focus): «Your browser answered the copy. You can delete now.» Pressed again meanwhile, only the last
  refusal's is kept, so it is said once. A write that settles with no refusal behind it says nothing. If an erasure is
  already under way when the set empties, the line is dropped: that erasure says its own outcome.

Unchanged: what the fence counts, when it lifts, the wait, the take-back, the Copy refusal's words. No API or storage.

## Evidence

- Red, on `4fc5bdda2` (tests only): `copy.test.ts`, 2 new cases fail. The refusal's words: actual «… Delete once it
  has.», expected the new line. The answer: `answered` actual 0, expected 1. The browser check
  (`app-auth.spec.ts` «an erasure waits for the browser's answer to a copy…», both ways) fails 2/2 on the refusal's
  words (received «… Delete once it has.»).
- Green, on `5b55fc100`: `copy.test.ts` + `notice-view.test.ts` 27/27; `oxlint --type-aware .` clean; `tsc` clean;
  prettier clean on the touched files. Browser checks through the guard: `app-auth.spec.ts` «your data|reply» 17/17
  (the extended case both ways among them), `personal.spec.ts` copy/delete cases 3/3.

## Deviations

- The browser case is the existing «an erasure waits…» check, extended (both ways), not a new one: it already holds
  the clipboard with the fixture's `silentClipboard` (no new lever needed), is refused twice, and releases the write.
  It now asks for the new refusal words and, after the release, the answered line, then Delete is asked.
- In that check the write lands with its sheet open, so «Copied to your clipboard» and the answered line come at
  once. The toast holds one line; the answered one is left, being what the refusals waited for. The check asked for
  «Copied» there before.

## Remaining limits

- The answered line is said even if the padlock shut meanwhile; Delete then asks to unlock first, as always.
- A browser that never answers still holds Delete everything for that page until a reload; what the browser then does
  with the old page's write is unknown (as #498 said).

## Next bounded action

Independent review of the two commits on `personal/clipboard-way-out`, then batch with the next verified branches.
