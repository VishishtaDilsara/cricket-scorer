import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { api, errorText, useApi } from '../api'
import { useAuth } from '../auth'
import type { Career, MatchSummary, Player, TeamRef } from '../types'
import { Badge, Field, MatchList, Modal, ShareButton, Status } from '../ui'

export function Teams() {
  const { user } = useAuth()
  const nav = useNavigate()
  const { data, error, loading } = useApi<TeamRef[]>('/teams')
  const { data: mine } = useApi<TeamRef[]>(user ? '/me/teams' : null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [shortName, setShort] = useState('')
  const [homeGround, setGround] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const create = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const { id } = await api<{ id: string }>('POST', '/teams', { name, shortName: shortName || null, homeGround: homeGround || null })
      nav(`/teams/${id}`)
    } catch (x) { setErr(errorText(x)) }
  }
  const grid = (list: TeamRef[]) => (
    <div className="grid thirds">
      {list.map((t) => <Link key={t.id} to={`/teams/${t.id}`} className="card row"><Badge team={t} large /><span className="strong truncate" style={{ fontWeight: 800 }}>{t.name}</span></Link>)}
    </div>
  )
  return (
    <div className="page">
      <div className="page-head"><h1>Teams</h1><button className="btn primary" onClick={() => (user ? setOpen(true) : nav('/login?next=/teams'))}><Plus size={16} />New team</button></div>
      <Status loading={loading} error={error} />
      {mine && mine.length > 0 && <><h2 style={{ margin: '4px 0 10px' }}>Your teams</h2>{grid(mine)}<h2 style={{ margin: '20px 0 10px' }}>All teams</h2></>}
      {data && (data.length ? grid(data) : <div className="card empty">No teams yet. Create one, or start a quick match and teams are made for you.</div>)}
      {open && (
        <Modal title="New team" onClose={() => setOpen(false)}>
          <form className="col" onSubmit={create}>
            <Field label="Team name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
            <Field label="Short name (up to 4 letters)"><input className="input" value={shortName} maxLength={4} onChange={(e) => setShort(e.target.value)} /></Field>
            <Field label="Home ground"><input className="input" value={homeGround} onChange={(e) => setGround(e.target.value)} /></Field>
            {err && <div className="note error">{err}</div>}
            <button className="btn primary">Create team</button>
          </form>
        </Modal>
      )}
    </div>
  )
}

type TeamView = {
  team: TeamRef & { homeGround: string | null }; canEdit: boolean; players: Player[]
  record: { played: number; won: number; lost: number; tied: number; noResult: number }; matches: MatchSummary[]
}

