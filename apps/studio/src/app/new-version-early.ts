// The page's own ear for a new version (new-version-signal.ts): App's first import, before its eager imports, so no word
// of a part gone is missed. The room asks it too (stale-part-call.md); outside a browser, where the room's unit checks
// import its module, there is no page to hear and nothing to ask.
import { newVersionSignal } from './new-version-signal.ts'
import { browserPage, ownVersion, versionProbe } from './version-probe.ts'

const inBrowser = typeof window !== 'undefined'

export const newVersion = newVersionSignal(inBrowser ? window : new EventTarget())

// And the host's word: a build names its version in its page, and the tab asks for the one served now
// (version-probe.md). A page that names none (the dev server, the fixture pages but the app's) asks nothing.
const own = inBrowser ? ownVersion(document) : null
if (own) versionProbe(browserPage(window), own, newVersion.tell)
