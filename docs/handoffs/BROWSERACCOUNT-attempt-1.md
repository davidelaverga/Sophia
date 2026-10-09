# Implementation-session handoff

Goal and attempt: Codex P2 review finding on PR #189 — conversation query cache keys used `identity.name` (email) instead of `accountOf(identity)` (stable JWT token subject); attempt 1  
Human owner / executor resource: Davide / Claude Code (Opus 4.6) in the Claude desktop app  
Native session: Claude Code session `45fc1235-dd13-4fe3-aa85-82f8d1ad528a`  
Starting worktree/commit: branch `fix/studio-browser-account-stores` at `da769f3d` (tree `97c86d32`), which keyed per-browser stores by account but left conversation cache keys on email  
Ending commit/tree and changed files: `7aab85f0` (tree `ee84dc3c`); 8 files changed:
- `apps/studio/src/features/conversations/ConversationsView.tsx` — `listKey` and `messagesKey` calls switched to `accountOf(identity)`
- `apps/studio/src/features/conversations/OpenConversation.tsx` — transcript `messagesKey` switched to `accountOf(identity)`
- `apps/studio/src/features/conversations/ConversationComposer.tsx` — send receipt `messagesKey` switched to `accountOf(identity)`
- `apps/studio/src/features/conversations/ProjectContext.tsx` — context query key switched to `accountOf(identity)`
- `apps/studio/src/features/conversations/decide.ts` — decide/propose query keys switched to `accountOf(identity)`
- `apps/studio/src/features/conversations/NewConversation.tsx` — starters query key switched to `accountOf(identity)`
- `apps/studio/fixtures/app.tsx` — extended `work=lost` fixture with conversation API support (`conversations`, `missionPlus`), method-aware `hold(by, path, method?)` mechanism
- `apps/studio/e2e/app-auth.spec.ts` — two new browser regression tests (pending Start, pending Send) across `USER_UPDATED`

## Outcome

All six conversation cache-key call sites now use `accountOf(identity)` (stable JWT `sub` claim) instead of `identity.name` (email). The fix is additive on top of frozen `da769f3d`.

**Acceptance evidence:**
- `pnpm check` EXIT 0: 1987 unit tests pass / 70 skip; 86 integration tests pass / 2 skip.
- Actual Chromium: 15/15 `app-auth.spec.ts` tests pass on `7aab85f0`.
- Fail-before: the exact same 2 new tests fail on `da769f3d` at the precise assertions (missing accepted conversation row for Start; missing sent message text for Send). The 13 pre-existing tests pass on `da769f3d`.
- Root independently verified: `pnpm check` EXIT 0, Chromium 15/15, and the fail-before 13+2 pattern on `da769f3d`.

## Evidence

**Exercised behavior:**
1. **Pending Start across USER_UPDATED**: hold POST on `/api/v1/projects/${PROJECT}/conversations`, open new conversation form, uncheck Ask Sophia, fill question, press Start, verify POST reached in `asked` log, fire `USER_UPDATED` (same subject, new email), verify `signedInAs` shows new email, barrier on rendered list count=3, release POST, assert started conversation row visible by title text.
2. **Pending Send across USER_UPDATED**: open existing conversation, verify 6 messages visible, uncheck Ask Sophia, hold POST on send path, type message, press Enter, verify POST reached, fire `USER_UPDATED`, verify new email, barrier on rendered message count=6, release POST, assert sent message text visible via `.filter({ hasText })`.

**Method-aware hold**: `hold(by, path, 'POST')` blocks only POST requests — GET list reads on the same path are not blocked, preventing release from racing GET and POST.

**Ask Sophia disabled**: both tests explicitly uncheck Ask Sophia to prevent `answerLater` (900ms) from publishing feed and triggering a refetch that could mask the missing cache write.

**Deterministic barriers**: pre-release assertions on rendered list count=3 and transcript count=6 work on both versions — broken source finishes its new-key read; fixed source already has cached data.

**Review thread**: replied to Codex finding `r4230415498` on PR #189 with full evidence; original P2 resolved by root.

## Decisions and changes

- **Additive only**: no changes to `da769f3d`'s per-browser store keying; only conversation cache keys were fixed in `7aab85f0`.
- **No pagination change**: `ConversationComposer` invalidates the transcript query after `withMessage`; fixture refetches only newest `MESSAGE_PAGE=6`. The post-release assertion checks exact message text visibility, not count+1, avoiding an incidental count assertion that would break on legitimate settle-back.
- **`exactOptionalPropertyTypes` compliance**: hold type uses conditional assignment (`method ? { by, path, method, waiting: [] } : { by, path, waiting: [] }`) to avoid `{ method: undefined }`.
- **No runtime changes beyond cache keys**: `App.tsx` line 143 already uses `key={accountOf(state.identity)}` on the QueryClient — `SignedIn` is not re-mounted on `USER_UPDATED` for the same subject, so callbacks closing over old identity must write to subject-keyed cache (the fix) rather than email-keyed cache (the bug).

## Remaining obligations

- PR #189 CI: 10/12 checks green at time of handoff; full Chromium CI jobs were running.
- This handoff document is the P1 documentation finding from a fresh Codex review at `7aab85f0` (thread `PRRT_kwDOUqJnR86qzoTp`, `r4230850070`). Root to verify.
- No production deploy, no credentials used, no provider spend.

## Next bounded action

Root verifies this handoff record, resolves the P1 documentation finding on PR #189, and completes CI verification. No further source changes required for this PR unless CI surfaces a failure.
