// Entry without a project: start one (createProject, idempotent) or open a shared link. There is no
// project list operation in the contract yet, so a link or ID is the way in. Sophia's light rests above.
import { useState } from 'react'
import type { ProjectCreated } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import { createProject } from '../api/client.ts'
import { useAdmission } from '../api/useAdmission.ts'
import { SophiaLight } from '../features/light/SophiaLight.tsx'
import type { Identity } from './dev-identity.ts'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

interface Props {
  identity: Identity
  identityControl: React.ReactNode
  onOpen: (projectId: string) => void
}

export function ProjectHome({ identity, identityControl, onOpen }: Props) {
  return (
    <main className="screen home">
      <SophiaLight mode="rest" target={null} attention={null} working={false} />
      <header className="screen-bar">
        <div className="screen-mark">
          <span className="mark-dot" aria-hidden />
          <span className="mark-word">Sophia</span>
        </div>
        {identityControl}
      </header>
      <div className="screen-body">
        <CreateProjectForm token={identity.token} onCreated={onOpen} />
        <OpenProjectForm onOpen={onOpen} />
      </div>
    </main>
  )
}

function CreateProjectForm({ token, onCreated }: { token: string; onCreated: (projectId: string) => void }) {
  const [title, setTitle] = useState('')
  const admission = useAdmission<string, ProjectCreated>((key, t) => createProject(token, key, t))
  const { status } = admission.state

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const created = await (status === 'unknown' ? admission.retry() : admission.submit(title.trim()))
    if (created) onCreated(created.projectId)
  }

  return (
    <form className="create" onSubmit={(e) => void submit(e)}>
      <label htmlFor="title" className="sr-only">
        Project title
      </label>
      <input
        id="title"
        className="title-input"
        required
        maxLength={180}
        placeholder="What are we building?"
        value={title}
        // Editing the title after an unknown outcome would be a new intent, so keep it locked until retried.
        readOnly={status === 'unknown'}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button type="submit" className="pill primary" disabled={status === 'sending' || !title.trim()}>
        {status === 'sending' ? 'Creating…' : status === 'unknown' ? 'Retry same request' : 'Start the project'}
      </button>
      <p className="outcome" role="status" aria-live="polite">
        {admission.state.status === 'unknown' && (
          <>
            <Tag tone="amber">Not confirmed</Tag>
            <span>Sophia didn’t answer. Retrying can’t create a duplicate.</span>
          </>
        )}
        {admission.state.status === 'rejected' && (
          <>
            <Tag tone="rose">Not created</Tag>
            <span>{admission.state.error.message}</span>
          </>
        )}
      </p>
    </form>
  )
}

function OpenProjectForm({ onOpen }: { onOpen: (projectId: string) => void }) {
  const [link, setLink] = useState('')
  const projectId = UUID.exec(link)?.[0]
  return (
    <form
      className="field quiet"
      onSubmit={(e) => {
        e.preventDefault()
        if (projectId) onOpen(projectId)
      }}
    >
      <label htmlFor="link" className="sr-only">
        Project link or ID
      </label>
      <input
        id="link"
        placeholder="Or paste a shared project link"
        value={link}
        onChange={(e) => setLink(e.target.value)}
      />
      <button type="submit" className="pill" disabled={!projectId}>
        Open
      </button>
    </form>
  )
}
