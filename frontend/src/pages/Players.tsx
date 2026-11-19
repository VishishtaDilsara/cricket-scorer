import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useApi } from '../api'
import { useAuth } from '../auth'
import type { Player, TeamRef } from '../types'
import { Badge, SignInPrompt, Status, initials } from '../ui'

type Squad = { team: TeamRef | null; players: Player[] }

/** Every player in the admin's space, grouped by team. */
export default function Players() {
  const { user, ready } = useAuth()
  const { data, error, loading } = useApi<Squad[]>(user ? '/squads' : null)
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const squads = (data ?? [])
    .map((s) => ({ ...s, players: needle && !s.team?.name.toLowerCase().includes(needle) ? s.players.filter((p) => p.name.toLowerCase().includes(needle)) : s.players }))
    .filter((s) => !needle || s.players.length > 0)
  const total = new Set((data ?? []).flatMap((s) => s.players.map((p) => p.id))).size
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Players</h1>{data && <div className="muted small">{total} {total === 1 ? 'player' : 'players'} in {data.filter((s) => s.team).length} teams</div>}</div>
        {data && total > 0 && (
          <label className="search" style={{ maxWidth: 280 }}>
            <Search size={15} />
            <input placeholder="Filter by player or team" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter players" />
          </label>
        )}
      </div>
      {ready && !user && <SignInPrompt what="players" />}
      <Status loading={loading} error={error} />
      {data && !total && <div className="card empty">No players yet. Open a team and add players to it.</div>}
      {data && total > 0 && !squads.length && <div className="card empty">No player or team matches “{q}”.</div>}
      <div className="col" style={{ gap: 14 }}>
        {squads.map((s) => (
          <div key={s.team?.id ?? 'none'} className="card">
            <div className="card-head">
              {s.team ? (
                <Link to={`/teams/${s.team.id}`} className="row"><Badge team={s.team} /><h2>{s.team.name}</h2></Link>
              ) : <h2>Not in a team</h2>}
              <span className="pill">{s.players.length} {s.players.length === 1 ? 'player' : 'players'}</span>
            </div>
            {!s.players.length && <div className="muted small">No players in this team yet.</div>}
            <div className="player-grid">
              {s.players.map((p) => (
                <Link key={p.id} to={`/players/${p.id}`} className="player-tile">
                  <span className="avatar">{initials(p.name)}</span>
                  <span className="grow" style={{ minWidth: 0 }}>
                    <span className="strong truncate" style={{ display: 'block' }}>{p.name}</span>
                    <span className="small muted truncate" style={{ display: 'block' }}>{[p.playerRole, p.battingHand && `${p.battingHand}-hand bat`, p.bowlingStyle].filter(Boolean).join(' · ') || 'Player'}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
