# Signed out from outside this tab, said once

> 2026-10-18 · costuras.md seam #2, 2026-10-18, Luis «¿cómo vamos con las mejoras de seam?». Studio only, no API.

## What was measured

- On main cd299dee2 (the report's run): after `anotherTab(context, null)` the sign-in reads «Sign in to Sophia» and
  «Where your team and Sophia think together.», with no `role=status` and no `role=alert`: the screen this tab's own
  Sign out leaves, and a first visit's. A reload shows the same.
- `auth.ts`'s listener turns every `SIGNED_OUT` into a plain signed-out state; `SignedOut` already carries a `notice`
  (a link's, or «Sign out of all devices» reaching only this one), which `SignIn` paints as `role=alert`.
- Where the word comes from (supabase-js 2.117.1, `_callRefreshToken` and the broadcast channel): another tab's Sign
  out, by `BroadcastChannel`; a refresh the Auth service refuses (every device signed out elsewhere), which removes the
  session once its access token has expired and tells the listeners, so an open tab hears it within the hour; and,
  as the page loads, a kept session whose access token expired and whose refresh is refused. A refresh that fails on
  the network keeps the session: nothing ended.
- This tab's own Sign out goes through App's `leaving()` and `useAuth`'s `leave`, whose `SIGNED_OUT` reaches the same
  listener before the call resolves: the two are told apart only by whether `leave` is under way.
- What is cleared: once nobody is in, App's effect forgets Personal's drafts (`draftsOnlyOf`) and the views' unsent
  words (`forgetViewerDrafts`); neither says whether it forgot anything. A Sign out forgets them before it signs out
  (`signOutForgetting`), so a tab that hears another tab's sign-out usually finds none left.
- **Review round (P2 on this branch): a refusal is not always a sign-out elsewhere.** supabase-js 2.117.1 removes the
  session for any refused refresh that is not a 5xx (`handleError`'s `NETWORK_ERROR_CODES`) once the access token has
  expired, and says only `SIGNED_OUT`, the word another tab's Sign out brings too. The local Auth service (gotrue
  v2.196.0) holds a code and a message for each refusal: `refresh_token_not_found` («Refresh Token Not Found») and
  `session_not_found` («No Valid Session Found») when the session is gone from it, which a sign-out of every device
  (or of the others) elsewhere does; `refresh_token_already_used`, `session_expired` (inactivity, a time box, a newer
  login), `user_banned` and the 429 `over_request_rate_limit` for causes that are no sign-out elsewhere. A raw request
  shows where the code is: `{"code": "…", "message": "…"}` with API 2024-01-01 (supabase-js asks for it),
  `{"code": 400, "error_code": "…", "msg": "…"}` without.
- Not every case the review listed happens: a «Sign out of all devices» whose answer was lost still removes this
  device's session as the call runs (`_signOut` removes it whatever the logout's answer), while `leave` is under way,
  so the sign-in shows «Sign out of all devices» reaching only this one, never this line. A `getUser()` answered
  `session_not_found` (the padlock's `unlockWays`) is a session gone from the Auth service, a sign-out elsewhere like
  `refresh_token_not_found`.

## What changes

- **The cause, in `auth.ts`:** a signed-out state can carry `ended`:
  - `elsewhere`: the listener heard a sign-out while an account (not a guest) was in and this tab's `leave` was not
    under way, and no refusal of this tab's refresh came before it (the word came from another tab), or the refusal
    said the session is gone from the Auth service (`refresh_token_not_found`, `session_not_found`);
  - `refused`: the same, after any other refusal of this tab's refresh (review round);
  - `away`: as the page loads, a session this device kept for an account (read before the client starts) is gone once
    the client checked it, and nobody is in; no notice of a link stands.
- **The refusal, in `refresh-refusal.ts`:** the app's Auth client fetches through a watch (`global.fetch`) that notes
  each 4xx answer to the refresh grant, its code read from a copy of the body before supabase-js gets the response, so
  the note is there before the client removes the session and says so. The listener takes the note with the next word
  it hears, whatever the word: a note never outlives the word that followed it (a refresh that went through, the first
  word of a load).
- **The clause, in `App.tsx`:** the clearing says whether unsent words went (`draftsOnlyOf` and `forgetViewerDrafts`
  return it), and the line waits for it: «Unsent words here were cleared.» follows only when this tab's clearing
  removed some.
- **The line, in `SignIn`:** in the lede's place under the title, above the providers and the email field, as
  `role=status` (never the form's `role=alert`, never focused); the lede comes back with any other sign-in:
  - «You were signed out in another tab or on another device, so this tab signed out too.»
  - «Your sign-in on this device ended, so this tab signed out.» (`refused`: true whatever the cause, and blames
    nobody)
  - «Your sign-in on this device ended while you were away.»
- **Once:** the line belongs to the state the sign-out left. A reload finds no session to hear of and none kept, so
  it says nothing; signing in ends the state; this tab's own Sign out never sets it. No storage is added for it.
- **Private:** no line names the account (the device may be shared).
- `kept-session.ts` takes the kept-session read out of `signed-in-load.ts`, so `auth.ts` reads it without importing
  the Studio's loader (an import cycle through `SignedIn.tsx`).

## Checks, written first

- `ended-notice.test.ts` (unit): the four lines (each cause, with and without the clause); nothing before the clearing
  answered, nothing without a cause; `elsewhere` only with an account in and no Sign out of this tab's under way;
  `away` only for a kept session gone after the check with nobody in, never for one still kept (a refresh that failed
  on the network) or none.
- `draft.test.ts`, `viewer-drafts.test.ts` (unit): each clearing says whether it forgot unsent words.
- `kept-session.test.ts` (unit): an account's kept session counts; a guest's, another key's or refused storage don't.
- `app-auth.spec.ts` (e2e), on the existing lever and one new one:
  - `signedInTab(DAVIDE)` → `anotherTab(context, null)`: the line as `role=status`, no `role=alert`, the email field
    keeps the focus, no lede; after `page.reload()` the line counts 0 and the lede is back.
  - The load lever: a kept session that expired an hour ago, whose refresh the synthetic Auth refuses (a 400; since the
    review round, with the real body and code), with a view's unsent words kept: the load line and the clause, the
    words gone; a reload says nothing.
  - Control: this tab's own Sign out from the account menu shows no line and the lede.
- Review round, written first:
  - `refresh-refusal.test.ts` (unit): a 4xx answer to the refresh grant is noted with its code (either body), before
    the response is handed on with its body unread; a 5xx, a refresh that went through, another request or a refusal
    of another grant is not; a note is taken once.
  - `ended-notice.test.ts` (unit): the `refused` line, with and without the clause; after a refusal of this tab's
    refresh, `elsewhere` only for the codes of a session gone from the Auth service, `refused` for any other.
  - `app-auth.spec.ts` (e2e), a lever for the open tab: signed in, the kept session is rewritten as supabase-js finds it
    an hour on (its access token expired) and the tab is shown again (`visibilitychange`), so the client refreshes at
    once. Refused as `refresh_token_already_used`: the `refused` line, never the `elsewhere` one; refused as
    `refresh_token_not_found` (every device signed out elsewhere): the `elsewhere` line. The synthetic Auth now refuses
    a refresh as the real one does (400, API 2024-01-01, a code), `refresh_token_not_found` unless a check sets another.

## Limits

- Another tab's Sign out forgets the device's drafts before this tab hears it, so the clause is then usually absent,
  though words written in this tab went with them. A project conversation's unsent words (`talk-store.ts`, this tab's
  memory) are not counted either. The clause errs towards silence: it never announces a loss that didn't happen here.
- Another tab's refused refresh reaches this tab as that tab's sign-out (the broadcast carries no cause): the line says
  another tab, which is where it happened, not why. That tab says why.
- A refusal noted while the access token still worked (supabase-js keeps the session then) waits for the next word; if
  that word is another tab's Sign out, the line is the plain `refused` one. It errs towards the line that blames
  nobody.
- An account removed in the Auth service takes its sessions with it, so its tabs read `refresh_token_not_found` and say
  `elsewhere`; the Studio removes no account (an administrator's act).
- The join page (`/join`) has its own sign-in (`JoinFlow`) and says nothing new.
- Returning to the email field after «Use another email» shows the line again: it stays with the state, as a link's
  notice does.
