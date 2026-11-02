// A project text a report cites, opened in place under its Sources row (getCitedReportText, cited-text.ts). Closed
// until the reader asks; each opening reads it again, so a member removed or a source withdrawn since reads nothing.
// The read lives in this account's query cache (another account has its own: account-cache.ts) and goes when the text
// is closed, the row unmounts or the report is withheld from this person (report-read.ts): nothing stays to be shown
// later. Its refusal is the source's, never the report's, so it fences nothing else.
import { useEffect, useId, useState } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ReadNote } from '@sophia/ui'
import { getCitedReportText } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { SlowNote } from '../../app/SignIn.tsx'
import {
  CITED_TEXT_WORDS,
  checkedCitedText,
  citedTextFailure,
  citedTextKey,
  citedTextRegion,
  citedTextToggle,
  retryCitedText,
} from './cited-text.ts'
import { useReportFence } from './report-read.ts'

/** The report version a row's source is cited by, as the Sources tab knows it. */
export interface CitingVersion {
  identity: Identity
  artifactId: string
  versionId: string
}

function dropRead(client: QueryClient, queryKey: readonly unknown[]): void {
  void client.cancelQueries({ queryKey })
  client.removeQueries({ queryKey })
}

/** One open text's read: under this account, and gone (cancelled and dropped) once it is closed or unmounted. */
function useCitedText(citing: CitingVersion, sourceId: string, open: boolean) {
  const { identity, artifactId, versionId } = citing
  const client = useQueryClient()
  const account = identity.name
  const read = useQuery({
    queryKey: citedTextKey(account, artifactId, versionId, sourceId),
    queryFn: async ({ signal }) =>
      checkedCitedText(await getCitedReportText(identity.token, { artifactId, versionId, sourceId }, signal), sourceId),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: retryCitedText,
  })
  // Closed: the read on its way stops and nothing stays. Unmounted, or another report, version, source or account:
  // the same for the one before. Never on opening, which would stop the read it starts.
  useEffect(() => {
    if (!open) dropRead(client, citedTextKey(account, artifactId, versionId, sourceId))
  }, [client, open, account, artifactId, versionId, sourceId])
  useEffect(
    () => () => dropRead(client, citedTextKey(account, artifactId, versionId, sourceId)),
    [client, account, artifactId, versionId, sourceId],
  )
  return read
}

interface Props {
  citing: CitingVersion
  sourceId: string
  /** The row's citation number, for the region's name. */
  n: number | null
}

/** Show text / Hide text, and the text itself as plain text once its bytes match their record. */
export function CitedText({ citing, sourceId, n }: Props) {
  // Open in one account's cache only: another account coming in (a new cache, account-cache.ts) finds it closed, even
  // at the same address and with this row still mounted.
  const client = useQueryClient()
  const [openIn, setOpenIn] = useState<QueryClient | null>(null)
  const withheld = useReportFence(citing.artifactId)
  const shown = openIn === client && !withheld
  const read = useCitedText(citing, sourceId, shown)
  const region = useId()
  if (withheld) return null
  return (
    <div className="source-text">
      <button
        type="button"
        className="text-button source-text-toggle"
        aria-expanded={shown}
        aria-controls={shown ? region : undefined}
        onClick={() => setOpenIn(shown ? null : client)}
      >
        {citedTextToggle(shown)}
      </button>
      {shown && (
        <div id={region} role="region" aria-label={citedTextRegion(n)} className="source-text-region">
          <CitedTextBody read={read} />
        </div>
      )}
    </div>
  )
}

function CitedTextBody({ read }: { read: ReturnType<typeof useCitedText> }) {
  if (read.isPending) {
    return (
      <>
        <ReadNote>Reading the source…</ReadNote>
        <SlowNote />
      </>
    )
  }
  if (read.isError) {
    const failure = citedTextFailure(read.error)
    return (
      <p className="muted source-text-note" role="status">
        {CITED_TEXT_WORDS[failure]}{' '}
        {failure === 'failed' && (
          <button type="button" className="text-button" onClick={() => void read.refetch()}>
            Try again
          </button>
        )}
      </p>
    )
  }
  return (
    // Focusable so a long text scrolls from the keyboard; React sets it as text, so nothing in it is markup.
    <pre className="source-text-body" tabIndex={0}>
      {read.data}
    </pre>
  )
}
