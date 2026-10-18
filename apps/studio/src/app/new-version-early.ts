// The page's own ear for a new version (new-version-signal.ts): App's first import, before its eager imports, so no word
// of a part gone is missed.
import { newVersionSignal } from './new-version-signal.ts'

export const newVersion = newVersionSignal(window)
