import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { listArtifactVersions, listReports } from '../../api/artifacts.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { artifactWords, type useConversationArtifact } from './conversation-artifact.ts'

interface Props {
  projectId: string
  identity: Identity
  artifact: ReturnType<typeof useConversationArtifact>
  onSelect: ((version: string | null) => void) | undefined
}

export function ReplyArtifact({ projectId, identity, artifact, onSelect }: Props) {
  const pickerId = useId()
  const [open, setOpen] = useState(false)
  const choose = (version: string | null) => {
    setOpen(false)
    onSelect?.(version)
  }
  return (
    <>
      {artifact.versionId && (
        <div className="conv-reply-target">
          <p role="status">{artifactWords(artifact)}</p>
          {onSelect && (
            <button type="button" className="text-button" onClick={() => choose(null)}>
              Clear version
            </button>
          )}
        </div>
      )}
      {onSelect && (
        <button
          type="button"
          className="text-button conv-report-toggle"
          aria-expanded={open}
          aria-controls={open ? pickerId : undefined}
          onClick={() => setOpen(!open)}
        >
          {artifact.versionId ? 'Change report version' : 'Attach report version'}
        </button>
      )}
      {open && onSelect && <ReportPicker id={pickerId} projectId={projectId} identity={identity} choose={choose} />}
    </>
  )
}

function ReportPicker({
  id,
  projectId,
  identity,
  choose,
}: {
  id: string
  projectId: string
  identity: Identity
  choose: (version: string) => void
}) {
  const [selected, setSelected] = useState('')
  const reports = useInfiniteQuery({
    queryKey: ['attachable-reports', projectId, accountOf(identity)],
    queryFn: ({ pageParam }) => listReports(identity.token, { project: projectId, cursor: pageParam }),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor,
    retry: false,
  })
  const choices = reports.isSuccess ? reports.data.pages.flatMap((page) => page.reports) : []
  const current = choices.find((report) => report.artifactId === selected)
  return (
    <div id={id} className="conv-report-picker">
      <label>
        <span>Report</span>
        <select value={current?.artifactId ?? ''} onChange={(event) => setSelected(event.target.value)}>
          <option value="">Choose a report</option>
          {choices.map((report) => (
            <option key={report.artifactId} value={report.artifactId}>
              {report.title}
            </option>
          ))}
        </select>
      </label>
      {reports.isPending && <p role="status">Loading reports…</p>}
      {reports.isError && <ReadFailed words="Couldn’t load reports." retry={() => void reports.refetch()} />}
      {reports.isSuccess && choices.length === 0 && <p role="status">No reports in this project.</p>}
      {reports.hasNextPage && (
        <button
          type="button"
          className="text-button"
          disabled={reports.isFetching}
          onClick={() => void reports.fetchNextPage()}
        >
          More reports
        </button>
      )}
      {current && (
        <VersionPicker key={current.artifactId} identity={identity} id={current.artifactId} choose={choose} />
      )}
    </div>
  )
}

function VersionPicker({
  identity,
  id,
  choose,
}: {
  identity: Identity
  id: string
  choose: (version: string) => void
}) {
  const versions = useQuery({
    queryKey: ['attachable-report-versions', id, accountOf(identity)],
    queryFn: () => listArtifactVersions(identity.token, id),
    retry: false,
  })
  if (versions.isPending) return <p role="status">Loading versions…</p>
  if (versions.isError) return <ReadFailed words="Couldn’t load versions." retry={() => void versions.refetch()} />
  if (versions.data.length === 0) return <p role="status">No published versions.</p>
  return (
    <label>
      <span>Report version</span>
      <select value="" onChange={(event) => event.target.value && choose(event.target.value)}>
        <option value="">Choose a version</option>
        {versions.data.map((version) => (
          <option key={version.id} value={version.id}>
            Version {version.versionNumber}
          </option>
        ))}
      </select>
    </label>
  )
}

function ReadFailed({ words, retry }: { words: string; retry: () => void }) {
  return (
    <p role="status">
      {words}{' '}
      <button type="button" className="text-button" onClick={retry}>
        Try again
      </button>
    </p>
  )
}
