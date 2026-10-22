// The page's own ear for a new version (new-version-signal.ts): App's first import, before its eager imports, so no word
// of a part gone is missed.
import { newVersionSignal } from './new-version-signal.ts'
import { browserPage, ownVersion, versionProbe } from './version-probe.ts'

export const newVersion = newVersionSignal(window)

// And the host's word: a build names its version in its page, and the tab asks for the one served now
// (version-probe.md). A page that names none (the dev server, the fixture pages but the app's) asks nothing.
const own = ownVersion(document)
if (own) versionProbe(browserPage(window), own, newVersion.tell)
