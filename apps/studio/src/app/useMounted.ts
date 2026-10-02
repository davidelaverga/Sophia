import { useEffect, useRef } from 'react'

/** Whether the component is still on the page: false once it went (signing out, an erasure, its sheet closed). */
export function useMounted() {
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}
