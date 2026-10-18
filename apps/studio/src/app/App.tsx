import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useState, type ComponentProps } from 'react'
import { draftsOnlyOf, forgetDrafts } from '../features/personal/draft.ts'
import { cacheFor, cacheOf } from './account-cache.ts'
import { accountOf } from './auth-callback.ts'
import { forgetKept } from '../features/conversations/talk-store.ts'
import { forgetProposals, proposalsKeptFor, proposalsOnlyOf } from '../features/work/planning/review-proposal.ts'
import { setSignedIn } from './signed-in.ts'
import { useAuth, type AuthState } from './auth.ts'
import type { Identity } from './dev-identity.ts'
import { forgetRecent, recentFor } from './palette-recent.ts'
import { forgetPendingUnlock } from './provider-leave.ts'
import { opensJoinPage } from './route.ts'
import { legalDoc } from './legal.ts'
import { forgetViewerDrafts } from '../features/studio/viewer-state.ts'
import { LegalPage } from './Legal.tsx'
import { signOutForgetting } from './sign-out.ts'
import { Centered, LinkOffer, SignIn } from './SignIn.tsx'
import { useOpening } from './useOpening.ts'
import { useProjectRoute } from './useProjectRoute.ts'
import { LoadFailed } from './LoadFailed.tsx'
import { NewVersion } from './NewVersion.tsx'
import { loadSignedIn, warmSignedIn } from './signed-in-load.ts'

// Invitation links are a separate door: their page loads only when someone opens one.
const JoinFlow = lazy(() => import('../features/access/JoinFlow.tsx').then((m) => ({ default: m.JoinFlow })))
// The signed-in Studio is its own chunk (docs/plans/signed-in-later.md): a sign-in page never downloads it.
const Studio = lazy(() => loadSignedIn().then((m) => ({ default: m.Studio })))

/** Whose draft the device keeps: the account signed in's; nobody's once signed out; not decided while loading. */
function draftsKeptFor(state: AuthState): string | null | undefined {
  if (state.status === 'signed_in') return accountOf(state.identity)
  return state.status === 'signed_out' ? null : undefined
}

/**
 * The device keeps only the draft of the account signed in: once the app knows who that is, anyone else's goes, and
 * all go once it knows nobody is (signed out here or in another tab, a session that ended, also while the page was
 * closed, a provider's return refused). While it is still finding out, nothing goes.
 */
function useDraftsOnlyOfWhoIsIn(state: AuthState) {
  const who = draftsKeptFor(state)
  useEffect(() => {
    if (who !== undefined) draftsOnlyOf(who)
    // Signed out, here or in another tab: the views' unsent words go too (Codex P1 on #366).
    if (who === null) forgetViewerDrafts()
  }, [who])
}

/**
 * The device keeps only the unanswered review proposals of the viewer signed in (review-proposal.ts): once the app knows
 * who that is, anyone else's go, and all go once it knows nobody is; while it is still finding out, as every page load
 * starts, none go. Decided as who is in changes, never in an effect's cleanup, which also runs as a load signs in.
 */
/**
 * «Recent» is one person's: kept with whose it is, it is forgotten whenever another account is signed in, however the
 * last one left (this tab, another tab, a session that expired while the Studio was closed; Codex on #283).
 */
function useRecentOnlyOf(signedInAs: string | null) {
  useEffect(() => {
    if (signedInAs !== null) recentFor(signedInAs)
  }, [signedInAs])
}

function useProposalsOnlyOfWhoIsIn(state: AuthState) {
  const who = proposalsKeptFor(state)
  useEffect(() => proposalsOnlyOf(who), [who])
}

/**
 * What a person had under way on this device: a project's conversations (talk-store.ts), unanswered proposals, and the
 * palette's «Recent» (palette-recent.ts).
 */
function forgetUnderWay() {
  forgetKept()
  forgetProposals()
  forgetRecent()
}

/**
 * Cached server state belongs to one account (accountOf: its token's subject, which an email change keeps). Another
 * account, even at the same address (Codex's review of 1581b4f0), has its own cache from its first render
 * (account-cache.ts): set while rendering, as React has state follow a value, so the render that saw the change is not
 * committed and the next is already on the new cache. Nothing is cleared while rendering: the last account's cache goes
 * once it has been replaced, also when another tab signs in or out, and with it what was under way in a project's
 * conversations.
 */
function useAccountCache(signedInAs: string | null) {
  const [cache, setCache] = useState(() => cacheOf(signedInAs))
  const current = cacheFor(cache, signedInAs)
  if (current !== cache) setCache(current)
  const { client } = current
  useEffect(
    () => () => {
      client.clear()
      forgetKept()
    },
    [client],
  )
  return client
}

/**
 * The signed-in Studio's chunk, fetched ahead (signed-in-load.ts) so it is here by the time the person is in: as the
 * page loads when a session is likely (one kept, a sign-in's return), so it goes with the session's check, never after
 * it; a link offered; or on the sign-in page once they start (a key, a press, caught before any field keeps it); never
 * at rest. On a room's door, for a member, whom the door hands to the Studio (and, as the page loads, for an account's
 * session kept there); never for a guest.
 */
function useSignedInAhead(state: AuthState, door: boolean) {
  const { status } = state
  const member = status === 'signed_in' && state.identity.role !== 'guest'
  useEffect(() => {
    if (door) {
      if (member) warmSignedIn()
      return undefined
    }
    // While who is in is found out, a likely session's chunk is already on its way (signed-in-load.ts, as it loads).
    if (status === 'loading' || status === 'signed_in') return undefined
    if (status === 'link_offer') {
      warmSignedIn()
      return undefined
    }
    const start = () => warmSignedIn()
    window.addEventListener('keydown', start, { once: true, capture: true })
    window.addEventListener('pointerdown', start, { once: true, capture: true })
    return () => {
      window.removeEventListener('keydown', start, { capture: true })
      window.removeEventListener('pointerdown', start, { capture: true })
    }
  }, [status, member, door])
}

