# PR #199: a review-disposition map for eight open findings (CON-01, CC-0166)

**What this is.** A source-only map, asked for in CX-0136. For each of eight open review threads on #199, it gives:
- the implementing commit;
- the function at #199's head that holds the behavior now;
- the focused regression test;
- the existing author and independent evidence;
- or the behavior still open.

**What it is not.** No source, test or feature is changed. No thread is resolved, and no CI is re-run. The reviewer inspects the mapping independently, on the immutable source, before any thread's disposition.

**The source mapped:** #199's head `d527f3854222020abb6ba723bf0ea7480c76bb82`, tree `72b89db438b57e7eaaeb6be802dc1ae4049c8b6d`. Every implementing commit below is an ancestor of it (`git merge-base --is-ancestor`). Paths are under `apps/studio/`, and line numbers are at `d527`.

**The terminal evidence at `d527`** (CC-0084, #198 comments 6104313009 and 6104365132; the author's scratch logs):
- `candd527-checks.exit` (`262a6da7…`): format, lint, typecheck, contracts and Studio unit tests 0; the focused browser gate 0; PostgreSQL persistence and API 0; dirty 0 before and after.
- `candd527-studio-unit.log` (`27e5ab94…`): 1222 tests, 1222 pass, 0 fail, 0 skipped.
- `candd527-e2e-focused.log` (`d6119655…`): 188 passed, covering `conversation-thread`, `conversations-*` and `project-conversation-*` on desktop and phone. Every browser test named below ran in it.

This is the author's evidence (L1, fixture browser). It is not product acceptance, and not G3 or G4.

## Summary

| Thread | Severity | Finding | Disposition at `d527` |
|---|---|---|---|
| [r4234938144](https://github.com/davidelaverga/Sophia/pull/199#discussion_r4234938144) | P1 | no Studio caller for whole-conversation erasure | Implemented (`447e7aec`). **Product scope open: D-3** |
| [r4235194403](https://github.com/davidelaverga/Sophia/pull/199#discussion_r4235194403) | P2 | an erasure seen through the feed isn't announced | Implemented (`0f2f3798`), then refined by `54ee3de8` and `127b4334`: the wording is "gone" unless the erasure's own reply says "erased" |
| [r4235194406](https://github.com/davidelaverga/Sophia/pull/199#discussion_r4235194406) | P2 | a late erase reply navigates a phone away | Implemented (`4575dadd`, kept by `0f2f3798`) |
| [r4235299406](https://github.com/davidelaverga/Sophia/pull/199#discussion_r4235299406) | P1 | a capped list's absence taken as erasure | Implemented (`54ee3de8`, published in `82f812d0`) |
| [r4235397321](https://github.com/davidelaverga/Sophia/pull/199#discussion_r4235397321) | P2 | the withdrawal key lost across conversation switches | Implemented (`a3422f48`) |
| [r4235629899](https://github.com/davidelaverga/Sophia/pull/199#discussion_r4235629899) | P1 | an external erasure never purged while the list stays capped | Implemented (`653fe9a8`), with its scheduler corrected (`1f49c4fd`) and refined (`35d2cf2f`, `127b4334`) |
| [r4238633930](https://github.com/davidelaverga/Sophia/pull/199#discussion_r4238633930) | P1 | the open read's `not_found` doesn't retire a reached row | Implemented (`e27fa377`, then `127b4334`). **No author reply on the thread yet** |
| [r4238826987](https://github.com/davidelaverga/Sophia/pull/199#discussion_r4238826987) | P2 | a confirmed send doesn't move the row's `lastAt` | Implemented (`e4c8cf8d`). **No author reply on the thread yet** |

No source behavior from these eight is still open at `d527`, except r4234938144's product scope (D-3). Each finding's own residual or limit is stated below. Other review findings on these paths are separate threads and are not mapped here: for example, r4238933255 and r4238933260 (CX-0073).

## 1. r4234938144 (P1): whole-conversation erasure has no Studio caller

- **Implemented in:** `447e7aec` ("PR #199 review corrections and CX-0013").
- **Where it is now:**
  - `src/features/conversations/EraseHere.tsx`: `useEraseHere` (`:41`) and `EraseConfirm` (`:97`);
  - called from `ProjectContext.tsx:233` for an admin (`capability.moderate`);
  - kept per conversation by the view: `ConversationsView.tsx` `eraseOf` and `useErased` (`:682`), and talk-store `withErasure` (`:441`).
- **Focused regression** (`e2e/conversations-removal.spec.ts`):
  - `:84` "Keep it and Esc keep the conversation, and give the focus back to Erase";
  - `:99` "erased, it leaves the list, the list says so, and the focus lands on the one open now";
  - `:116` "${role}: withdraws only their own, removes and erases nothing", for the editor and the viewer;
  - `:250` "an erasure with no reply is sent again under its key, after another conversation was opened".
- **Evidence:**
  - **Author:** CC-0011 ([#198 6090297123](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6090297123)) published `447e7ae`. Its scoped gate, CC-0014 ([6090866282](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6090866282)), **failed** on two tests outside this path: Personal contrast, and report C9, which fails on `main` alone. It is superseded by `d527`'s terminal above.
  - **Independent:** CX-0017 and CX-0019/CX-0021 exercised erasure through this control on the actual local Studio, API and PostgreSQL: a real 202, a same-key retry, and one durable erase request.
- **Still open:** the product question of whether admin erasure ships in this slice is **D-3**. `BINDING_MAP.md` §13 lists it as a proposal ("Include"), not an owner decision. The implementation is present; the scope is the owner's.

## 2. r4235194403 (P2): an erasure observed through the feed isn't announced

- **Implemented in:** `0f2f3798`, where the feed or the reply settles the erasure and the list announces it.
- **Refined by:**
  - `54ee3de8`: only the erasure's own reply, or a whole list read without the conversation, settles it;
  - `127b4334` (CX-0073, CX-0074): a direct read's 422 within the project is "gone". The words "erased" are kept for the erasure's own reply, because an absence can't prove an erasure (CX-0074's requirement 1).
- **Where it is now:** `ConversationsView.tsx` `useErased` (`:682`):
  - `settle(id, 'gone' | 'erased')`;
  - `on` uses "erased" and `gone` uses "gone";
  - the notice at `:374` is "The conversation was erased." or "The conversation isn't here any more.".
- **Focused regression** (`e2e/conversations-removal.spec.ts`):
  - `:1089` "an erasure whose reply is lost: when the feed shows it gone, it is said to be gone, not erased" (`127b4334`);
  - `:274` "an erasure whose reply is lost, out of a list of the newest only: read within its project, its not found says it is gone";
  - `:174` (desktop and phone) "when the feed takes the erased conversation before its reply, the focus lands on the list in sight (CX-0015)".
- **Evidence:**
  - **Author:** CC-0013 ([6090622797](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6090622797)) for `0f2f379`; `d527`'s terminal.
  - **Independent:** CX-0016 and CX-0017, Codex's own late-HTTP reproduction and its recheck; CX-0021 (phone: "erased notice", L1); CX-0076, the scoped-read correction at `127b4334`, L1.
- **Still open:** none in source. The announced wording is deliberately "gone" when only an absence is known.

## 3. r4235194406 (P2): a late erase reply navigates a phone away from the conversation opened since

- **Implemented in:** `4575dadd` ("an erasure's late reply never moves the person", Codex on `7660c73`), kept by `0f2f3798`.
- **Where it is now:** `ConversationsView.tsx` `useErased` (`:682`):
  - its `clear()` runs when another conversation is opened or one is started, and drops `landing`, `saying` and `told`;
  - a later feed or reply then does bookkeeping only: it doesn't call `toList()`, and doesn't move the focus or the draft.
- **Focused regression:** `e2e/conversations-removal.spec.ts:224`, desktop and phone: "an erasure's late reply leaves where you went since, your focus and your draft". It ran at `[98/188]` and `[188/188]` in `d527`'s gate.
- **Evidence:**
  - **Author:** CC-0013; `d527`'s terminal.
  - **Independent:** CX-0017 §4, a real 202 with its body withheld, the surviving thread, textarea and draft kept, with no erased note. It "independently qualifies the exercised r4235194406 branch". CX-0019 adds that a late transport failure doesn't move the new thread, the focus or the draft.
- **Still open:** none.

## 4. r4235299406 (P1): don't infer erasure from a capped list

- **Implemented in:** `54ee3de8` ("an erasure is settled only by its reply or a whole list", CX-0018), published in `82f812d0`.
- **Where it is now:**
  - `ConversationsView.tsx` `useSeen` (`:805`): `if (whole) settle(id)`, else `probes.start(id)`;
  - `useErased` (`:682`);
  - `talk-store.ts`: `goneFrom` (`:344`), `withListed` (`:418`), and `withErasure` (`:441`, which holds the intent under its key and never brings back a settled one).
- **Focused regression:**
  - `e2e/conversations-removal.spec.ts:297`: "an erasure with no reply, its conversation pushed past the list's newest: kept, its draft too, and sent again under its key";
  - `src/features/conversations/talk-store.test.ts:79` `withErasure`: `:80` "holds an erasure on its way or with no reply…", `:92` "never brings back a settled erasure…";
  - `talk-store.test.ts:315`: "goneFrom and withListed: only a whole list says one is gone".
- **Evidence:**
  - **Author:** CC-0015 ([6091005378](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6091005378)); `d527`'s terminal.
  - **Independent:** CX-0018 reproduced it on the actual app. CX-0019: "CX18's exact capped-list falsifier now passes", on the actual local app, API and PostgreSQL, with the same key and one durable request. CX-0021: "Capped omission PASS, L1".
- **Still open:** none.

## 5. r4235397321 (P2): keep withdrawal retries across conversation switches

- **Implemented in:** `a3422f48` ("…withdrawal keys; phone focus").
- **Where it is now:**
  - `talk-store.ts` `withWithdrawal` (`:429`): the view keeps each message's withdrawal intent, with its conversation known;
  - read and written by `WithdrawHere.tsx` `useWithdrawHere` (`:41`, through `kept.withdrawals[messageId]` at `:49–50`), not by the message's component.
- **Focused regression:**
  - `e2e/conversations-removal.spec.ts:329`: "a removal with no reply is sent again under its key, after another conversation was opened";
  - `talk-store.test.ts:261`: "a withdrawal is held under its message, its conversation known, and never comes back once gone".
- **Evidence:**
  - **Author:** CC-0016 ([6091287204](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6091287204)); `d527`'s terminal.
  - **Independent:** CX-0020 reproduced it on the actual local app (two keys). CX-0021: "Withdrawal retry PASS, L1 actual app/API/PostgreSQL", where the unknown state is preserved across the switch and the retry reuses the key.
- **Still open:** none.

## 6. r4235629899 (P1): purge an externally erased conversation from capped caches

- **Implemented in:** `653fe9a8` (`probes.ts`: a capped list's lost conversation is read directly).
- **Corrected by:** `1f49c4fd`. CX-0025 found the scheduler closed after React StrictMode's remount, a P1; `1f49c4fd` reopens it in setup.
- **Refined by:**
  - `35d2cf2f`: a conversation in doubt ends on any read set out since, r4238311491;
  - `127b4334`: a 403 fences and settles nothing; a 422 within the project is gone (CX-0073, CX-0074).
- **Where it is now:**
  - `src/features/conversations/probes.ts`: `Probes` (`:46`), with `PROBE` at `:29` (first 30 s, doubling to 5 min, a 15 s deadline, 3 at once);
  - `ConversationsView.tsx` `useProbes` (`:827`), started by `useSeen` (`:805`) for one left out of a list of the newest only;
  - not found to a current member settles through `settle` and then `useLetGo` (`:757`) and `withoutConversation`.
- **Focused regression:**
  - `e2e/conversations-removal.spec.ts:385`: "erased elsewhere while the list holds the newest only: read directly, its not found lets its part go";
  - `:756`: "older, then erased elsewhere with the list unchanged: read again on its own clock, its part goes then";
  - `src/features/conversations/probes.test.ts:42`, the `Probes` suite, with `:72` "not found settles it, once, and it is read no more".
- **Evidence:**
  - **Author:** CC-0019 (6091834171, cited in CX-0025); `d527`'s terminal.
  - **Independent:**
    - CX-0024 identified it;
    - CX-0025: 90 focused tests passed, and it found the lifecycle P1;
    - CX-0026: "exact published lifecycle correction crosses real local app", 92 pass;
    - CX-0076, the scoped-read correction at `127b4334`.
- **Its limit:** a probe's settlement is eventual, on the schedule above, not immediate. That is the bound the fix chose, and it is not a defect claimed here.
- **Still open:** none in source.

## 7. r4238633930 (P1): retire a reached row when its open read says not found

- **Implemented in:** `e27fa377` ("the open conversation's own not found lets it go…").
- **Refined by:** `127b4334`. The open read's 403 fences and settles nothing; its 422, to a current member, is gone.
- **Where it is now:**
  - `src/features/conversations/OpenConversation.tsx:349–356`: `code === 'not_found'` calls `onGone()`, and `'forbidden'` calls `onDenied()`;
  - `ConversationsView.tsx` `Open` (`:539`): `gone = () => settle(id)` at `:568`, which reaches `useLetGo` and `withoutConversation`, dropping the cached messages and the row; `denied` calls `withDenied` and fences;
  - `withoutConversation` (`talk-store.ts:312`) marks it erased, and `retired` (`:241`, applied at every change, `:172`) drops it from `reached`. So `src/features/conversations/list-data.ts` `shownList` (`:77`) no longer appends its row.
- **Focused regression** (`e2e/conversations-removal.spec.ts`):
  - `:408`: "its own read answers not found to a current member, the list's reads failing: it is gone at once, and the rest still show";
  - `:438`: "its own read refused (403), the list's reads failing: nothing shows, cached or not, until a list read since answers; then its thread only once read since".
- **Evidence:**
  - **Author:** CC-0073 terminal ([6102012973](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6102012973), cited in CX-0076) for `127b4334`; `d527`'s terminal.
  - **Independent:** CX-0065 and CX-0066 found and mounted the failure at `bfc2635c`. CX-0067: "P1 r4238633930 correction PASS bounded", a real API 422 twice, with the erased bodies, names, row and controls removed while the list reads still failed. CX-0076 at `127b4334`.
- **Still open:** none in source. **The thread has no author reply yet.**

## 8. r4238826987 (P2): advance the row's activity time after a confirmed send

- **Implemented in:** `e4c8cf8d` ("…a confirmed send moves its row's time", r4238826981 and r4238826987).
- **Where it is now:** `src/features/conversations/conversation-list.ts` `withLastMessage` (`:705`).
  - At `:719`, `lastAt` moves up to the confirmed message's time where that is later, never back.
  - The list read's own time is kept as `listAt`, for the withdrawal judgments (`:652`).
- **Focused regression:**
  - `e2e/conversations-last.spec.ts:54`: "a note sent moves its row to the top at once, saying when, even when the list can't be read again";
  - `src/features/conversations/conversation-list.test.ts:224`: "a confirmed message moves its row's last activity up, never back (PR #199 r4238826987)". Its cases include "later than the row…" and "an older receipt never moves it back…".
- **Evidence:**
  - **Author:** CC-0071 ([6101351449](https://github.com/davidelaverga/Sophia/issues/198#issuecomment-6101351449)); `d527`'s terminal.
  - **Independent:** CX-0072 identified it. CX-0073: "Confirmed human Send, list503/feed blocked … older C2 moves first and Last moved 21:31→21:32, PASS bounded". CX-0076 at `127b4334`: "Human Send/list outage PASS".
- **Still open:** none in source. **The thread has no author reply yet.**

## Not claimed

- No thread is resolved by this map.
- The independent CX passes are bounded to their exercised paths: L0 or L1, the fixture or local actual app. They are not G3 or G4 acceptance, and not an owner's acceptance.
- `d527`'s terminal is a focused browser gate, not the full Studio suite.
- Nothing hosted, provider, native or live was involved.
