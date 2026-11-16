// The project's Resources from A51's catalog (INC01-DES-002, docs/plans/inc01-resources-service-adapter.md): read only,
// in the incumbent ResourcePanel. Its pages are read as a project member read (api/native-resources.ts) into one state
// (native-catalog.ts), fenced by its generation: an answer for an earlier read is never taken, and a final 401, 403 or
// 404 clears everything read at once. Nothing is cached or kept in this browser: a new account or project mounts it
// anew (SignedIn keys it), and only Try again reads again. It offers no act, effort, request or control: the catalog
// reports none of them.
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { ConfirmButton } from '@sophia/ui'
import { tokenSubject } from '../../app/auth-callback.ts'
import { canonicalId, listProjectNativeResources } from '../../api/native-resources.ts'
import { catalogReducer, initialCatalog, type CatalogState } from './native-catalog.ts'
import { CatalogScope, ResourcePanel } from './ResourcePanel.tsx'
import './resources.css'

interface Props {
  projectId: string
  /** Who reads: their token, renewed by the client as it is everywhere; its subject is who `isYou` names. */
  identity: { token: string }
  /** When the view was opened: its clock (the panel's) starts here. */
  now?: Date
  /**
   * The app's own sign-out of this device, as the project's expired notice offers it (SignedIn's, with its failure toast
   * and Try again): pressed after a final 401, the sign-in shows at this same address, whose link comes back to it
   * (UX04). Absent, a final 401 offers Try again.
   */
  onSignIn?: (() => void) | undefined
}

/**
 * What signing in again costs, said before it starts (REC01): the existing sign-out of this device (App's `leaving`)
 * ends the call with the signed-in Studio, and forgets everything unsent here, drafts and messages in projects and in
 * the personal space, even when the sign-out itself fails. Nothing here promises any of it is kept once confirmed.
 */
export const SIGN_IN_AGAIN_WARNING =
  'Signing in again signs out this device. It ends any call you’re in and removes everything unsent on this device: drafts and messages in your projects and your personal space.'

/** What the refused read says, by its status: the session ended, or this person can't read the project's resources. */
const REFUSED: Record<401 | 403 | 404, string> = {
  401: 'Your session has ended. Sign in again to read the resources.',
  403: 'This project’s resources can’t be read with your access.',
  404: 'This project’s resources can’t be read with your access.',
}

/**
 * A read that showed nothing, said in the panel's frame: why, and the explicit way on. A final 401 asks to sign in
 * again, so it offers that, where the app gives the way (UX04): pressed, it says first what signing out of this device
 * ends and removes, and only Sign out and continue starts it (REC01). Everything else reads again.
 */
function ReadNotice({
  state,
  onRetry,
  onSignIn,
}: {
  state: CatalogState
  onRetry: () => void
  onSignIn: (() => void) | undefined
}) {
  const signIn = state.status === 'refused' && state.refusal === 401 && onSignIn !== undefined
  const said =
    state.status === 'refused' && state.refusal
      ? REFUSED[state.refusal]
      : state.status === 'unavailable'
        ? 'Resources can’t be read here right now.'
        : 'Couldn’t read the resources.'
  return (
    <section className="resources" aria-labelledby="resources-title">
      <header className="view-head">
        <h2 id="resources-title">Resources</h2>
        <span className="count">–</span>
      </header>
      <CatalogScope />
      <div className="resources-read" role="status" data-read={state.status}>
        <p>{said}</p>
        {signIn ? (
          // Asked first, in place: Stay here takes the focus, so a second Enter never confirms; only Sign out and
          // continue calls the app's sign-out, once (REC01).
          <ConfirmButton
            label="Sign in again"
            className="text-button"
            warning={SIGN_IN_AGAIN_WARNING}
            keep="Stay here"
            confirm="Sign out and continue"
            onConfirm={onSignIn}
          />
        ) : (
          <button type="button" className="text-button" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * The read: one request at a time, each with its generation and its own abort. The first page belongs to its effect,
 * aborted when the read it began for is over (a page came, a refusal, a new read, the view left); a More read is aborted
 * with every other on a refusal, a new read or leaving. What any of them answers after that belongs to an older
 * generation and is not taken.
 */
function useCatalog(projectId: string, token: string, subject: string | null) {
  const [state, dispatch] = useReducer(catalogReducer, undefined, () => initialCatalog())
  const pending = useRef(new Set<AbortController>())
  const abortAll = useCallback(() => {
    for (const c of pending.current) c.abort()
    pending.current.clear()
  }, [])
  const read = useCallback(
    (gen: number, after: string | null): AbortController | null => {
      if (subject === null) {
        dispatch({ type: 'failed', gen, error: new Error('no subject in the token') })
        return null
      }
      const control = new AbortController()
      pending.current.add(control)
      listProjectNativeResources(token, projectId, subject, after, control.signal)
        .then((page) => dispatch({ type: 'page', gen, after, page }))
        .catch((error: unknown) => {
          if (!control.signal.aborted) dispatch({ type: 'failed', gen, error })
        })
        .finally(() => pending.current.delete(control))
      return control
    },
    [projectId, token, subject],
  )
  const loading = state.status === 'loading'
  useEffect(() => {
    if (!loading) return undefined
    const control = read(state.gen, null)
    return () => control?.abort()
  }, [loading, state.gen, read])
  // Refused: whatever is still under way is stopped, its answer refused anyway by the generation.
  useEffect(() => {
    if (state.status === 'refused') abortAll()
  }, [state.status, abortAll])
  useEffect(() => abortAll, [abortAll])
  const more = () => {
    if (state.status !== 'more' || state.reading || state.next === null) return
    dispatch({ type: 'more', gen: state.gen })
    read(state.gen, state.next)
  }
  const retry = () => {
    abortAll()
    dispatch({ type: 'read' })
  }
  return { state, more, retry }
}

export function ProjectResources({ projectId, identity, now, onSignIn }: Props) {
  const raw = tokenSubject(identity.token)
  const subject = raw ? canonicalId(raw) : null
  const { state, more, retry } = useCatalog(projectId, identity.token, subject)
  // The view's clock starts when it opens, not with every page.
  const opened = useRef(now ?? new Date())
  if (state.status === 'failed' || state.status === 'unavailable' || state.status === 'refused') {
    return <ReadNotice state={state} onRetry={retry} onSignIn={onSignIn} />
  }
  const loading = state.status === 'loading'
  return (
    <ResourcePanel
      resources={loading ? [] : state.rows}
      observations={[]}
      actions={null}
      viewerId={subject ?? ''}
      now={opened.current}
      loading={loading}
      scope={`catalog.${projectId}`}
      // Passed from the first render, so nothing of the viewer's is read from this browser even while loading.
      catalog={{
        status: state.status === 'more' ? 'more' : state.status === 'partial' ? 'partial' : 'complete',
        reading: state.reading,
        partial: state.partial,
        lastObservedAt: state.lastObservedAt,
        onMore: more,
        onRetry: retry,
      }}
    />
  )
}
