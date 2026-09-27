import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client'

export function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, 'UNEXPECTED', 'Something went wrong. Reload the page and try again.')
}

interface ApiState<T> {
  data: T | undefined
  error: ApiError | undefined
  loading: boolean
}

/** Load data when `deps` change; exposes loading/error state, `reload`, and `setData` for optimistic updates. */
export function useApi<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<ApiState<T>>({ data: undefined, error: undefined, loading: true })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false // ignore a slow response that arrives after the inputs changed
    setState((previous) => ({ ...previous, loading: true, error: undefined }))
    load().then(
      (data) => !cancelled && setState({ data, error: undefined, loading: false }),
      (error: unknown) => !cancelled && setState((previous) => ({ ...previous, error: asApiError(error), loading: false })),
    )
    return () => {
      cancelled = true
    }
    // `load` is a new function every render; `deps` says when its inputs actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const setData = useCallback((data: T) => setState({ data, error: undefined, loading: false }), [])
  return { ...state, reload, setData }
}
