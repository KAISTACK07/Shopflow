// Thin fetch wrapper: adds the token, sends JSON, and turns every failure into one ApiError shape that
// mirrors the backend's {"error": {"code", "message", "details"}} envelope.

const TOKEN_KEY = 'shopflow.token'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  readonly retryAfterSeconds: number | null

  constructor(status: number, code: string, message: string, details: unknown = null, retryAfter: number | null = null) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
    this.retryAfterSeconds = retryAfter
  }

  /** No response at all (offline, server down) or a 5xx: the request may or may not have taken effect. */
  get outcomeUnknown(): boolean {
    return this.status === 0 || this.status >= 500
  }
}

// Token in localStorage: simple and survives reloads. Trade-off: any script injected into the page (XSS) could
// read it. An httpOnly cookie avoids that but needs CSRF protection; see the design notes.
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage unavailable: the user stays logged in for this page only
  }
}

let onUnauthorized: () => void = () => {}

/** The auth context registers this, so an expired token anywhere logs the user out. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
}

export interface ApiResponse<T> {
  data: T
  headers: Headers
}

export async function send<T>(path: string, options: Options = {}): Promise<ApiResponse<T>> {
  const token = getToken()
  const headers: Record<string, string> = { ...options.headers }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', "Can't reach the server. Check your connection and try again.")
  }

  const payload: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    const error = toApiError(response.status, payload, response.headers)
    if (error.status === 401 && token) onUnauthorized()
    throw error
  }
  return { data: payload as T, headers: response.headers }
}

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  return (await send<T>(path, options)).data
}

export function toApiError(status: number, payload: unknown, headers: Headers): ApiError {
  const retryAfter = Number(headers.get('Retry-After')) || null
  const envelope = (payload as { error?: { code?: unknown; message?: unknown; details?: unknown } } | null)?.error
  if (envelope && typeof envelope.code === 'string' && typeof envelope.message === 'string') {
    return new ApiError(status, envelope.code, envelope.message, envelope.details ?? null, retryAfter)
  }
  // Not our envelope (e.g. a proxy error page): still give the user something actionable.
  const message = status >= 500 ? 'The server had a problem. Try again in a moment.' : `Request failed (${status}).`
  return new ApiError(status, `HTTP_${status}`, message, null, retryAfter)
}
