// The Studio's release build names its commit, verified, and checks the page it built (Codex r4233230048;
// deploy/S1-05A-release.md, docs/plans/voice-qualification-g7.md "Deployed identities"). The rules, for
// scripts/release-build.mjs: the commit is the checkout's own HEAD with a clean tree, never a value someone typed that
// differs from it; and the built page must name exactly that commit, once, in its sophia-build tag (build-meta.ts). A
// build without it fails the check: a release never ships an unnamed or misnamed Studio.

const COMMIT = /^[0-9a-f]{40}$/

/** The checkout a release builds from: its HEAD, and whether anything in it differs from HEAD. */
export interface Checkout {
  head: string
  dirty: boolean
}

/**
 * The commit a release build names: the checkout's HEAD, 40 lowercase hex, from a clean tree. Every commit asked for
 * besides (`--commit`, or VITE_SOPHIA_COMMIT already in the environment) must be that same one. Throws why not.
 */
export function releaseCommit(checkout: Checkout, asked: ReadonlyArray<string | undefined>): string {
  const { head } = checkout
  if (!COMMIT.test(head)) throw new Error(`The checkout's HEAD is not a commit: ${JSON.stringify(head)}`)
  if (checkout.dirty) throw new Error(`The tree differs from ${head}: a release builds a clean checkout only`)
  for (const commit of asked) {
    if (commit !== undefined && commit !== head)
      throw new Error(`Asked to build ${JSON.stringify(commit)}, but the checkout is ${head}`)
  }
  return head
}

/** Every commit the page's sophia-build tags name, in order (none when it has no such tag). */
export function builtCommits(html: string): string[] {
  const tags = html.match(/<meta\b[^>]*\bname=["']sophia-build["'][^>]*>/gi) ?? []
  return tags.map((tag) => /\bcontent=["']([^"']*)["']/i.exec(tag)?.[1] ?? '')
}

/** Why the built page does not name exactly `commit`, once; null when it does. */
export function builtProblem(html: string, commit: string): string | null {
  const named = builtCommits(html)
  if (named.length === 0) return `The built page names no commit (no <meta name="sophia-build">); expected ${commit}`
  if (named.length > 1) return `The built page names ${String(named.length)} commits; expected ${commit} once`
  if (named[0] !== commit) return `The built page names ${JSON.stringify(named[0])}; expected ${commit}`
  return null
}
