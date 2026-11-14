import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../supabase', () => ({ supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'TOK' } } })), setSession: vi.fn(async () => ({ error: null })) } } }))
import { api, startDemo } from '../api'
import { supabase } from '../supabase'
const ok = body => ({ ok: true, json: async () => body })
afterEach(() => vi.unstubAllGlobals())

describe('api()', () => {
  it('sends the bearer token and JSON body, using POST when a body is given', async () => {
    const f = vi.fn(async () => ok({ a: 1 })); vi.stubGlobal('fetch', f)
    expect(await api('/analyze', { x: 1 })).toEqual({ a: 1 })
    const [url, opt] = f.mock.calls[0]
    expect(url).toBe('/api/analyze'); expect(opt.method).toBe('POST'); expect(opt.headers.Authorization).toBe('Bearer TOK'); expect(opt.body).toBe('{"x":1}')
  })
  it('defaults to GET without a body', async () => {
    const f = vi.fn(async () => ok({})); vi.stubGlobal('fetch', f); await api('/me'); expect(f.mock.calls[0][1].method).toBe('GET')
  })
  it('surfaces the server error detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 422, json: async () => ({ detail: 'Ratings invalid' }) })))
    await expect(api('/analyze', {})).rejects.toThrow('Ratings invalid')
  })
  it('falls back to a status message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('x') } })))
    await expect(api('/me')).rejects.toThrow('Request failed (502)')
  })
})

describe('startDemo()', () => {
  it('stores the returned session so it persists across refreshes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ access_token: 'A', refresh_token: 'R' })))
    await startDemo(); expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'A', refresh_token: 'R' })
  })
  it('throws a readable error when demo is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ detail: 'Demo mode is disabled' }) })))
    await expect(startDemo()).rejects.toThrow('Demo mode is disabled')
  })
})
