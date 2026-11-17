import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { errorText, useApi } from '../api'
import { useAuth } from '../auth'
import type { MatchSummary, Player, TeamRef, TournamentCard } from '../types'
import { Badge, Field, MatchList, Status } from '../ui'

export function Login() {
  const { user, login, register } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={params.get('next') || '/'} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'in') await login(email, password)
      else await register(name, email, password)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <form className="card col" style={{ gap: 14, marginTop: 30 }} onSubmit={submit}>
        <div><h1>{mode === 'in' ? 'Sign in' : 'Create your account'}</h1><div className="muted small">You only need an account to score or organise. Following a match never needs one.</div></div>
        {mode === 'up' && <Field label="Your name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>}
        <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
        <Field label={mode === 'up' ? 'Password (8 characters or more)' : 'Password'}>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={mode === 'up' ? 8 : 1} />
        </Field>
        {error && <div className="note error">{error}</div>}
        <button className="btn primary block" disabled={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="btn ghost block" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(null) }}>
          {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}

type Results = { matches: MatchSummary[]; teams: TeamRef[]; players: Player[]; tournaments: TournamentCard[] }

export function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const { data, error, loading } = useApi<Results>(q ? `/search?q=${encodeURIComponent(q)}` : null)
  const none = data && !data.matches.length && !data.teams.length && !data.players.length && !data.tournaments.length
  return (
    <div className="page">
      <div className="page-head"><h1>Results for “{q}”</h1></div>
      <Status loading={loading} error={error} />
      {none && <div className="empty">Nothing matched. Try a team, player or tournament name.</div>}
      {data && (
        <div className="col" style={{ gap: 14 }}>
          {data.tournaments.length > 0 && (
            <div className="card"><div className="card-head"><h2>Tournaments</h2></div>
              <div className="chips">{data.tournaments.map((t) => <Link key={t.id} className="chip" to={`/tournaments/${t.id}`}>{t.name}</Link>)}</div></div>
          )}
          {data.teams.length > 0 && (
            <div className="card"><div className="card-head"><h2>Teams</h2></div>
              <div className="chips">{data.teams.map((t) => <Link key={t.id} className="chip row" to={`/teams/${t.id}`}><Badge team={t} />{t.name}</Link>)}</div></div>
          )}
          {data.players.length > 0 && (
            <div className="card"><div className="card-head"><h2>Players</h2></div>
              <div className="chips">{data.players.map((p) => <Link key={p.id} className="chip" to={`/players/${p.id}`}>{p.name}</Link>)}</div></div>
          )}
          {data.matches.length > 0 && <div className="card flush"><div className="card-head"><h2>Matches</h2></div><MatchList matches={data.matches} empty="" /></div>}
        </div>
      )}
    </div>
  )
}
