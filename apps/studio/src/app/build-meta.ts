// The Studio's build identity (docs/plans/voice-qualification-g7.md, "Deployed identities"): a build that names its
// commit in VITE_SOPHIA_COMMIT (40 lowercase hex, as the API's RENDER_GIT_COMMIT) carries it on its page as
// `<meta name="sophia-build" content="<commit>">`, so a probe can say which Studio it reached. Any other value, or none,
// leaves no tag at all: a missing identity is typed unavailable by whoever reads it, never guessed. Build tooling for
// vite.config.ts only; nothing in the app reads it.
import type { HtmlTagDescriptor, Plugin } from 'vite'

const COMMIT = /^[0-9a-f]{40}$/

/** The page's tag for this commit; none for anything that is not one. */
export const buildMeta = (commit: unknown): HtmlTagDescriptor[] =>
  typeof commit === 'string' && COMMIT.test(commit)
    ? [{ tag: 'meta', attrs: { name: 'sophia-build', content: commit }, injectTo: 'head' }]
    : []

/** The commit as Vite loads the build's environment (its VITE_ variables and .env files), on the page it builds. */
export function buildIdentity(): Plugin {
  let commit: unknown
  return {
    name: 'sophia-build-identity',
    configResolved: (config) => {
      commit = config.env.VITE_SOPHIA_COMMIT
    },
    transformIndexHtml: () => buildMeta(commit),
  }
}
