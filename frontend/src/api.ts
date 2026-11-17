import { useCallback, useEffect, useState } from 'react'

const BASE: string = import.meta.env.VITE_API_URL ?? '/api'

/** The server answered, but with an error status. A plain Error from fetch means the network is down. */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** crypto.randomUUID needs HTTPS; scorers on a LAN address still need ids. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const store = {
  get(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
  },
  set(key: string, value: string | null) {
    try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* private mode */ }
  },
}

export const deviceId = store.get('wk:device') ?? (() => { const id = uuid(); store.set('wk:device', id); return id })()

let token = store.get('wk:token')
export function setToken(t: string | null) { token = t; store.set('wk:token', t) }
export function hasToken() { return token !== null }

export async function api<T = void>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'X-Device-Id': deviceId }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  if (res.status === 401 && token && method === 'GET' && !path.startsWith('/me')) {
    // Expired sign-in must not block public pages: retry as a viewer.
    setToken(null)
    window.dispatchEvent(new Event('wk:signout'))
    return api<T>(method, path, body)
  }
  const text = await res.text()
  if (!res.ok) {
    let message = res.status === 401 ? 'Please sign in' : res.statusText || 'Request failed'
    try { message = JSON.parse(text).message || message } catch { /* not JSON */ }
    throw new ApiError(res.status, message)
  }
  return (text ? JSON.parse(text) : undefined) as T
}

export const streamUrl = (matchId: string) => `${BASE}/matches/${matchId}/stream`

/** GET with loading and error state. Pass null to skip. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(path !== null)
  const reload = useCallback(async () => {
    if (path === null) return
    try {
      setData(await api<T>('GET', path))
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not reach the server. Check your connection.')
    } finally {
      setLoading(false)
    }
  }, [path])
  useEffect(() => {
    setLoading(path !== null)
    void reload()
  }, [reload, path])
  return { data, error, loading, reload }
}

export function errorText(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Could not reach the server. Check your connection.'
}
