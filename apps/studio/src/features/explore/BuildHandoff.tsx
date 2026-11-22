import { useQuery } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  getBuildDestination,
  getVerifiedBuildBlob,
  getVerifiedBuildManifest,
  gitShaPattern,
  parseBuildAction,
  repositoryPattern,
  sendBuildAction,
  type BuildAction,
  type BuildDestination,
  type BuildEvidence,
  type BuildScope,
  type RepositoryBinding,
} from '../../api/explore-build-handoff.ts'
import type { getExploreHandoff } from '../../api/managed-explore.ts'
import { saveBlob } from '../artifacts/download.ts'
import { useExploreAdmission } from './useExploreAdmission.ts'

interface Props {
  account: string
  scope: BuildScope
  approved: Awaited<ReturnType<typeof getExploreHandoff>>
}

function useBuild({ account, scope }: Props) {
  const parts = [scope.projectId, scope.sessionId, scope.approvalId]
  const read = useQuery({
    queryKey: ['explore-build-destination', account, ...parts],
    queryFn: ({ signal }) => getBuildDestination(scope, signal),
    retry: false,
    gcTime: 0,
  })
  const pending = useRef<AbortController | null>(null)
  useLayoutEffect(() => () => pending.current?.abort(), [scope.token])
  const write = useExploreAdmission(
    { account, part: 'managed-explore', project: JSON.stringify(['build', ...parts]) },
    parseBuildAction,
    async (key, action) => {
      const controller = new AbortController()
      pending.current = controller
      try {
        return await sendBuildAction(scope, action, key, controller.signal)
      } finally {
        if (pending.current === controller) pending.current = null
        if (!controller.signal.aborted) void read.refetch()
      }
    },
  )
  const status = write.state.status
  const canSend = read.isSuccess && !read.isFetching && status !== 'sending' && status !== 'unknown'
  return { read, write, canSend, cancel: () => pending.current?.abort() }
}

function BuildNotice({ write, cancel }: Pick<ReturnType<typeof useBuild>, 'write' | 'cancel'>) {
  if (write.state.status === 'sending')
    return (
      <p role="status">
        Saving the Build handoff…{' '}
        <button className="text-button" type="button" onClick={cancel}>
          Stop waiting
        </button>
      </p>
    )
  if (write.state.status === 'unknown')
    return (
      <p role="status">
        The request may have reached Sophia.{' '}
        <button type="button" className="text-button" onClick={() => void write.retry()}>
          Retry same request
        </button>
      </p>
    )
  if (write.state.status === 'rejected') return <p role="status">{write.state.error.message}</p>
  return null
}

export function BuildHandoff(props: Props) {
  const build = useBuild(props)
  const { read, write, canSend } = build
  if (read.isPending) return <p role="status">Checking Build availability…</p>
  if (read.isError)
    return (
      <p role="status">
        Manual Build exchange is unavailable.{' '}
        <button className="text-button" type="button" onClick={() => void read.refetch()}>
          Check again
        </button>
      </p>
    )
  const onAction = (action: BuildAction) => {
    if (canSend) void write.submit(action)
  }
  return (
    <section className="build-exchange" aria-label="Manual Build exchange">
      <BuildNotice {...build} />
      {read.data.binding ? (
        <BoundHandoff
          {...props}
          destination={read.data}
          binding={read.data.binding}
          disabled={!canSend}
          onAction={onAction}
        />
      ) : (
        <BindingForm revision={read.data.revision} disabled={!canSend} onAction={onAction} />
      )}
    </section>
  )
}

type OnAction = (action: BuildAction) => void
function Field({
  name,
  label,
  pattern,
  maxLength = 255,
  required = false,
}: {
  name: string
  label: string
  pattern?: string
  maxLength?: number
  required?: boolean
}) {
  return (
    <label>
      {label}
      <span className="field">
        <input name={name} pattern={pattern} maxLength={maxLength} required={required} />
      </span>
    </label>
  )
}

