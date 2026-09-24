// Entry without a project: start one (createProject, idempotent) or open a shared link.
// There is no project list operation in the contract yet, so a link or ID is the way in.
import { useState } from 'react'
import type { ProjectCreated } from '@sophia/contracts'
import { Tag } from '@sophia/ui'
import { createProject } from '../api/client.ts'
import { useAdmission } from '../api/useAdmission.ts'
import type { Identity } from './dev-identity.ts'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

interface Props {
  identity: Identity
  identityControl: React.ReactNode
  onOpen: (projectId: string) => void
}

export function ProjectHome({ identity, identityControl, onOpen }: Props) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="orb" aria-hidden />
          <span className="brand-name">Sophia</span>
        </div>
        <div className="project-title">
          <span className="eyebrow">Projects</span>
          <h1>Start or open a project</h1>
        </div>
        <div className="topbar-end">{identityControl}</div>
      </header>
      <main className="stage home">
        <CreateProjectForm token={identity.token} onCreated={onOpen} />
        <OpenProjectForm onOpen={onOpen} />
      </main>
    </div>
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
    <form className="goal home-card" onSubmit={(e) => void submit(e)}>
      <h3>Start a project</h3>
      <label htmlFor="title" className="sr-only">
        Project title
      </label>
      <input
        id="title"
        required
        maxLength={180}
        placeholder="What are we building?"
        value={title}
        // Editing the title after an unknown outcome would be a new intent, so keep it locked until retried.
        readOnly={status === 'unknown'}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="control-row">
        <button type="submit" className="primary" disabled={status === 'sending' || !title.trim()}>
          {status === 'sending' ? 'Creating…' : status === 'unknown' ? 'Retry same request' : 'Create project'}
        </button>
      </div>
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
      className="goal home-card"
      onSubmit={(e) => {
        e.preventDefault()
        if (projectId) onOpen(projectId)
      }}
    >
      <h3>Open a shared project</h3>
      <label htmlFor="link" className="sr-only">
        Project link or ID
      </label>
      <input id="link" placeholder="Paste a project link" value={link} onChange={(e) => setLink(e.target.value)} />
      <div className="control-row">
        <button type="submit" disabled={!projectId}>
          Open
        </button>
      </div>
    </form>
  )
}
