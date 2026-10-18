// A report's versions as one reader reads them (its own read, report-read.ts): withheld while the report is refused to
// this person, whoever saw the refusal. Each reader keeps its own query key; the fence is the report's.
import { useQuery } from '@tanstack/react-query'
import type { ArtifactVersion } from '@sophia/contracts'
import { listArtifactVersions } from '../../api/artifacts.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { reportRead, useReportFence } from './report-read.ts'

export function useOwnedVersions(
  queryKey: readonly unknown[],
  artifactId: string | undefined,
  identity: Identity,
  enabled: boolean,
): { versions: readonly ArtifactVersion[] | undefined; refused: boolean } {
  const id = artifactId ?? ''
  const refused = useReportFence(id)
  const versions = useQuery({
    queryKey,
    queryFn: reportRead(id, () => listArtifactVersions(identity.token, id)),
    enabled: enabled && artifactId !== undefined,
    select: (list: readonly ArtifactVersion[]) => (refused ? undefined : list),
  }).data
  return { versions, refused: refused && artifactId !== undefined }
}