function value(data: FormData, name: string): string {
  const entry = data.get(name)
  return typeof entry === 'string' ? entry.trim() : ''
}
function BindingForm({ revision, disabled, onAction }: { revision: number; disabled: boolean; onAction: OnAction }) {
  const [confirmed, confirm] = useState(false)
  const [error, setError] = useState(false)
  const submit = (data: FormData) => {
    const repository = value(data, 'repository')
    const repositoryId = value(data, 'repositoryId')
    const defaultBranch = value(data, 'defaultBranch')
    const seedCommit = value(data, 'seedCommit').toLowerCase()
    if (
      !defaultBranch ||
      !repositoryPattern.test(repository) ||
      !/^\d{1,30}$/u.test(repositoryId) ||
      !gitShaPattern.test(seedCommit)
    ) {
      setError(true)
      return
    }
    setError(false)
    onAction({
      kind: 'repository-binding',
      body: { expectedRevision: revision, repositoryId, repository, defaultBranch, seedCommit, privateConfirmed: true },
    })
  }
  return (
    <form
      className="build-fields"
      onSubmit={(event) => {
        event.preventDefault()
        if (confirmed && !disabled) submit(new FormData(event.currentTarget))
      }}
    >
      <Field name="repository" label="GitHub repository (owner/name)" required />
      <Field name="repositoryId" label="GitHub repository ID" pattern="[0-9]+" maxLength={30} required />
      <Field name="defaultBranch" label="Default branch" required />
      <Field name="seedCommit" label="Full README seed commit" maxLength={64} required />
      <label className="build-confirm">
        <input type="checkbox" checked={confirmed} onChange={(event) => confirm(event.target.checked)} />I confirm the
        repository is private and starts at this README seed commit.
      </label>
      {error && <p role="status">Enter the full repository name, numeric ID, branch and seed commit.</p>}
      <button type="submit" className="pill primary" disabled={disabled || !confirmed}>
        Bind repository
      </button>
    </form>
  )
}

interface BoundProps extends Props {
  destination: BuildDestination
  binding: RepositoryBinding
  disabled: boolean
  onAction: OnAction
}
function BoundHandoff(props: BoundProps) {
  const { binding, destination, disabled, onAction } = props
  const pendingExport = destination.export
  return (
    <>
      <h4>{binding.repository}</h4>
      <p className="muted">
        Private · repository {binding.repositoryId} · {binding.defaultBranch}
      </p>
      <p className="muted">
        {binding.provenance === 'reported'
          ? 'Repository details reported by founder'
          : 'Repository details independently checked'}
      </p>
      <details>
        <summary>README seed commit</summary>
        <code>{binding.seedCommit}</code>
      </details>
      {pendingExport ? (
        <PreparedExport {...props} record={pendingExport} />
      ) : (
        <button
          type="button"
          className="pill primary"
          disabled={disabled}
          onClick={() =>
            onAction({ kind: 'exports', body: { expectedRevision: destination.revision, bindingId: binding.id } })
          }
        >
          Prepare export
        </button>
      )}
    </>
  )
}

type ExportRecord = NonNullable<BuildDestination['export']>
type VerifiedExport = Awaited<ReturnType<typeof getVerifiedBuildManifest>>
function PreparedExport(props: BoundProps & { record: ExportRecord }) {
  const { approved, binding, record, account, scope } = props
  const entry = approved.files[0]
  const read = useQuery({
    queryKey: [
      'explore-build-manifest',
      account,
      scope.projectId,
      scope.sessionId,
      scope.approvalId,
      binding.id,
      record.id,
      record.sha256,
    ],
    queryFn: ({ signal }) => {
      if (!entry) throw new Error('Approved source is unavailable')
      return getVerifiedBuildManifest(
        scope,
        {
          record,
          binding,
          versionId: approved.versionId,
          prototypeManifestSha256: approved.manifestSha256,
          acceptanceCriteria: approved.acceptanceCriteria,
          entrySha256: entry.sha256,
          entryByteCount: entry.byteCount,
        },
        signal,
      )
    },
    retry: false,
    gcTime: 0,
  })
  if (read.isPending) return <p role="status">Checking the export manifest…</p>
  if (read.isError)
    return (
      <p role="status">
        The prepared export could not be verified.{' '}
        <button className="text-button" type="button" onClick={() => void read.refetch()}>
          Check again
        </button>
      </p>
    )
  return <BuildPackage key={read.data.id} {...props} verified={read.data} />
}

