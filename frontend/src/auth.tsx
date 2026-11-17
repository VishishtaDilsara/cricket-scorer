import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, hasToken, setToken } from './api'
import type { User } from './types'

type Session = { token: string; user: User }
type Auth = {
  user: User | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
}
const Ctx = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(!hasToken())

  useEffect(() => {
    if (hasToken()) {
      api<User>('GET', '/me').then(setUser).catch((e) => { if (e?.status === 401) setToken(null) }).finally(() => setReady(true))
    }
    const out = () => setUser(null)
    window.addEventListener('wk:signout', out)
    return () => window.removeEventListener('wk:signout', out)
  }, [])

  const accept = useCallback((s: Session) => { setToken(s.token); setUser(s.user) }, [])
  const login = useCallback(async (email: string, password: string) => accept(await api<Session>('POST', '/auth/login', { email, password })), [accept])
  const register = useCallback(async (name: string, email: string, password: string) =>
    accept(await api<Session>('POST', '/auth/register', { name, email, password })), [accept])
  const logout = useCallback(() => { setToken(null); setUser(null) }, [])

  return <Ctx.Provider value={{ user, ready, login, register, logout }}>{children}</Ctx.Provider>
}

export function useAuth(): Auth {
  const v = useContext(Ctx)
  if (!v) throw new Error('AuthProvider missing')
  return v
}
