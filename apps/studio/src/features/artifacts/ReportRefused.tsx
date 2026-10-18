// A report refused to this person (report-read.ts), said where it was, with one bounded way to read it again: Try again
// sets out the report's own versions read (created if no reader holds it yet), stamped as every report read is; allowed,
// the report comes back everywhere; refused again, it stays refused. No automatic retry.
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { listArtifactVersions } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { reportRead } from './report-read.ts'

export function ReportRefused({
  artifactId,
  identity,
  className,
}: {
  artifactId: string
  identity: Identity
  className?: string
}) {
  const client = useQueryClient()
  const [reading, setReading] = useState(false)
  const again = () => {
    if (reading) return
    setReading(true)
    void client
      .fetchQuery({
        queryKey: ['report-versions', artifactId, identity.name],
        queryFn: reportRead(artifactId, () => listArtifactVersions(identity.token, artifactId)),
        staleTime: 0,
      })
      .catch(() => undefined)
      .finally(() => setReading(false))
  }
  return (
    <p className={className ?? 'report-meta'} role="status">
      This report isn’t available to you.{' '}
      <button type="button" className="text-button" aria-disabled={reading || undefined} onClick={again}>
        Try again
      </button>
    </p>
  )
}