/**
 * The pages that are their own: the join page, and the terms and the privacy notice, which anyone reads, signed in or
 * not (terms-privacy.md). None prepares the Studio.
 */
function useOwnPage(state: AuthState) {
  const joinPage = opensJoinPage(window.location.pathname, state.status)
  const legal = legalDoc(window.location.pathname)
  const ownPage = joinPage || legal !== null
  useSignedInAhead(state, ownPage)
  // The opening hands off once all is ready: the Studio's once it has prepared what the person opens first.
  useOpening(state.status, state.status === 'signed_in' && state.identity.role !== 'guest' && !ownPage)
  return { joinPage, legal }
}

/** Every unsent word this device keeps: Personal's, and each project view's (terms-privacy.md). */
const forgetAllDrafts = () => {
  forgetDrafts()
  forgetViewerDrafts()
}

/**
 * Signing out leaves nothing personal on this device: the cache, every message being written to Sophia, what was under
 * way in a project's conversations (talk-store.ts) and any review proposal still unanswered. `end` is this device's
 * sign-out or every device's (sign-out-scope.md); what stays here goes either way. One callback each, never a
 * parameter: the join page hands Sign out straight to a button, whose click would read as «everywhere».
 */
const leaving =
  (queryClient: ReturnType<typeof useAccountCache>, signedInAs: string | null) =>
  (end: () => Promise<void>) =>
  async (): Promise<boolean> => {
    setSignedIn(null)
    queryClient.clear()
    forgetUnderWay()
    forgetPendingUnlock()
    // A sign-out that fails leaves the person in: their writes are theirs again, and SignedIn says so (false).
    try {
      await signOutForgetting(end, forgetAllDrafts)
      return true
    } catch {
      setSignedIn(signedInAs)
      return false
    }
  }

/** An invitation's page, which handles its own sign-in (JoinFlow), with the app's reads and its failure guard. */
function JoinPage(props: {
  queryClient: ReturnType<typeof useAccountCache>
  join: Omit<ComponentProps<typeof JoinFlow>, 'onSignOut'>
  onSignOut: () => void
}) {
  return (
    <QueryClientProvider client={props.queryClient}>
      <LoadFailed>
        <Suspense fallback={<Centered title="Opening the room…" busy />}>
          <JoinFlow {...props.join} onSignOut={props.onSignOut} />
        </Suspense>
      </LoadFailed>
    </QueryClientProvider>
  )
}

function AppBody() {
  const { state, chooseDev, signOut, signOutEverywhere, acceptLink, declineLink } = useAuth()
  const routing = useProjectRoute()
  const signedInAs = state.status === 'signed_in' ? accountOf(state.identity) : null
  const queryClient = useAccountCache(signedInAs)
  useRecentOnlyOf(signedInAs)
  useProposalsOnlyOfWhoIsIn(state)
  // Who is in, for writes that outlive their part (signed-in.ts): set as it changes, cleared at once on leaving.
  useEffect(() => setSignedIn(signedInAs), [signedInAs])
  useDraftsOnlyOfWhoIsIn(state)
  const { joinPage, legal } = useOwnPage(state)

  // Cached server state belongs to one identity; drop it whenever the identity changes.
  const switchIdentity = (identity: Identity | null) => {
    setSignedIn(null)
    queryClient.clear()
    forgetUnderWay()
    chooseDev(identity)
    // The same identity again is no change App's effect would see: it is in, as it was.
    setSignedIn(identity ? accountOf(identity) : null)
  }
  const leave = leaving(queryClient, signedInAs)
  const leaveSession = leave(signOut)
  const leaveEverywhere = leave(signOutEverywhere)

  if (legal) return <LegalPage doc={legal} />
  // An invitation link works before, during and after sign-in: it handles its own. A sign-in link's question
  // ("Continue as …?") still comes first there, so the session it carries is accepted or declined, never lost.
  if (joinPage) {
    const join = { auth: state, onChooseDev: switchIdentity, onOpenProject: routing.open }
    return <JoinPage queryClient={queryClient} join={join} onSignOut={() => void leaveSession()} />
  }
  if (state.status === 'loading') return <Centered title="Sophia" busy />
  if (state.status === 'link_offer') {
    return <LinkOffer account={state.account} slow={state.slow} onAccept={acceptLink} onDecline={declineLink} />
  }
  if (state.status === 'signed_out') return <SignIn onChooseDev={switchIdentity} notice={state.notice} />
  // A guest's session left over from a room's door is no account: the Studio asks them to sign in.
  if (state.identity.role === 'guest') return <SignIn onChooseDev={switchIdentity} />

  return (
    <QueryClientProvider client={queryClient}>
      {/* Its chunk on its way, the session's face stays: the opening hands off once Home is mounted (Studio). */}
      <LoadFailed>
        <Suspense fallback={<Centered title="Sophia" busy />}>
          <Studio
            identity={state.identity}
            notice={state.notice}
            routing={routing}
            onChooseDev={switchIdentity}
            onSignOut={leaveSession}
            onSignOutEverywhere={leaveEverywhere}
          />
        </Suspense>
      </LoadFailed>
    </QueryClientProvider>
  )
}

/** The Studio, and over whatever it shows, a new version said (new-version.md). */
export function App() {
  return (
    <>
      <AppBody />
      <NewVersion />
    </>
  )
}
