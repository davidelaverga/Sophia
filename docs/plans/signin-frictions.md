# Sign-in: the frictions out (the "$20" pass, slice 1)

> 2026-10-04 · Luis · design note · from the sign-in's "is this worth $20?" critique, which Luis approved ("Procede")

The critique found a sign-in that works and tells the truth, but makes a person do small things it could do for them. This slice takes those out. The threshold moment (Umbral in motion on the sign-in) is slice 2, with its own note.

## What changes

- **Ready on arrival, with a pointer:**
  - the address field takes the focus on arrival, and again when "Use another email" brings it back;
  - once the email has gone, the code field takes the focus;
  - after a service error, the focus goes back to the address.

  On touch nothing takes the focus, so no keyboard covers the page, nor "Open Gmail" and Send again.
- **The page's own words, not the browser's bubble.** The form checks an address itself (`noValidate`): a name, an @, and a domain with a dot. If it can't be one, the page says "Check the address: it needs a name, an @ and a domain." The field is marked (`aria-invalid`, a rose border) and nothing is sent. Typing clears the mark.
- **Your inbox, one press away.** For a known domain (Gmail, Outlook, iCloud, Yahoo and Proton), "Check your email" offers "Open Gmail" (and the like), in a new tab. Any other domain gets nothing, never a guess.
- **Send again, once 60 s have passed.** 60 s is hosted Supabase Auth's own window per address. The button counts down ("Send again in 54 s"), sends once (a second press while it goes sends nothing), says "Sent again. Only the newest link and code work.", and waits again. It keeps the focus while it waits (`aria-disabled`).
  - Asked too soon anyway, Auth's refusal gives the seconds left, and the countdown takes them.
  - The countdown is read from when it may be asked again, not by subtracting ticks, so a throttled background tab still shows the truth.
- **No dead tile.** The greyed "coming soon" provider is gone: a provider shows once it works, not before. `VITE_AUTH_PROVIDERS_SOON` is removed.
- **Three sizes.** A quiet screen (sign-in, the link offer, invitations, the guest room) speaks in its title (26, or 22 on a phone), its text at 14 (words, fields and buttons alike), and a label (10.5).
  - The rule uses `:where()`, so it adds no weight: a label's own size, such as the invitation's mono session line, still wins.

## Ports

`EmailSignIn` takes `send` and `verify`, which default to Supabase Auth's (`sendMagicLink`, `verifyEmailCode`). That lets a fixture page (`fixtures/signin.html`) run the real screen without an Auth service.
