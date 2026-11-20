import { useState, type FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { errorText, useApi } from '../api'
import { useAuth } from '../auth'
import type { MatchSummary, Player, TeamRef, TournamentCard } from '../types'
import { Badge, BusyLabel, Field, MatchList, SignInPrompt, Status } from '../ui'
import toast from 'react-hot-toast'

export function Login() {
  const { user, login, register } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={params.get('next') || '/'} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'in') await login(email, password)
      else await register(name, email, password)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="page" style={{ maxWidth: 420 }}>
      <form className="card col" style={{ gap: 14, marginTop: 30 }} onSubmit={submit}>
        <div><h1>{mode === 'in' ? 'Sign in' : 'Create an admin account'}</h1><div className="muted small">{mode === 'in'
          ? 'Admins and scorers sign in here. Following a shared match link never needs an account.'
          : 'You get your own space for teams, players, tournaments and matches, and can create scorer accounts. Scorers do not sign up here; their admin creates them.'}</div></div>
        {mode === 'up' && <Field label="Your name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>}
        <Field label={mode === 'in' ? 'Email or username' : 'Email'}>
          <input className="input" type={mode === 'in' ? 'text' : 'email'} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete={mode === 'in' ? 'username' : 'email'} autoCapitalize="none" required />
        </Field>
        <Field label={mode === 'up' ? 'Password (8 characters or more)' : 'Password'}>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={mode === 'up' ? 8 : 1} />
        </Field>
        <button className="btn primary block" disabled={busy} aria-busy={busy}><BusyLabel busy={busy} text={mode === 'in' ? 'Signing in…' : 'Creating account…'}>{mode === 'in' ? 'Sign in' : 'Create account'}</BusyLabel></button>
        <button type="button" className="btn ghost block" onClick={() => { setMode(mode === 'in' ? 'up' : 'in') }}>
          {mode === 'in' ? 'New admin? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}

type Results = { matches: MatchSummary[]; teams: TeamRef[]; players: Player[]; tournaments: TournamentCard[] }

export function SearchPage() {
  const [params] = useSearchParams()
  const q = params.get('q') ?? ''
  const { user, ready } = useAuth()
  const { data, error, loading } = useApi<Results>(q && user ? `/search?q=${encodeURIComponent(q)}` : null)
  const none = data && !data.matches.length && !data.teams.length && !data.players.length && !data.tournaments.length
  return (
    <div className="page">
      <div className="page-head"><h1>Results for “{q}”</h1></div>
      {ready && !user && <SignInPrompt what="search results" />}
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
