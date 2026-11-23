// Home's guided first run (docs/plans/home-first-run.md): under the greeting, the first time, with no projects, one
// step at a time: the name (saved where «Your name» saves it), alone or with a team, and the first project (the
// existing create-project action). Each step is a region named by its title; as a step comes, its field takes the focus
// (its first choice on the second), as Work's New project does (focus-kept.md); Enter submits a step, Skip moves on, and Escape anywhere on Home ends it as «Not now» does. When it shows: useFirstRun.
// The rules and words: first-run.ts.
import type { Profile, ProfileUpdate, ProjectCreated } from '@sophia/contracts'
import { Button, Card, Field } from '@sophia/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ApiError, createProject } from '../../api/client.ts'
import { getMyProfile, updateMyProfile } from '../../api/profile.ts'
import { useAdmission, type AdmissionState } from '../../api/useAdmission.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { CONFLICT_UNREAD, conflictWords, nameProblem, saveWords } from '../../app/profile-view.ts'
import { modalOnScreen, onScreen } from '../../app/shortcuts.ts'
import { profileKey, useMyProfile } from '../../app/useMyProfile.ts'
import { useMounted } from '../../app/useMounted.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { NO_REPLY } from '../access/AdmissionNote.tsx'
import {
  afterSkip,
  afterStep,
  endsOnEscape,
  FIRST_RUN,
  firstSteps,
  namePrefill,
  savedFrom,
  stepAt,
  WAITING,
  type FirstStep,
  type ProfileFacts,
} from './first-run.ts'
import { useCapped } from './useCapped.ts'

export { useFirstRun } from './useFirstRun.ts'

/** The most characters a project's title holds, as Work's «Start a project» holds it. */
const TITLE_MOST = 180

interface Props {
  identity: Identity
  profile: ProfileFacts
  /** It ended without a project: Home as today. */
  onEnd: () => void
  /** The project was made: it opens, with «Invite people» when the person said they work with a team. */
  onCreated: (projectId: string, team: boolean) => void
  /** A project made after the first run ended (Escape, «Not now» while it was created): nobody is taken into it. */
  onAdded: (projectId: string) => void
}

type Heading = RefObject<HTMLHeadingElement | null>

/**
 * A step: a region named by its title. As it comes (not the first one shown), its field or first choice takes the
 * focus, and the region's name is read with it; the title is never a stop that looks like a field.
 */
