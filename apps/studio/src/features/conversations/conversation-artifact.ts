import { useQuery } from '@tanstack/react-query'
import { getConversationArtifactVersion } from '../../api/conversations.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useFeedRefetch } from '../artifacts/useFeedRefetch.ts'

interface Scope {
  projectId: string
  identity: Identity
  cursor: string | undefined
}

export function useConversationArtifact(
  { projectId, identity, cursor }: Scope,
  versionId: string | null,
  allowed: boolean,
) {
  const enabled = versionId !== null && allowed
  const read = useQuery({
    queryKey: ['conversation-artifact-version', projectId, accountOf(identity), versionId],
    queryFn: ({ signal }) => getConversationArtifactVersion(identity.token, projectId, versionId ?? '', signal),
    enabled,
    retry: false,
  })
  useFeedRefetch(enabled ? cursor : undefined, {
    isFetching: read.isFetching,
    refetch: (options) => (enabled ? read.refetch(options) : undefined),
  })
  const version = enabled && read.isSuccess && read.data.versionId === versionId ? read.data : null
  return {
    versionId,
    version,
    checking: enabled && read.isPending,
    ready: versionId === null || (version !== null && !read.isFetching),
    refresh: () => enabled && void read.refetch(),
  }
}

export function artifactWords(artifact: ReturnType<typeof useConversationArtifact>): string {
  const { version } = artifact
  if (!version) return artifact.checking ? 'Checking this version…' : 'This version is unavailable.'
  return version.versionNumber === null ? version.title : `${version.title} · Version ${version.versionNumber}`
}

export const visibleArtifact = ({ versionId, version }: ReturnType<typeof useConversationArtifact>) =>
  versionId === null || version !== null
