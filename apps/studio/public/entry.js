// The opening (docs/plans/entry-opening.md) plays once: on the way in, from signing in to the app. A sign-in's return
// (the email's link or a provider: ?code=, as src/app/auth-callback.ts reads it) marks the page before its first paint,
// so the opening is there from the first frame. A plain script of the page's own origin (the CSP admits no inline one),
// read before the body is drawn. Every other load shows only Sophia's void until its screen is ready.
if (new URLSearchParams(location.search).has('code') && !location.pathname.startsWith('/join')) {
  document.documentElement.dataset.entering = ''
}
// The theme chosen on this browser (src/app/theme.ts keeps it as `sophia.theme`), on the root before the first paint,
// so a light page never flashes the void; «system» asks the system. The app's own boot then agrees with it.
try {
  const theme = localStorage.getItem('sophia.theme')
  // Only a value the app reads: anything else is no choice, the room, as theme.ts's own reading says (Codex on #249).
  const chosen = theme === 'light' || theme === 'dark' || theme === 'system'
  const light = theme === 'light' || (theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches)
  if (light) {
    document.documentElement.dataset.theme = 'light'
    // The browser's chrome with it, from the first paint (theme.ts keeps it after).
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#fbf8f3')
  }
  // The tab's mark in the appearance shown, a choice made against the system included (theme.ts keeps it after). No
  // choice is the room, so its mark too, whatever the system: the boot would switch to it anyway (Codex P2 on #249).
  document
    .querySelector('link[rel="icon"][type="image/svg+xml"]')
    ?.setAttribute('href', chosen && light ? '/favicon-light.svg' : '/favicon-dark.svg')
} catch {
  // Storage refused (a private window): the room, as the app's boot will say.
}
