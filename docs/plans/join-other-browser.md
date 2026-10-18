# A sign-in link opened in another browser, on the join page

> 2026-10-18 · costuras.md seam #3, 2026-10-18, Luis «¿cómo vamos con las mejoras de seam?»
> (`evaluacion-2026-10-18/experiencia/costuras.md`). Studio only; one line in place of the closed door.

## What was measured

- An invited member asks for the sign-in email on `/join` and opens its link in another browser (the phone's mail,
  its in-app browser). The link comes back to `/join?code=…`. That browser never asked for it, so it holds no PKCE
  verifier and supabase-js doesn't try the exchange (auth-js `_isPKCECallback`). `sessionAfterRedirect` (`auth.ts`)
  finds no session after a `?code=` return and sets `OTHER_BROWSER_NOTICE`; `addressAfter` drops the code.
- App hands that whole state to the join page (`opensJoinPage`, `App.tsx`), and JoinFlow reads only whether someone is
  signed in. The invitation's token is kept in the first browser alone (`sophia.join`, an hour), so this one has none
  and says «This door is closed» / «This link is incomplete. Ask for the whole link, or a new one.» with «Go to
  Sophia». The link was whole, and a new one fails the same way in this browser.
- The same return at `/app.html` shows the notice in the sign-in form: «That sign-in link was opened in a different
  browser than the one that asked for it. …» (role=alert). The join page never reads it.
- A reload is an ordinary visit: the code is gone from the address, so there is no notice and the closed door is back.

## What changes

- **`access-view.ts`:** `withoutToken(auth)`, the join page's heading and line where this device holds no invitation
  token. Signed in: as today («You’re signed in»). Signed out with `OTHER_BROWSER_NOTICE`: «You started in another
  browser» and «This sign-in link opened in a different browser from the one you started in. Type the email’s code
  there, or open your invitation link again here.» Anything else: the closed door, word for word as today.
- **`JoinFlow`:** `MissingToken` draws what `withoutToken` says, with «Go to Sophia» under it. A token kept in this
  browser never reaches it, so the invitation's own page is unchanged.
- **The heading.** Every heading on this page says where the person stands, none orders them: «This door is
  closed», «You’re signed in», «Not this time», «You left the lobby». «You started in another browser» is the plainest
  that does the same, without a word against the link. «Sign in where you started» would be the page's only order,
  and the line's second way (the invitation link again, here) would contradict it.
- **Once, quietly.** The line is said once per link opened: the code leaves the address, so a reload shows the
  ordinary page. It is the page's own body under its heading, as on each of this page's screens: no alert, and nothing
  takes the focus. It names no account; the device may be shared.

## Checks, written first

- **Unit** (`access-view.test.ts`): signed out back from another browser's link, the heading and the line, and no
  «This link is incomplete». Controls: signed out with no notice or another notice keeps the closed door word for word;
  signed in keeps «You’re signed in»; still finding out who is in keeps today's closed door.
- **Browser** (`app-auth.spec.ts`, on the app itself with the synthetic Auth service refusing every path):
  `/join?code=synthetic-code` shows the heading, the line and «Go to Sophia», no «This door is closed», no
  «This link is incomplete», no alert; the code has left the address, and nothing was exchanged. After a reload the
  line is gone and the closed door is back. Control: plain `/join` keeps today's heading and words.

## Limits

- While who is in is still being found out (a session kept in that browser, its refresh on its way), the page reads
  as signed out and shows the closed door until Auth answers, as main does before «You’re signed in». With no session
  kept, Auth answers from the browser's storage alone, without a request.
- A token kept in that browser (the invitation opened there in the last hour) shows the invitation and its own sign-in,
  as before. The notice isn't said there; the code sent from there works there.
- The cause is `auth.ts`'s own inference (a `?code=` return that signed nobody in); the join page trusts it as the
  sign-in page does.
- A guest's session left in that browser (a room's knock) counts as signed in: the return carries no notice and the
  page says «You’re signed in», as before. Noted, not changed here.