function lineList(items: readonly string[]) {
  return items.map((item) => `- ${item}`).join('\n')
}
function buildBrief({ approved }: Props, { id, manifest, file, sha256 }: VerifiedExport) {
  return [
    'Build the approved application in your signed-in Codex account.',
    approved.seedText,
    `Verify the private target ${manifest.repository} (repository ID ${manifest.repositoryId}) on ${manifest.defaultBranch} at seed ${manifest.seedCommit}.`,
    `Keep the downloaded ${file.path} as the approved source reference (${String(file.byteCount)} bytes, SHA-256 ${file.sha256}).`,
    `Approval ${manifest.approvalId}, version ${manifest.versionId}, prototype manifest SHA-256 ${manifest.prototypeManifestSha256}.`,
    `Build export ${id}, SHA-256 ${sha256}. Carry the export ID into your pull request.`,
    `Acceptance criteria\n${lineList(manifest.acceptanceCriteria)}`,
    ...briefNotes(approved),
    'Test the approved behavior and persistence with the required roles. Return the candidate commit, PR, merge and deployment evidence as it becomes available.',
  ].join('\n\n')
}
function briefNotes(approved: Props['approved']) {
  const sections = [
    ['Simulated behavior to replace', approved.mockReplacements],
    ['Open issues', approved.limitations],
  ] as const
  return sections.filter(([, items]) => items.length > 0).map(([title, items]) => `${title}\n${lineList(items)}`)
}

function BuildPackage(props: BoundProps & { verified: VerifiedExport }) {
  const { verified, scope, destination, disabled, onAction } = props
  const records = destination.returns.filter(
    (item) =>
      item.exportId === verified.id &&
      item.exportSha256 === verified.sha256 &&
      item.repositoryId === verified.manifest.repositoryId,
  )
  return (
    <>
      <details>
        <summary>Destination-bound export SHA-256</summary>
        <code>{verified.sha256}</code>
      </details>
      <p className="muted">For {verified.manifest.recipient} · manual transfer to the signed-in Codex checkout</p>
      <CopyBrief brief={buildBrief(props, verified)} />
      <DownloadSource scope={scope} exportRecord={verified} />
      <ReturnForm revision={destination.revision} exportRecord={verified} disabled={disabled} onAction={onAction} />
      {records.length > 0 && <ReportedEvidence records={records} />}
    </>
  )
}

