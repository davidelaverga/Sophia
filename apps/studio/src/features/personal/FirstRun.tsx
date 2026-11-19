// Home's guided first run (docs/plans/home-first-run.md): under the greeting, the first time, with no projects, one
// step at a time: the name (saved where «Your name» saves it), alone or with a team, and the first project (the
// existing create-project action). Each step is a region named by its title, which takes the focus as the step comes;
// Enter submits a step, Skip moves on, and Escape anywhere ends it as «Not now» does. The rules and words: first-run.ts.
import type { Profile, ProfileUpdate, ProjectCreated } from '@sophia/contracts'
import { Button, Card, Field } from '@sophia/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { ApiError, createProject } from '../../api/client.ts'
import { updateMyProfile } from '../../api/profile.ts'
import { useAdmission, type AdmissionState } from '../../api/useAdmission.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { nameProblem, saveWords } from '../../app/profile-view.ts'
import { profileKey, useMyProfile } from '../../app/useMyProfile.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { AdmissionNote } from '../access/AdmissionNote.tsx'
import { useArchivedRead } from '../studio/Archive.tsx'
import {
  afterSkip,
  afterStep,
  browserStore,
  FIRST_RUN,
  firstRunShows,
  firstSteps,
  namePrefill,
  profileFacts,
  readFirstRunDone,
  rememberFirstRunDone,
  stepAt,
  WAITING,
  type FirstStep,
  type ProfileFacts,
} from './first-run.ts'
import { useCapped } from './useCapped.ts'

/** The most characters a project's title holds, as Work's «Start a project» holds it. */
const TITLE_MOST = 180

/**
 * Whether Home shows its first run, and how it ends: read from the projects, the archived ones (asked only while none is
 * active), the profile, and this browser's memory of an end. `enabled` false: never (a fixture's Home as it is today).
 */
export function useFirstRun(identity: Identity, projects: readonly unknown[] | undefined, enabled = true) {
  const account = accountOf(identity)
  const [done, setDone] = useState(() => !enabled || readFirstRunDone(browserStore(), account))
  const none = enabled && !done && projects?.length === 0
  const archived = useArchivedRead(identity, none)
  const { profile, trouble } = useMyProfile(identity, none)
  const facts = profileFacts(profile, trouble)
  return {
    shows: firstRunShows({ done, projects, archived: archived.data?.projects, profile: facts }),
    profile: facts,
    /** It ended (finished, «Not now», Escape): remembered on this browser, and Home is as it is today. */
    end: () => {
      rememberFirstRunDone(browserStore(), account)
      setDone(true)
    },
  }
}

interface Props {
  identity: Identity
  profile: ProfileFacts
  /** It ended without a project: Home as today. */
  onEnd: () => void
  /** The project was made: it opens, with «Invite people» when the person said they work with a team. */
  onCreated: (projectId: string, team: boolean) => void
}

/** A step: a region named by its title, which takes the focus as the step comes (not on the first one shown). */
function Step({
  id,
  title,
  heading,
  children,
}: {
  id: string
  title: string
  heading: RefObject<HTMLHeadingElement | null>
  children: ReactNode
}) {
  return (
    <section className="hw-first" aria-labelledby={id}>
      <h3 id={id} className="hw-first-title" tabIndex={-1} ref={heading}>
        {title}
      </h3>
      {children}
    </section>
  )
}

/** A save or a creation that didn't go through, said under its field; a wait that goes on, said too. */
function Trouble<A, R>({ state, words, retry }: { state: AdmissionState<A, R>; words?: string; retry: () => void }) {
  const slow = useSlow(state.status === 'sending')
  if (slow) return <p className="hw-first-note">{SLOW_NOTE}</p>
  if (state.status === 'rejected' && words) return <p role="alert">{words}</p>
  if (state.status !== 'rejected' && state.status !== 'unknown') return null
  return (
    <p role="alert">
      <AdmissionNote state={state} onRetry={retry} />
    </p>
  )
}

/** The press's words: its own, «Saving…» or «Creating…» while it waits, «Try again» after no reply. */
const pressWords = (status: AdmissionState<unknown, unknown>['status'], own: string, waiting: string) =>
  status === 'sending' ? waiting : status === 'unknown' ? WAITING.unknown : own

