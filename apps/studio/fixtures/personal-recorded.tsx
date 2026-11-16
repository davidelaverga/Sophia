// Personal with messages kept without asking Sophia (A52: a person turn with reply `recorded`), for
// e2e/personal-recorded.spec.ts: the Studio's own PersonalSpace over a labelled synthetic space that comes as the API
// sends it (JSON) and is read by the canonical generated parser (parsePersonalSpace), as the Studio reads it. Nothing
// here sends: no composer or way to start produces a held input. Every write the page is asked for is listed in
// `window.recordedFixture.writes` (none is expected) and refused. `window.recordedFixture.erase()` swaps in the space
// as an erasure leaves it (the next epoch, nothing kept), as Your data's delete would.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import type { PersonalReceipt, PersonalSpace as Space } from '@sophia/contracts'
import { parsePersonalSpace } from '@sophia/contracts/validate'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PersonalSpace } from '../src/features/personal/PersonalSpace.tsx'
import type { PersonalWrites } from '../src/features/personal/usePersonal.ts'
import '../src/app/theme.css'
import '../src/features/personal/personal.css'
import { bootTheme } from '../src/app/theme.ts'

declare global {
  interface Window {
    recordedFixture?: { writes: string[]; parsed: boolean; erase?: () => void }
  }
}

// This page's browser recognises no speech on the device: the headless shell has none, and asked (the composer's
// dictation) it ends the page's renderer (as fixtures/app.tsx says). So this page offers no microphone; dictation is
// covered by fixtures/personal.tsx.
Reflect.set(globalThis, 'SpeechRecognition', undefined)
bootTheme(null)
const writes: string[] = []
window.recordedFixture = { writes, parsed: false }

// The fixture's clock: noon today. e2e/personal-recorded.spec.ts fixes the page's clock there, so the days, the light and
// whether a welcome back is due read the same whenever it runs.
const NOW = new Date()
NOW.setHours(12, 0, 0, 0)
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()

/** The space as the API answers it: a legacy exchange, then two messages kept without asking her. */
const RAW: unknown = JSON.parse(
  JSON.stringify({
    companion: 'rehearsal',
    revision: 4,
    epoch: 0,
    days: 1,
    earlier: false,
    notes: [],
    releases: [],
    turns: [
      {
        id: '0b9a6f9e-4f0e-4c1e-8a51-6f2d0f3a7c01',
        seq: 1,
        author: 'person',
        text: 'Can we talk about the week?',
        createdAt: ago(40),
        replyTo: null,
        reply: 'answered',
        suggestion: null,
      },
      {
        id: '0b9a6f9e-4f0e-4c1e-8a51-6f2d0f3a7c02',
        seq: 2,
        author: 'sophia',
        text: 'Of course. Where would you like to start?',
        createdAt: ago(39),
        replyTo: '0b9a6f9e-4f0e-4c1e-8a51-6f2d0f3a7c01',
        reply: null,
        suggestion: null,
      },
      {
        id: '0b9a6f9e-4f0e-4c1e-8a51-6f2d0f3a7c03',
        seq: 3,
        author: 'person',
        text: 'A thought to keep for later: the Thursday plan.',
        createdAt: ago(20),
        replyTo: null,
        reply: 'recorded',
        suggestion: null,
      },
      {
        id: '0b9a6f9e-4f0e-4c1e-8a51-6f2d0f3a7c04',
        seq: 4,
        author: 'person',
        text: 'And one more, kept too.',
        createdAt: ago(5),
        replyTo: null,
        reply: 'recorded',
        suggestion: null,
      },
    ],
  }),
)

const first: Space = parsePersonalSpace(RAW)
window.recordedFixture.parsed = true

/** The space after an erasure: the next epoch, nothing kept. */
const erased = (s: Space): Space => ({ ...s, revision: s.revision + 1, epoch: s.epoch + 1, days: 0, turns: [] })

/** Each write the page asks for, listed and refused: a held turn asks for none. */
function refused(name: string): Promise<never> {
  writes.push(name)
  return Promise.reject(new Error(`no write in this fixture: ${name}`))
}

function writesFor(erasures: number): PersonalWrites {
  return {
    here: () => true,
    sending: null,
    busy: false,
    welcoming: false,
    erasures,
    readAgain: () => void writes.push('readAgain'),
    resume: () => refused('resume'),
    send: () => refused('send'),
    retry: () => refused('retry'),
    decide: () => refused('decide'),
    keep: () => refused('keep'),
    forget: () => refused('forget'),
    carry: () => refused('carry'),
    takeBack: () => refused('takeBack'),
    erase: (): Promise<PersonalReceipt> => refused('erase'),
  }
}

const idle = { state: 'ready' as const, failed: '', retry: () => undefined }
const readBack = { older: [], more: false, readMore: () => Promise.resolve(), reading: false }
/** No projects to carry a note to: one array for every render, as a read keeps it. */
const NO_PROJECTS: [] = []

function Personal() {
  const [space, setSpace] = useState<Space>(first)
  const [erasures, setErasures] = useState(0)
  const [notes, setNotes] = useState(false)
  const [earlier, setEarlier] = useState(false)
  useEffect(() => {
    if (!window.recordedFixture) return
    window.recordedFixture.erase = () => {
      setSpace(erased)
      setErasures((n) => n + 1)
    }
  }, [])
  return (
    <div className="places" data-place="personal">
      <header className="topbar places-bar">
        <button type="button" className="ghost">
          Home
        </button>
      </header>
      <PersonalSpace
        hidden={false}
        handed={null}
        onHanded={() => undefined}
        locked={false}
        now={NOW}
        account="fixture"
        name="Ana"
        space={space}
        epoch={space.epoch}
        readBack={readBack}
        read={idle}
        projects={NO_PROJECTS}
        projectsRead={idle}
        writes={writesFor(erasures)}
        notes={{ open: notes, set: setNotes }}
        earlier={{ open: earlier, set: setEarlier }}
        edge={{ badge: 0, pulse: 0 }}
        toast={() => undefined}
        onCarried={() => undefined}
        onCross={() => undefined}
        onStartProject={() => undefined}
      />
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('personal-recorded.html must contain #root')

createRoot(root).render(
  <StrictMode>
    <p className="fixture-label" role="note">
      Simulated — messages kept without asking Sophia, no account
    </p>
    <Personal />
  </StrictMode>,
)