function CopyBrief({ brief }: { brief: string }) {
  const [copied, copyState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(brief)
      copyState('copied')
    } catch {
      copyState('manual')
    }
  }
  return (
    <>
      <button type="button" className="pill" onClick={() => void copy()}>
        Copy build brief
      </button>
      {copied === 'copied' && <p role="status">Build brief copied.</p>}
      {copied === 'manual' && (
        <label>
          Build brief
          <textarea readOnly rows={5} value={brief} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
    </>
  )
}

function DownloadSource({ scope, exportRecord }: { scope: BuildScope; exportRecord: VerifiedExport }) {
  const [status, show] = useState<'idle' | 'reading' | 'failed'>('idle')
  const download = useRef<AbortController | null>(null)
  useLayoutEffect(() => () => download.current?.abort(), [scope.token, exportRecord.id, exportRecord.sha256])
  const save = async () => {
    const controller = new AbortController()
    download.current = controller
    show('reading')
    try {
      const blob = await getVerifiedBuildBlob(scope, exportRecord, controller.signal)
      if (!controller.signal.aborted) {
        saveBlob(blob, exportRecord.file.path)
        show('idle')
      }
    } catch {
      if (!controller.signal.aborted) show('failed')
    } finally {
      if (download.current === controller) download.current = null
    }
  }
  const cancel = () => {
    download.current?.abort()
    show('idle')
  }
  return (
    <>
      <button type="button" className="pill primary" disabled={status === 'reading'} onClick={() => void save()}>
        Download approved source
      </button>
      {status === 'reading' && (
        <p role="status">
          Checking the approved file…{' '}
          <button type="button" className="text-button" onClick={cancel}>
            Cancel download
          </button>
        </p>
      )}
      {status === 'failed' && <p role="status">The approved file could not be verified. Try the download again.</p>}
    </>
  )
}

const evidenceFields = [
  { name: 'candidateSha', label: 'Candidate commit', maxLength: 64 },
  { name: 'pullRequestNumber', label: 'Pull request number', maxLength: 16, pattern: '[0-9]+' },
  { name: 'mergeSha', label: 'Merge commit', maxLength: 64 },
  { name: 'deploymentReference', label: 'Deployment reference', maxLength: 1024 },
  { name: 'deployedSha', label: 'Deployed commit', maxLength: 64 },
] as const
function evidenceOf(data: FormData): BuildEvidence | null {
  const candidateSha = value(data, 'candidateSha').toLowerCase() || undefined
  const mergeSha = value(data, 'mergeSha').toLowerCase() || undefined
  const deployedSha = value(data, 'deployedSha').toLowerCase() || undefined
  const deploymentReference = value(data, 'deploymentReference') || undefined
  const pr = value(data, 'pullRequestNumber')
  const pullRequestNumber = pr ? Number(pr) : undefined
  if ([candidateSha, mergeSha, deployedSha].some((sha) => sha && !gitShaPattern.test(sha))) return null
  if (
    pullRequestNumber !== undefined &&
    (!/^\d+$/u.test(pr) || !Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1)
  )
    return null
  const evidence = { candidateSha, pullRequestNumber, mergeSha, deploymentReference, deployedSha }
  return Object.values(evidence).some((item) => item !== undefined) ? evidence : null
}

function ReturnForm({
  revision,
  exportRecord,
  disabled,
  onAction,
}: {
  revision: number
  exportRecord: VerifiedExport
  disabled: boolean
  onAction: OnAction
}) {
  const [invalid, setInvalid] = useState(false)
  const submit = (data: FormData) => {
    const evidence = evidenceOf(data)
    setInvalid(!evidence)
    if (!evidence) return
    onAction({
      kind: 'returns',
      body: {
        ...evidence,
        expectedRevision: revision,
        exportId: exportRecord.id,
        exportSha256: exportRecord.sha256,
        repositoryId: exportRecord.manifest.repositoryId,
      },
    })
  }
  return (
    <form
      className="build-fields"
      key={revision}
      onSubmit={(event) => {
        event.preventDefault()
        if (!disabled) submit(new FormData(event.currentTarget))
      }}
    >
      <h4>Return build evidence</h4>
      {evidenceFields.map((field) => (
        <Field key={field.name} {...field} />
      ))}
      {invalid && <p role="status">Enter at least one result. Use full commit hashes and a positive PR number.</p>}
      <button type="submit" className="pill" disabled={disabled}>
        Save reported evidence
      </button>
    </form>
  )
}

function ReportedEvidence({ records }: { records: BuildDestination['returns'] }) {
  return (
    <section aria-label="Saved build evidence">
      <h4>Reported · independent verification pending</h4>
      <ul>
        {records.map((record) => (
          <li key={record.id}>
            {evidenceFields.map(({ name, label }) => (
              <EvidenceFact key={name} label={label} detail={record[name]} />
            ))}
          </li>
        ))}
      </ul>
    </section>
  )
}
function EvidenceFact({ label, detail }: { label: string; detail: ReactNode }) {
  if (!detail) return null
  return (
    <p>
      {label} <code>{detail}</code>
    </p>
  )
}
