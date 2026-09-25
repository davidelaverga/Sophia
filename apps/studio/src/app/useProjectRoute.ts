// The open project lives in the URL (/projects/<id>), so links can be shared and Back works.
import { useEffect, useState } from 'react'

const PROJECT_PATH = /^\/projects\/([0-9a-f-]{36})\/?$/i

const projectFromPath = (): string | null => PROJECT_PATH.exec(window.location.pathname)?.[1] ?? null

export function useProjectRoute(fallback: string | null) {
  const [projectId, setProjectId] = useState<string | null>(() => projectFromPath() ?? fallback)

  useEffect(() => {
    if (projectId && !projectFromPath()) window.history.replaceState(null, '', `/projects/${projectId}`)
    const onPop = () => setProjectId(projectFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [projectId])

  return {
    projectId,
    open: (id: string) => {
      window.history.pushState(null, '', `/projects/${id}`)
      setProjectId(id)
    },
    leave: () => {
      window.history.pushState(null, '', '/')
      setProjectId(null)
    },
  }
}
