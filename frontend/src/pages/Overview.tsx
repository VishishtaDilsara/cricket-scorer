import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, CheckCircle2, Plus, Radio, Shield, Users } from 'lucide-react'
import { useApi } from '../api'
import { useAuth } from '../auth'
import type { InningsView, MatchView, Overview as Data, TournamentView } from '../types'
import { Badge, BallChip, MatchList, ShareButton, SignInPrompt, StatePill, Status, fmtDate, scoreOf } from '../ui'

export default function Overview() {
  const { user, ready } = useAuth()
  const { data, error, loading } = useApi<Data>(user ? '/overview' : null)
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <div className="muted small">{today}</div>
        </div>
        <div className="row">
          <Link to="/matches" className="btn"><CalendarDays size={16} />Fixtures</Link>
          {user?.admin && <Link to="/matches/new" className="btn primary"><Plus size={16} />Start a match</Link>}
        </div>
      </div>

      {ready && !user && <SignInPrompt what="matches, teams and tournaments" />}
      <Status loading={loading} error={error} />

      {data && (
        <div className="col" style={{ gap: 16 }}>
          <div className="grid tiles">
            <Tile label="Live now" value={data.counts.live} icon={<Radio size={14} />} to="/matches?tab=live" />
            <Tile label="Completed matches" value={data.counts.completed} icon={<CheckCircle2 size={14} />} to="/matches" />
            <Tile label="Teams" value={data.counts.teams} icon={<Shield size={14} />} to="/teams" />
            <Tile label="Players" value={data.counts.players} icon={<Users size={14} />} to="/players" />
          </div>

          <div className="grid split">
            <div className="col" style={{ gap: 16 }}>
              {data.featured ? <Feature v={data.featured} /> : (
                <div className="card empty">No matches yet.{user?.admin && <> <Link className="brand" to="/matches/new">Start a match</Link> and it will show up here.</>}</div>
              )}
              {data.tournament && <Standings t={data.tournament} />}
            </div>

            <div className="col" style={{ gap: 16 }}>
              <div className="card flush">
                <div className="card-head"><h2>Live matches</h2><Link className="small muted" to="/matches?tab=live">Live center</Link></div>
                <MatchList matches={data.live} empty="No match is live right now." />
              </div>
              <div className="card flush">
                <div className="card-head"><h2>Upcoming</h2><Link className="small muted" to="/matches">Fixtures</Link></div>
                <MatchList matches={data.upcoming} empty="No upcoming matches scheduled." />
              </div>
              <div className="card flush">
                <div className="card-head"><h2>Recent results</h2><Link className="small muted" to="/matches">All matches</Link></div>
                <MatchList matches={data.recent} empty="No completed matches yet." />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Tile({ label, value, icon, to }: { label: string; value: number; icon: ReactNode; to: string }) {
  return (
    <Link to={to} className="card tile">
      <div className="tile-label"><span className="tile-icon">{icon}</span>{label}</div>
      <div className="tile-value num">{value.toLocaleString()}</div>
    </Link>
  )
}

/** The live match, or the most recent result, with a share link for the audience. */
function Feature({ v }: { v: MatchView }) {
  const m = v.summary
  const inn = v.innings[v.innings.length - 1] as InningsView | undefined
  const overs = inn ? inn.state.overs.slice(-3) : []
  const live = m.state === 'LIVE' || m.state === 'INNINGS_BREAK'
  const c = inn && live ? chase(v, inn) : null
  const batting = inn && [m.teamA, m.teamB].find((t) => t?.id === inn.battingTeamId)
  const url = `${window.location.origin}/matches/${m.id}`

  return (
    <div className="card feature">
      <div className="row between wrap">
        <div className="row wrap">
          <StatePill m={m} />
          <span className="muted small truncate">{[m.tournamentName, m.label, m.format, fmtDate(m.scheduledAt)].filter(Boolean).join(' · ')}</span>
        </div>
        <ShareButton title={`${m.teamA?.name ?? 'TBD'} v ${m.teamB?.name ?? 'TBD'}`} url={url} />
      </div>

      <div className="versus">
        {[m.teamA, m.teamB].map((t, i) => (
          <div key={i} className={`side-team ${i ? 'right' : ''}`} style={i ? { gridColumn: 3 } : undefined}>
            <Badge team={t} large />
            <div className="grow">
              <div className="truncate" style={{ fontWeight: 800, fontSize: 16 }}>{t?.name ?? 'To be decided'}</div>
              <div className="big num">{scoreOf(m, t?.id).split(' ')[0] || '–'}</div>
              <div className="small muted">{scoreOf(m, t?.id).split(' ')[1]}</div>
            </div>
          </div>
        ))}
        <div className="mid" style={{ gridColumn: 2, gridRow: 1 }}>VS</div>
      </div>

      {m.resultText ? <div className="brand" style={{ fontWeight: 800 }}>{m.resultText}</div>
        : c && inn && inn.target !== null ? <div style={{ fontWeight: 700 }}>{batting?.name} need <span className="brand">{c.need}</span> from {c.left} balls · Target {inn.target}</div>
        : c ? <div className="muted">Run rate {c.crr.toFixed(2)}</div> : null}

      {overs.length > 0 && (
        <div className="strip" style={{ marginTop: 8 }} aria-label="Recent overs">
          {overs.map((o, i) => (
            <span key={o.number} className="row" style={{ gap: 5 }}>
              {i > 0 && <span className="over-sep" />}
              {o.balls.map((b, k) => <BallChip key={k} label={b} />)}
            </span>
          ))}
        </div>
      )}

      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <Link to={`/matches/${m.id}`} className="btn primary sm">{live ? 'Open live scorecard' : 'Open scorecard'} <ArrowUpRight size={14} /></Link>
      </div>
    </div>
  )
}

/** Standings from real tournament data */
export function Standings({ t, limit }: { t: TournamentView; limit?: number }) {
  if (!t.tables.length) return null
  return (
    <div className="card flush">
      <div className="card-head">
        <h2>{t.tournament.name} standings</h2>
        <Link className="small muted" to={`/tournaments/${t.tournament.id}`}>Full table &gt;</Link>
      </div>
      {t.tables.map((g) => (
        <div key={g.group} className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th className="left">{t.tables.length > 1 ? `Group ${g.group}` : 'Team'}</th>
                <th>P</th>
                <th>W</th>
                <th>L</th>
                <th>T</th>
                <th>NR</th>
                <th>NRR</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.slice(0, limit ?? 8).map((r, i) => (
                <tr key={r.teamId} className={i === 0 ? 'qual' : ''}>
                  <td style={{ width: 28, color: 'var(--dim)' }}>{i + 1}</td>
                  <td className="left">
                    <Link to={`/teams/${r.teamId}`} className="row">
                      <Badge team={{ id: r.teamId, name: r.name, shortName: r.shortName }} />
                      <span className="strong truncate">{r.name}</span>
                      {r.mark === 'Q' && <span className="pill brand">Q</span>}
                    </Link>
                  </td>
                  <td>{r.played}</td>
                  <td>{r.won}</td>
                  <td>{r.lost}</td>
                  <td>{r.tied}</td>
                  <td>{r.noResult}</td>
                  <td>{(r.nrr >= 0 ? '+' : '') + r.nrr.toFixed(3)}</td>
                  <td className="strong">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export function chase(v: MatchView, inn: InningsView) {
  const bpo = v.rules.ballsPerOver
  const quota = (inn.revisedOvers ?? v.rules.overs) * bpo
  const left = Math.max(0, quota - inn.state.legalBalls)
  const crr = inn.state.legalBalls ? (inn.state.runs * bpo) / inn.state.legalBalls : 0
  const need = inn.target !== null ? Math.max(0, inn.target - inn.state.runs) : null
  const rrr = need !== null && left > 0 ? (need * bpo) / left : null
  return { left, crr, need, rrr }
}
