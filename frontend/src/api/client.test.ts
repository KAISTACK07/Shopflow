import { afterEach, describe, expect, it, vi } from 'vitest'
import { brokenStorage, memoryStorage } from '../test/memoryStorage'
import { ApiError, getToken, request, setToken, toApiError } from './client'

afterEach(() => vi.unstubAllGlobals())

function respondWith(status: number, body: unknown, headers: Record<string, string> = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers })))
}

describe('request', () => {
  it('returns the JSON body on success', async () => {
    respondWith(200, { id: 7 })

    await expect(request('/products/7')).resolves.toEqual({ id: 7 })
  })

  it('turns the backend error envelope into an ApiError', async () => {
    respondWith(409, {
      error: { code: 'INSUFFICIENT_STOCK', message: 'Some items…', details: [{ product_id: 3, requested: 2, available: 1 }] },
    })

    const error = await request('/orders').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, code: 'INSUFFICIENT_STOCK', details: [{ product_id: 3 }] })
    expect((error as ApiError).outcomeUnknown).toBe(false)
  })

  it('reports a network failure as an unknown outcome', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    const error = (await request('/orders').catch((e: unknown) => e)) as ApiError

    expect(error.code).toBe('NETWORK_ERROR')
    expect(error.outcomeUnknown).toBe(true)
  })
})

describe('token storage', () => {
  it('keeps the token across browser restarts only when "keep me signed in" is ticked', () => {
    const local = memoryStorage()
    const session = memoryStorage()
    vi.stubGlobal('localStorage', local)
    vi.stubGlobal('sessionStorage', session)

    setToken('remembered', true)
    expect([local.getItem('shopflow.token'), session.getItem('shopflow.token')]).toEqual(['remembered', null])

    setToken('this-visit-only', false)
    expect([local.getItem('shopflow.token'), session.getItem('shopflow.token')]).toEqual([null, 'this-visit-only'])
    expect(getToken()).toBe('this-visit-only')

    setToken(null)
    expect(getToken()).toBeNull()
  })

  it('keeps the user logged in for the page when storage is blocked', () => {
    vi.stubGlobal('localStorage', brokenStorage())
    vi.stubGlobal('sessionStorage', brokenStorage())

    setToken('in-memory', false)

    expect(getToken()).toBe('in-memory')
    setToken(null)
  })
})

describe('toApiError', () => {
  it('reads Retry-After on a 429', () => {
    const error = toApiError(429, { error: { code: 'RATE_LIMITED', message: 'Too many…' } }, new Headers({ 'Retry-After': '19' }))

    expect(error.retryAfterSeconds).toBe(19)
  })

  it('handles a non-envelope 502 from a proxy', () => {
    const error = toApiError(502, null, new Headers())

    expect(error).toMatchObject({ status: 502, code: 'HTTP_502', outcomeUnknown: true })
  })
})