/** Saves the name where «Your name» saves it: over the revision read, one key per edit. */
function useNameSave(identity: Identity, onSaved: () => void) {
  const client = useQueryClient()
  const { profile, reread } = useMyProfile(identity)
  const save = useAdmission(async (key: string, body: ProfileUpdate): Promise<Profile> => {
    try {
      const kept = await updateMyProfile(identity.token, key, body)
      client.setQueryData(profileKey(identity), kept)
      // The members' lists name this person: read again where they are open.
      void client.invalidateQueries({ queryKey: ['members'] })
      onSaved()
      return kept
    } catch (err: unknown) {
      // Changed elsewhere since the read: read it again, so the next Continue goes over the revision now kept.
      if (err instanceof ApiError && err.code === 'stale_revision') void reread()
      throw err
    }
  })
  return { profile, save }
}

function NameStep({
  identity,
  heading,
  onNext,
}: {
  identity: Identity
  heading: RefObject<HTMLHeadingElement | null>
  onNext: () => void
}) {
  const { profile, save } = useNameSave(identity, onNext)
  const [typed, setTyped] = useState(() => namePrefill(profile?.displayName ?? null, identity))
  const problem = nameProblem(typed)
  const { status } = save.state
  const waiting = status === 'sending'
  const send = () => {
    if (!profile || waiting || problem !== null || typed.trim() === '') return
    void save.send({ displayName: typed.trim(), expectedRevision: profile.revision })
  }
  const refused =
    save.state.status === 'rejected' && save.state.error.code !== 'stale_revision'
      ? saveWords(save.state.error, save.state.args.displayName)
      : undefined
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
          readOnly={waiting}
          aria-invalid={problem !== null || undefined}
          onChange={(e) => setTyped(e.target.value)}
        />
        <Button kind="primary" type="submit" size="lg" disabled={waiting || problem !== null || typed.trim() === ''}>
          {pressWords(status, FIRST_RUN.name.go, WAITING.name)}
        </Button>
      </Field>
      {problem && <p role="alert">{problem}</p>}
      <Trouble state={save.state} {...(refused !== undefined && { words: refused })} retry={() => void save.retry()} />
      <div className="hw-first-acts">
        <Button kind="ghost" onClick={onNext}>
          {FIRST_RUN.skip}
        </Button>
      </div>
    </Step>
  )
}

function HowStep({
  heading,
  onChoose,
}: {
  heading: RefObject<HTMLHeadingElement | null>
  onChoose: (team: boolean) => void
}) {
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

function ProjectStep({
  token,
  heading,
  onCreated,
  onNotNow,
}: {
  token: string
  heading: RefObject<HTMLHeadingElement | null>
  onCreated: (projectId: string) => void
  onNotNow: () => void
}) {
  const [title, setTitle] = useState('')
  const capping = useCapped(TITLE_MOST, title, setTitle)
  const admission = useAdmission<string, ProjectCreated>((key, t) => createProject(token, key, t))
  const { status } = admission.state
  const submit = async () => {
    if (status === 'sending' || !title.trim()) return
    const created = await admission.send(title.trim())
    if (created) onCreated(created.projectId)
  }
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
      <Trouble state={admission.state} retry={() => void submit()} />
      <div className="hw-first-acts">
        <Button kind="text" onClick={onNotNow}>
          {FIRST_RUN.project.notNow}
        </Button>
      </div>
    </Step>
  )
}

/** The focus goes to each new step's title as it comes; the first step shown leaves the focus where Home put it. */
function useTitleFocus(step: FirstStep) {
  const heading = useRef<HTMLHeadingElement>(null)
  const shown = useRef(step)
  useEffect(() => {
    if (step === shown.current) return
    shown.current = step
    heading.current?.focus()
  }, [step])
  return heading
}

export function FirstRun({ identity, profile, onEnd, onCreated }: Props) {
  const [at, setAt] = useState<FirstStep | null>(null)
  const [team, setTeam] = useState(false)
  const step = stepAt(firstSteps(profile), at)
  const heading = useTitleFocus(step)
  const next = () => setAt(afterStep(step) ?? step)
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    e.preventDefault()
    onEnd()
  }
  return (
    <div className="hw-first-run" onKeyDown={onKey}>
      {step === 'name' && <NameStep identity={identity} heading={heading} onNext={next} />}
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
          onNotNow={onEnd}
        />
      )}
    </div>
  )
}
