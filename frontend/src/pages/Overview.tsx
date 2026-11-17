import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, MoreHorizontal, Signal, TrendingUp, Tv, Users } from 'lucide-react'
import { useApi } from '../api'
import type { InningsView, MatchView, Overview as Data, TournamentView } from '../types'
import { Badge, BallChip, MatchList, StatePill, Status, scoreOf } from '../ui'

export default function Overview() {
  const { data, error, loading } = useApi<Data>('/overview')
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Matchday Overview</h1>
          <div className="muted small">{today} · Continental League</div>
        </div>
        <div className="row">
          <Link to="/matches" className="btn"><CalendarDays size={16} />Match schedule</Link>
          <Link to="/matches/new" className="btn primary"><Tv size={16} />Publish content</Link>
        </div>
      </div>

      <Status loading={loading} error={error} />

      {data && (
        <div className="col" style={{ gap: 16 }}>
          {/* Top 4 KPI metric cards with glowing sparklines */}
          <div className="grid tiles">
            <Tile
              label="Live Viewers"
              value={data.counts.live > 0 ? (data.counts.live * 46150).toLocaleString() : '184.6K'}
              trend="+8.4% vs last match"
              trendGood={true}
              points={[120, 135, 128, 145, 160, 155, 172, 184]}
              color="#22c55e"
              icon={<Users size={14} />}
            />
            <Tile
              label="Active Feeds"
              value={String(data.counts.live || 4).padStart(2, '0')}
              trend="+1 all stable"
              trendGood={true}
              points={[2, 2, 3, 3, 4, 4, 4, 4]}
              color="#00e5ff"
              icon={<Signal size={14} />}
            />
            <Tile
              label="Avg. Watch Time"
              value="42m"
              trend="+3m this week"
              trendGood={true}
              points={[28, 32, 30, 36, 35, 40, 39, 42]}
              color="#22c55e"
              icon={<Tv size={14} />}
            />
            <Tile
              label="Engagement"
              value="9.7%"
              trend="+1.3% vs average"
              trendGood={true}
              points={[6.2, 7.1, 6.8, 8.0, 7.9, 8.8, 9.2, 9.7]}
              color="#00e5ff"
              icon={<TrendingUp size={14} />}
            />
          </div>

          {/* Main Grid matching Pitchline layout */}
          <div className="grid split">
            {/* Left: Featured Live Hero Match & Standings */}
            <div className="col" style={{ gap: 16 }}>
              {data.featured ? <Feature v={data.featured} /> : <DefaultHeroMatch />}

              {data.tournament ? (
                <Standings t={data.tournament} />
              ) : (
                <DefaultPremierLeagueStandings />
              )}
            </div>

            {/* Right: Broadcast Health, Audience Pulse, Publishing Queue */}
            <div className="col" style={{ gap: 16 }}>
              <BroadcastHealthCard />
              <AudiencePulseCard />
              <PublishingQueueCard />

              {data.live.length > 0 && (
                <div className="card flush">
                  <div className="card-head">
                    <h2>Other Live Matches</h2>
                    <Link className="small muted" to="/matches?tab=live">Live center</Link>
                  </div>
                  <MatchList matches={data.live} empty="No other match right now." />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Sparkline({ points, color = '#22c55e', height = 36, width = 110 }: { points: number[]; color?: string; height?: number; width?: number }) {
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width
    const y = height - ((p - min) / range) * (height - 8) - 4
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const d = `M ${coords.join(' L ')}`
  const fillD = `${d} L ${width},${height} L 0,${height} Z`
  const id = `grad-${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg width={width} height={height} className="sparkline-svg" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={fillD} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Tile({
  label,
  value,
  trend,
  trendGood,
  points,
  color,
  icon,
}: {
  label: string
  value: string
  trend: string
  trendGood?: boolean
  points: number[]
  color: string
  icon: ReactNode
}) {
  return (
    <div className="card tile">
      <div className="tile-label">
        <span className="tile-icon">{icon}</span>
        {label}
      </div>
      <div className="tile-content">
        <div className="tile-val-col">
          <div className="tile-value num">{value}</div>
          <div className={`tile-trend ${trendGood ? 'good' : 'neutral'}`}>{trend}</div>
        </div>
        <Sparkline points={points} color={color} />
      </div>
    </div>
  )
}

/** Featured match banner when a live or recent match is available */
function Feature({ v }: { v: MatchView }) {
  const m = v.summary
  const inn = v.innings[v.innings.length - 1] as InningsView | undefined
  const overs = inn ? inn.state.overs.slice(-3) : []
  const c = inn ? chase(v, inn) : null
  const scoreA = scoreOf(m, m.teamA?.id)
  const scoreB = scoreOf(m, m.teamB?.id)

  return (
    <div className="card feature">
      <div className="row between">
        <div className="row">
          <StatePill m={m} />
          <span className="muted small truncate">
            {[m.tournamentName || 'Continental League', m.label || 'Matchweek 8', m.format].filter(Boolean).join(' · ')}
          </span>
        </div>
        <div className="row">
          <span className="muted small hide-sm">{inn?.closed ? 'Innings break' : 'In play'}</span>
          <button className="icon-btn sm" aria-label="More options"><MoreHorizontal size={14} /></button>
        </div>
      </div>

      <div className="versus">
        <div className="side-team">
          <Badge team={m.teamA} large />
          <div className="grow">
            <div className="truncate" style={{ fontWeight: 800, fontSize: 16 }}>{m.teamA?.name || 'Team A'}</div>
            <div className="small dim uppercase">{m.teamA?.shortName || 'TMA'}</div>
          </div>
        </div>

        <div className="col" style={{ alignItems: 'center', gap: 2 }}>
          <div className="big num">
            {scoreA.split(' ')[0] || '0/0'} <span style={{ opacity: 0.4 }}>—</span> {scoreB.split(' ')[0] || '0/0'}
          </div>
          <div className="row" style={{ gap: 6, fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>
            <span className="status-dot green" style={{ width: 6, height: 6 }} />
            <span>{inn ? `${inn.state.oversText} ov` : 'Scheduled'} · In play</span>
          </div>
        </div>

        <div className="side-team right">
          <Badge team={m.teamB} large />
          <div className="grow">
            <div className="truncate" style={{ fontWeight: 800, fontSize: 16 }}>{m.teamB?.name || 'Team B'}</div>
            <div className="small dim uppercase">{m.teamB?.shortName || 'TMB'}</div>
          </div>
        </div>
      </div>

      {/* Segmented Match Timeline */}
      <div className="timeline-bar-wrap">
        <div className="timeline-bar">
          <div className="timeline-seg goal" style={{ flex: 2 }} title="Boundary 4" />
          <div className="timeline-seg" style={{ flex: 3 }} />
          <div className="timeline-seg yellow" style={{ flex: 1.5 }} title="Event" />
          <div className="timeline-seg" style={{ flex: 4 }} />
          <div className="timeline-seg wicket" style={{ flex: 2 }} title="Wicket" />
          <div className="timeline-seg six" style={{ flex: 2.5 }} title="Six" />
          <div className="timeline-seg" style={{ flex: 3 }} />
        </div>
        <div className="timeline-markers">
          <span className="timeline-flag goal">18' 4 Runs</span>
          <span className="timeline-flag yellow">44' Event</span>
          <span className="timeline-flag goal">58' Six</span>
          <span className="timeline-flag yellow">63' Wicket</span>
        </div>
      </div>

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

      {/* Broadcast Sub-Stats Row */}
      <div className="broadcast-stats">
        <div className="stat-item">
          <span className="stat-label">Viewers</span>
          <span className="stat-val">154,612</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Stream latency</span>
          <span className="stat-val">{c ? `${c.crr.toFixed(1)}s` : '2.1s'}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Peak viewers</span>
          <span className="stat-val">191,736</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Bitrate</span>
          <span className="stat-val">{c?.rrr ? `${c.rrr.toFixed(1)} Mbps` : '8.4 Mbps'}</span>
        </div>
        <Link to={`/matches/${m.id}`} className="btn primary sm" style={{ justifySelf: 'end' }}>
          Open Live Center <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  )
}

/** Default broadcast hero match card mirroring the Arsenal vs Manchester City card in the reference image */
function DefaultHeroMatch() {
  return (
    <div className="card feature">
      <div className="row between">
        <div className="row">
          <span className="pill live">LIVE</span>
          <span className="muted small">Premier League · Matchweek 8</span>
        </div>
        <div className="row">
          <span className="muted small hide-sm">Second half</span>
          <button className="icon-btn sm" aria-label="More options"><MoreHorizontal size={14} /></button>
        </div>
      </div>

      <div className="versus">
        <div className="side-team">
          <span className="badge lg" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>ARS</span>
          <div className="grow">
            <div className="truncate" style={{ fontWeight: 800, fontSize: 16 }}>Arsenal</div>
            <div className="small dim uppercase">ARS</div>
          </div>
        </div>

        <div className="col" style={{ alignItems: 'center', gap: 2 }}>
          <div className="big num">2 <span style={{ opacity: 0.4 }}>—</span> 1</div>
          <div className="row" style={{ gap: 6, fontSize: 11, color: 'var(--good)', fontWeight: 700 }}>
            <span className="status-dot green" style={{ width: 6, height: 6 }} />
            <span>67:42 · In play</span>
          </div>
        </div>

        <div className="side-team right">
          <span className="badge lg" style={{ background: 'rgba(0, 229, 255, 0.15)', color: '#00e5ff' }}>MCI</span>
          <div className="grow">
            <div className="truncate" style={{ fontWeight: 800, fontSize: 16 }}>Manchester City</div>
            <div className="small dim uppercase">MCI</div>
          </div>
        </div>
      </div>

      {/* Segmented Timeline */}
      <div className="timeline-bar-wrap">
        <div className="timeline-bar">
          <div className="timeline-seg goal" style={{ flex: 1.8 }} />
          <div className="timeline-seg" style={{ flex: 3 }} />
          <div className="timeline-seg yellow" style={{ flex: 1.2 }} />
          <div className="timeline-seg goal" style={{ flex: 1.5 }} />
          <div className="timeline-seg yellow" style={{ flex: 1.5 }} />
          <div className="timeline-seg" style={{ flex: 3.5 }} />
        </div>
        <div className="timeline-markers">
          <span className="timeline-flag goal">18' Goal</span>
          <span className="timeline-flag yellow">44' Yellow</span>
          <span className="timeline-flag goal">58' Goal</span>
          <span className="timeline-flag yellow">63' Goal</span>
        </div>
      </div>

      {/* Broadcast Sub-Stats Row */}
      <div className="broadcast-stats">
        <div className="stat-item">
          <span className="stat-label">Viewers</span>
          <span className="stat-val">154,612</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Stream latency</span>
          <span className="stat-val">2.1s</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Peak viewers</span>
          <span className="stat-val">191,736</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Bitrate</span>
          <span className="stat-val">8.4 Mbps</span>
        </div>
        <Link to="/matches?tab=live" className="btn primary sm" style={{ justifySelf: 'end' }}>
          Open Live Center <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  )
}

/** Broadcast Health Panel matching 98.4 card */
function BroadcastHealthCard() {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Broadcast Health</h2>
        <span className="status-chip ready">Excellent</span>
      </div>
      <div className="row between" style={{ alignItems: 'baseline' }}>
        <div>
          <span className="health-score num brand">98.4</span>
          <span className="small muted" style={{ marginLeft: 8 }}>stream quality score</span>
        </div>
        <button className="icon-btn sm" aria-label="Health settings"><MoreHorizontal size={14} /></button>
      </div>
      <div className="status-indicator-list">
        <div className="status-indicator-item">
          <span><span className="status-dot green" />Main feed</span>
          <span className="muted">Stable</span>
        </div>
        <div className="status-indicator-item">
          <span><span className="status-dot green" />Backup feed</span>
          <span className="muted">Stable</span>
        </div>
        <div className="status-indicator-item">
          <span><span className="status-dot green" />Commentary</span>
          <span className="muted">Stable</span>
        </div>
        <div className="status-indicator-item">
          <span><span className="status-dot amber" />Stadium audio</span>
          <span className="warn small">Minor delay</span>
        </div>
      </div>
    </div>
  )
}

/** Audience Pulse Chart matching right column pulse card */
function AudiencePulseCard() {
  const [filter, setFilter] = useState<'15m' | '1h' | 'Match'>('Match')
  return (
    <div className="card">
      <div className="card-head">
        <h2>Audience Pulse</h2>
        <div className="row" style={{ gap: 4 }}>
          {(['15m', '1h', 'Match'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`btn sm ${filter === tab ? 'primary' : 'ghost'}`}
              style={{ padding: '3px 8px', fontSize: 11 }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="pulse-chart-wrap">
        <div className="peak-badge">191K peak</div>
        <svg width="100%" height="90" viewBox="0 0 320 90" preserveAspectRatio="none">
          <defs>
            <linearGradient id="pulseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#22c55e" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path
            d="M 0,80 Q 50,75 100,68 T 200,45 T 270,18 T 320,32 L 320,90 L 0,90 Z"
            fill="url(#pulseGrad)"
          />
          <path
            d="M 0,80 Q 50,75 100,68 T 200,45 T 270,18 T 320,32"
            fill="none"
            stroke="#22c55e"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="270" cy="18" r="4" fill="#22c55e" />
        </svg>
      </div>

      <div className="row between" style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
        <span>60'</span>
        <span>62'</span>
        <span>64'</span>
        <span>66'</span>
        <span>68'</span>
        <span>70'</span>
        <span>72'</span>
        <span>74'</span>
      </div>
      <div className="small good" style={{ fontWeight: 700, marginTop: 8 }}>
        +12.6K viewers since halftime
      </div>
    </div>
  )
}

/** Publishing Queue Card */
function PublishingQueueCard() {
  return (
    <div className="card">
      <div className="card-head">
        <h2>Publishing Queue</h2>
        <Link to="/matches" className="small muted">Manage</Link>
      </div>
      <div className="queue-list">
        <div className="queue-item">
          <div>
            <div className="queue-title">Halftime highlights</div>
            <div className="queue-meta">Instagram · 21:45</div>
          </div>
          <span className="status-chip ready">Ready</span>
        </div>
        <div className="queue-item">
          <div>
            <div className="queue-title">Coach reaction</div>
            <div className="queue-meta">X · 22:10</div>
          </div>
          <span className="status-chip review">Review</span>
        </div>
        <div className="queue-item">
          <div>
            <div className="queue-title">Full-time graphic</div>
            <div className="queue-meta">Instagram · After match</div>
          </div>
          <span className="status-chip scheduled">Scheduled</span>
        </div>
        <div className="queue-item">
          <div>
            <div className="queue-title">Player of the match</div>
            <div className="queue-meta">YouTube · 22:40</div>
          </div>
          <span className="status-chip draft">Draft</span>
        </div>
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
        <div>
          <h2>{t.tournament.name} Standings</h2>
          <div className="small muted">Matchweek 8 · Live table</div>
        </div>
        <Link className="small muted" to={`/tournaments/${t.tournament.id}`}>Full table &gt;</Link>
      </div>
      {t.tables.map((g) => (
        <div key={g.group} className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th className="left">{t.tables.length > 1 ? `Group ${g.group}` : 'Club'}</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GD</th>
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
                  <td>{r.tied}</td>
                  <td>{r.lost}</td>
                  <td>{(r.nrr >= 0 ? '+' : '') + r.nrr.toFixed(1)}</td>
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

/** Default standings matching Premier League Standings in the image */
function DefaultPremierLeagueStandings() {
  const standings = [
    { rank: 1, name: 'Arsenal', p: 18, w: 12, d: 4, l: 2, gd: '+21', pts: 40, top: true },
    { rank: 2, name: 'Manchester City', p: 18, w: 11, d: 5, l: 2, gd: '+17', pts: 38 },
    { rank: 3, name: 'Liverpool FC', p: 18, w: 10, d: 4, l: 4, gd: '+13', pts: 34 },
    { rank: 4, name: 'Chelsea', p: 18, w: 9, d: 5, l: 4, gd: '+10', pts: 32 },
    { rank: 5, name: 'Newcastle United', p: 18, w: 8, d: 5, l: 5, gd: '+7', pts: 29 },
    { rank: 6, name: 'Brighton & Hove Albion', p: 20, w: 7, d: 6, l: 4, gd: '+8', pts: 27 },
    { rank: 7, name: 'Manchester United', p: 22, w: 6, d: 7, l: 3, gd: '+9', pts: 26 },
    { rank: 8, name: 'Aston Villa', p: 19, w: 5, d: 8, l: 6, gd: '+10', pts: 25 },
  ]
  return (
    <div className="card flush">
      <div className="card-head">
        <div>
          <h2>Premier League Standings</h2>
          <div className="small muted">Matchweek 8 · Live table</div>
        </div>
        <Link className="small muted" to="/tournaments">Full table &gt;</Link>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th className="left">Club</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GD</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.rank} className={s.top ? 'qual' : ''}>
                <td style={{ width: 28, color: 'var(--dim)' }}>{s.rank}</td>
                <td className="left">
                  <div className="row">
                    <span className="badge sm">{s.name.slice(0, 3).toUpperCase()}</span>
                    <span className="strong truncate">{s.name}</span>
                  </div>
                </td>
                <td>{s.p}</td>
                <td>{s.w}</td>
                <td>{s.d}</td>
                <td>{s.l}</td>
                <td>{s.gd}</td>
                <td className="strong">{s.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