function Step({ id, title, heading, children }: { id: string; title: string; heading: Heading; children: ReactNode }) {
  return (
    <section className="hw-first" aria-labelledby={id}>
      <h3 id={id} className="hw-first-title" ref={heading}>
        {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * A write that didn't go through, said under its field: a refusal in words, no reply in one line (the press itself
 * says Try again, with the same key), a wait that goes on.
 */
function Trouble<A, R>({ state, words }: { state: AdmissionState<A, R>; words: string | null }) {
  const slow = useSlow(state.status === 'sending')
  if (slow) return <p className="hw-first-note">{SLOW_NOTE}</p>
  if (state.status === 'unknown')
    return (
      <p className="hw-first-error" role="alert">
        {NO_REPLY}
      </p>
    )
  if (state.status !== 'rejected' || words === null) return null
  return (
    <p className="hw-first-error" role="alert">
      {words}
    </p>
  )
}

/** The press's words: its own, «Saving…» or «Creating…» while it waits, «Try again» after no reply. */
const pressWords = (status: AdmissionState<unknown, unknown>['status'], own: string, waiting: string) =>
  status === 'sending' ? waiting : status === 'unknown' ? WAITING.unknown : own

/** After a name changed elsewhere: the name kept now, read afresh (as «Your name» reads it), or that read failed. */
type Conflict = { words: string } | 'reading' | 'failed' | null

/**
 * Saves the name where «Your name» saves it: over the revision read, one key per edit. A name changed elsewhere is
 * read again and said as «Your name» says it; the typed name is kept, and the next Continue goes over the new revision.
 */
function useNameSave(identity: Identity, onSaved: () => void) {
  const client = useQueryClient()
  const { profile } = useMyProfile(identity)
  const [conflict, setConflict] = useState<Conflict>(null)
  const readFresh = async () => {
    setConflict('reading')
    try {
      const now = await getMyProfile(identity.token)
      client.setQueryData(profileKey(identity), now)
      setConflict({ words: conflictWords(now.displayName) })
    } catch {
      setConflict('failed')
    }
  }
  const save = useAdmission(async (key: string, body: ProfileUpdate): Promise<Profile> => {
    try {
      const kept = await updateMyProfile(identity.token, key, body)
      client.setQueryData(profileKey(identity), kept)
      // The members' lists name this person: read again where they are open.
      void client.invalidateQueries({ queryKey: ['members'] })
      onSaved()
      return kept
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'stale_revision') void readFresh()
      throw err
    }
  })
  return { profile, save, conflict, readFresh: () => void readFresh(), clear: () => setConflict(null) }
}

type NameSave = ReturnType<typeof useNameSave>

/** What a save that didn't keep the name says: a refusal in the profile's words; a conflict as «Your name» says it. */
function refusedWords(save: NameSave['save']): string | null {
  const { state } = save
  if (state.status !== 'rejected' || state.error.code === 'stale_revision') return null
  return saveWords(state.error, state.args.displayName)
}

function ConflictNote({ conflict, readFresh }: { conflict: Conflict; readFresh: () => void }) {
  if (conflict === null || conflict === 'reading') return null
  if (conflict === 'failed')
    return (
      <p className="hw-first-error" role="alert">
        {CONFLICT_UNREAD}{' '}
        <button type="button" className="text-button" onClick={readFresh}>
          {WAITING.unknown}
        </button>
      </p>
    )
  return (
    <p className="hw-first-note" role="status">
      {conflict.words}
    </p>
  )
}

function NameStep({
  identity,
  heading,
  onNext,
}: {
  identity: Identity
  heading: Heading
  onNext: (saved: boolean) => void
}) {
  const named = useNameSave(identity, () => onNext(true))
  const { profile, save, conflict } = named
  const [typed, setTyped] = useState(() => namePrefill(profile?.displayName ?? null, identity))
  const problem = nameProblem(typed)
  const { status } = save.state
  const waiting = status === 'sending' || conflict === 'reading'
  const send = () => {
    if (!profile || waiting || conflict === 'failed' || problem !== null || typed.trim() === '') return
    named.clear()
    void save.send({ displayName: typed.trim(), expectedRevision: profile.revision })
  }
  return (
    <Step id="hw-first-name" title={FIRST_RUN.name.title} heading={heading}>
      <label className="field-label" htmlFor="hw-first-name-field">
        {FIRST_RUN.name.field}
      </label>
      <Field
        as="form"
        size="lg"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input
          id="hw-first-name-field"
          value={typed}
          autoComplete="name"
          // After no reply the name waits as it was sent: Try again sends the same one, under the same key.
          readOnly={waiting || status === 'unknown'}
          aria-invalid={problem !== null || undefined}
          aria-describedby={problem ? 'hw-first-name-problem' : undefined}
          onChange={(e) => setTyped(e.target.value)}
        />
        <Button kind="primary" type="submit" size="lg" disabled={waiting || problem !== null || typed.trim() === ''}>
          {pressWords(status, FIRST_RUN.name.go, WAITING.name)}
        </Button>
      </Field>
      {/* Mounted all along, so a problem is said once as it comes, politely, not as an alert at every key. */}
      <p id="hw-first-name-problem" className="hw-first-error" aria-live="polite">
        {problem}
      </p>
      <Trouble state={save.state} words={refusedWords(save)} />
      <ConflictNote conflict={conflict} readFresh={named.readFresh} />
      <div className="hw-first-acts">
        <Button kind="ghost" disabled={waiting} onClick={() => onNext(false)}>
          {FIRST_RUN.skip}
        </Button>
      </div>
    </Step>
  )
}

function HowStep({ heading, onChoose }: { heading: Heading; onChoose: (team: boolean) => void }) {
  const { alone, team } = FIRST_RUN.how
  return (
    <Step id="hw-first-how" title={FIRST_RUN.how.title} heading={heading}>
      <div className="hw-first-choices">
        {[alone, team].map((choice, i) => (
          <Card key={choice.title} as="button" className="hw-first-choice" onClick={() => onChoose(i === 1)}>
            <span className="hw-first-choice-t">{choice.title}</span>
            <span className="hw-first-choice-m">{choice.note}</span>
          </Card>
        ))}
      </div>
      <div className="hw-first-acts">
        <Button kind="ghost" onClick={() => onChoose(afterSkip('how').team)}>
          {FIRST_RUN.skip}
        </Button>
      </div>
    </Step>
  )
}

interface ProjectProps {
  token: string
  heading: Heading
  onCreated: (projectId: string) => void
  onAdded: (projectId: string) => void
  onNotNow: () => void
}

/**
 * The first project, made by the existing create-project action. Made while the step is still on screen, it opens;
 * made after the first run ended (Escape, «Not now»), nobody is taken into it: the projects are read again
 * (WorkSpace's NewProject does the same).
 */
function ProjectStep({ token, heading, onCreated, onAdded, onNotNow }: ProjectProps) {
  const [title, setTitle] = useState('')
  const capping = useCapped(TITLE_MOST, title, setTitle)
  const admission = useAdmission<string, ProjectCreated>((key, t) => createProject(token, key, t))
  const open = useMounted()
  const { status } = admission.state
  const submit = async () => {
    if (status === 'sending' || !title.trim()) return
    const created = await admission.send(title.trim())
    if (!created) return
    if (open.current) onCreated(created.projectId)
    else onAdded(created.projectId)
  }
  const words = admission.state.status === 'rejected' ? admission.state.error.message : null
  return (
    <Step id="hw-first-project" title={FIRST_RUN.project.title} heading={heading}>
      <label className="field-label" htmlFor="hw-first-project-field">
        {FIRST_RUN.project.field}
      </label>
      <Field
        as="form"
        size="lg"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <input id="hw-first-project-field" value={title} readOnly={status === 'unknown'} {...capping} />
        <Button kind="primary" type="submit" size="lg" disabled={status === 'sending' || !title.trim()}>
          {pressWords(status, FIRST_RUN.project.go, WAITING.project)}
        </Button>
      </Field>
      <Trouble state={admission.state} words={words} />
      <div className="hw-first-acts">
        <Button kind="text" onClick={onNotNow}>
          {FIRST_RUN.project.notNow}
        </Button>
      </div>
    </Step>
  )
}

/** The first run's place under the greeting, held while it can't tell yet whether it shows: Home is never swapped. */
export function FirstRunHeld() {
  return <div className="hw-first-held" aria-busy="true" />
}

/**
 * The focus goes to each new step's field (its first choice on the second) as it comes, read with the step's region
 * name; the first step shown leaves the focus where Home put it.
 */
function useStepFocus(step: FirstStep) {
  const heading = useRef<HTMLHeadingElement>(null)
  const shown = useRef(step)
  useEffect(() => {
    if (step === shown.current) return
    shown.current = step
    const region = heading.current?.closest('section')
    region?.querySelector<HTMLElement>('input:not([readonly]), button:not(:disabled)')?.focus()
  }, [step])
  return heading
}

/**
 * Escape anywhere on Home ends the first run, as «Not now» does: not while an input method composes, nor over a
 * dialog or a menu (they keep their Escape), nor while Home is out of sight (another place is).
 */
function useEscapeEnds(root: RefObject<HTMLDivElement | null>, onEnd: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null
      const overlaid = modalOnScreen() || (t !== null && t.closest('[role="dialog"], [role="menu"]') !== null)
      if (!root.current || !onScreen(root.current) || !endsOnEscape(e, overlaid)) return
      e.preventDefault()
      onEnd()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [root, onEnd])
}

export function FirstRun({ identity, profile, onEnd, onCreated, onAdded }: Props) {
  const [at, setAt] = useState<FirstStep | null>(null)
  const [team, setTeam] = useState(false)
  const step = stepAt(firstSteps(profile), at)
  const heading = useStepFocus(step)
  const root = useRef<HTMLDivElement>(null)
  useEscapeEnds(root, onEnd)
  const next = () => setAt(afterStep(step) ?? step)
  return (
    <div className="hw-first-run" ref={root}>
      {step === 'name' && (
        // A save that lands moves on only from the name: a step reached meanwhile is never taken back.
        <NameStep identity={identity} heading={heading} onNext={(saved) => (saved ? setAt(savedFrom) : next())} />
      )}
      {step === 'how' && (
        <HowStep
          heading={heading}
          onChoose={(withTeam) => {
            setTeam(withTeam)
            next()
          }}
        />
      )}
      {step === 'project' && (
        <ProjectStep
          token={identity.token}
          heading={heading}
          onCreated={(projectId) => onCreated(projectId, team)}
          onAdded={onAdded}
          onNotNow={onEnd}
        />
      )}
    </div>
  )
}