export function TeamPage() {
  const { id } = useParams()
  const { data, error, loading, reload } = useApi<TeamView>(`/teams/${id}`)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [hand, setHand] = useState('')
  const [style, setStyle] = useState('')
  const [err, setErr] = useState<string | null>(null)
  if (!data) return <div className="page"><Status loading={loading} error={error} /></div>
  const add = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api('POST', `/teams/${id}/players`, { name, playerRole: role || null, battingHand: hand || null, bowlingStyle: style || null })
      setName(''); setErr(null); await reload()
    } catch (x) { setErr(errorText(x)) }
  }
  const remove = async (pid: string) => { try { await api('DELETE', `/teams/${id}/players/${pid}`); await reload() } catch (x) { setErr(errorText(x)) } }
  const r = data.record
  return (
    <div className="page">
      <div className="page-head">
        <div className="row"><Badge team={data.team} large /><div><h1>{data.team.name}</h1><div className="muted small">{data.team.homeGround || 'No home ground set'}</div></div></div>
        <ShareButton title={data.team.name} />
      </div>
      <div className="grid tiles" style={{ marginBottom: 14 }}>
        {[['Played', r.played], ['Won', r.won], ['Lost', r.lost], ['Tied / NR', `${r.tied} / ${r.noResult}`]].map(([k, v]) => (
          <div key={k} className="card tile"><div className="tile-label">{k}</div><div className="tile-value num">{v}</div></div>
        ))}
      </div>
      <div className="grid halves">
        <div className="card">
          <div className="card-head"><h2>Squad</h2><span className="muted small">{data.players.length} players</span></div>
          {data.players.map((p) => (
            <div key={p.id} className="row between" style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <Link to={`/players/${p.id}`} className="grow"><div className="strong" style={{ fontWeight: 700 }}>{p.name}</div>
                <div className="small muted">{[p.playerRole, p.battingHand && `${p.battingHand} bat`, p.bowlingStyle].filter(Boolean).join(' · ') || 'Name only'}</div></Link>
              {data.canEdit && <button className="btn sm danger" onClick={() => remove(p.id)}>Remove</button>}
            </div>
          ))}
          {!data.players.length && <div className="muted">No players yet.</div>}
          {data.canEdit && (
            <form className="col" style={{ marginTop: 14 }} onSubmit={add}>
              <Field label="Add a player (name is enough)"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></Field>
              <div className="form-grid">
                <select className="input" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
                  <option value="">Role…</option><option>Batter</option><option>Bowler</option><option>All-rounder</option><option>Wicketkeeper</option></select>
                <select className="input" value={hand} onChange={(e) => setHand(e.target.value)} aria-label="Batting hand">
                  <option value="">Batting hand…</option><option>Right</option><option>Left</option></select>
              </div>
              <input className="input" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Bowling style, e.g. Right-arm off spin" aria-label="Bowling style" />
              {err && <div className="note error">{err}</div>}
              <button className="btn"><Plus size={16} />Add player</button>
            </form>
          )}
        </div>
        <div className="card flush"><div className="card-head"><h2>Matches</h2></div><MatchList matches={data.matches} empty="No matches yet." /></div>
      </div>
    </div>
  )
}

type PlayerView = { player: Player; teams: TeamRef[]; stats: Career; matches: MatchSummary[]; canEdit: boolean }

export function PlayerPage() {
  const { id } = useParams()
  const { data, error, loading } = useApi<PlayerView>(`/players/${id}`)
  if (!data) return <div className="page"><Status loading={loading} error={error} /></div>
  const s = data.stats, p = data.player
  const f = (v: number | null) => (v === null ? '–' : v.toFixed(2))
  const overs = `${Math.floor(s.bowlBalls / 6)}.${s.bowlBalls % 6}`
  const block = (title: string, rows: [string, string | number][]) => (
    <div className="card">
      <div className="card-head"><h2>{title}</h2></div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))' }}>
        {rows.map(([k, v]) => <div key={k}><div className="small dim" style={{ fontWeight: 700 }}>{k}</div><div className="num" style={{ fontSize: 20, fontWeight: 800 }}>{v}</div></div>)}
      </div>
    </div>
  )
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{p.name}</h1>
          <div className="muted small">{[p.playerRole, p.battingHand && `${p.battingHand}-hand bat`, p.bowlingStyle].filter(Boolean).join(' · ') || 'Player'}
            {data.teams.map((t) => <span key={t.id}> · <Link className="brand" to={`/teams/${t.id}`}>{t.name}</Link></span>)}</div></div>
        <ShareButton title={p.name} />
      </div>
      <div className="col" style={{ gap: 14 }}>
        {block('Batting', [['Matches', s.matches], ['Innings', s.innings], ['Not outs', s.notOuts], ['Runs', s.runs], ['Highest', s.highestScore ?? '–'], ['Average', f(s.average)],
          ['Strike rate', f(s.strikeRate)], ['30s', s.thirties], ['50s', s.fifties], ['100s', s.hundreds], ['4s', s.fours], ['6s', s.sixes]])}
        {block('Bowling', [['Overs', overs], ['Maidens', s.maidens], ['Runs', s.conceded], ['Wickets', s.wickets], ['Best', s.best ?? '–'], ['Average', f(s.bowlingAverage)],
          ['Economy', f(s.economy)], ['Strike rate', f(s.bowlingStrikeRate)]])}
        {block('Fielding', [['Catches', s.catches], ['Run outs', s.runOuts], ['Stumpings', s.stumpings]])}
        <div className="card flush"><div className="card-head"><h2>Recent matches</h2></div><MatchList matches={data.matches} empty="No matches yet." /></div>
      </div>
    </div>
  )
}
