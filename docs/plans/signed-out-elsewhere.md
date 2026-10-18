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

## What changes

- **The cause, in `auth.ts`:** a signed-out state can carry `ended`:
  - `elsewhere`: the listener heard a sign-out while an account (not a guest) was in and this tab's `leave` was not
    under way;
  - `away`: as the page loads, a session this device kept for an account (read before the client starts) is gone once
    the client checked it, and nobody is in; no notice of a link stands.
- **The clause, in `App.tsx`:** the clearing says whether unsent words went (`draftsOnlyOf` and `forgetViewerDrafts`
  return it), and the line waits for it: «Unsent words here were cleared.» follows only when this tab's clearing
  removed some.
- **The line, in `SignIn`:** in the lede's place under the title, above the providers and the email field, as
  `role=status` (never the form's `role=alert`, never focused); the lede comes back with any other sign-in:
  - «You were signed out in another tab or on another device, so this tab signed out too.»
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
  - The load lever: a kept session that expired an hour ago, whose refresh the synthetic Auth refuses (`400
    invalid_grant`), with a view's unsent words kept: the load line and the clause, the words gone; a reload says
    nothing.
  - Control: this tab's own Sign out from the account menu shows no line and the lede.

## Limits

- Another tab's Sign out forgets the device's drafts before this tab hears it, so the clause is then usually absent,
  though words written in this tab went with them. A project conversation's unsent words (`talk-store.ts`, this tab's
  memory) are not counted either. The clause errs towards silence: it never announces a loss that didn't happen here.
- An open tab hearing a refused refresh shares the listener with another tab's word; no e2e drives it (supabase-js's
  refresh ticks run every 30 s), the unit covers the decision.
- The join page (`/join`) has its own sign-in (`JoinFlow`) and says nothing new.
- Returning to the email field after «Use another email» shows the line again: it stays with the state, as a link's
  notice does.
