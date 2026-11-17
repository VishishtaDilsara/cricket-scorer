import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Share2, X } from 'lucide-react'
import type { MatchSummary, TeamRef } from './types'

const HUES = [199, 162, 262, 28, 340, 48, 215, 130]
function hue(text: string) {
  let h = 0
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return HUES[h % HUES.length]
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/)
  return (words.length > 1 ? words.map((w) => w[0]).join('') : name).slice(0, 3).toUpperCase()
}

export function Badge({ team, large }: { team: TeamRef | null; large?: boolean }) {
  const text = team ? team.shortName || initials(team.name) : '?'
  const h = hue(team?.name ?? '?')
  return (
    <span className={`badge ${large ? 'lg' : ''}`} style={{ background: `hsl(${h} 60% 18%)`, color: `hsl(${h} 90% 78%)` }}>
      {text}
    </span>
  )
}

/** "G:A:1" -> "A1", "W:SF1" -> "Winner SF1": what a knockout slot is waiting for. */
export function sourceLabel(source: string | null) {
  if (!source) return 'TBD'
  const [kind, a, b] = source.split(':')
  if (kind === 'G') return a === 'League' ? `League #${b}` : `${a}${b}`
  if (kind === 'W') return `Winner ${a}`
  return 'TBD'
}

export function StatePill({ m }: { m: Pick<MatchSummary, 'state'> }) {
  switch (m.state) {
    case 'LIVE': return <span className="pill live">Live</span>
    case 'INNINGS_BREAK': return <span className="pill live">Innings break</span>
    case 'COMPLETED': return <span className="pill good">Result</span>
    case 'ABANDONED': return <span className="pill warn">Abandoned</span>
    case 'CANCELLED': return <span className="pill bad">Cancelled</span>
    default: return <span className="pill">Upcoming</span>
  }
}

export function fmtDate(iso: string | null, withTime = true) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) +
    (withTime ? ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '')
}

export function scoreOf(m: MatchSummary, teamId: string | undefined) {
  const s = m.scores.find((x) => x.teamId === teamId)
  return s ? `${s.runs}/${s.wickets} (${s.overs})` : ''
}

export function MatchRow({ m }: { m: MatchSummary }) {
  const line = (team: TeamRef | null, source: string | null) => {
    const lost = m.winnerId !== null && team !== null && m.winnerId !== team.id
    return (
      <div className={`team-line ${lost ? 'lose' : ''}`}>
        <Badge team={team} />
        <span className="truncate">{team ? team.name : sourceLabel(source)}</span>
        <span className="score">{scoreOf(m, team?.id)}</span>
      </div>
    )
  }
  return (
    <Link to={`/matches/${m.id}`} className="match-row">
      <div className="teams">{line(m.teamA, m.sourceA)}{line(m.teamB, m.sourceB)}</div>
      <StatePill m={m} />
      <div className="meta">
        {m.resultText ? <span className="brand">{m.resultText}</span> : <span>{fmtDate(m.scheduledAt)}</span>}
        {m.label && <span>· {m.label}</span>}
        {m.tournamentName && <span>· {m.tournamentName}</span>}
        {m.ground && <span>· {m.ground}</span>}
      </div>
    </Link>
  )
}

export function MatchList({ matches, empty }: { matches: MatchSummary[]; empty: string }) {
  if (!matches.length) return <div className="empty">{empty}</div>
  return <div>{matches.map((m) => <MatchRow key={m.id} m={m} />)}</div>
}

export function ballClass(label: string) {
  if (label.includes('W')) return 'wicket'
  if (/wd|nb|lb|b$|^\+/.test(label)) return 'extra'
  if (label === '6') return 'six'
  if (label === '4') return 'four'
  if (label === '0') return 'dot'
  return ''
}

export function BallChip({ label }: { label: string }) {
  return <span className={`ball ${ballClass(label)}`}>{label === '0' ? '•' : label}</span>
}

export function Modal({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>}
        </div>
        {children}
      </div>
    </div>
  )
}

export function ShareButton({ title }: { title: string }) {
  const [done, setDone] = useState(false)
  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title, url })
      else { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 2000) }
    } catch { /* cancelled */ }
  }
  return (
    <button className="btn" onClick={share}>
      {done ? <Check size={16} /> : <Share2 size={16} />} {done ? 'Link copied' : 'Share'}
    </button>
  )
}

export function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <div className="note error">{error}</div>
  if (loading) return <div className="empty">Loading…</div>
  return null
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field">{label}{children}</label>
}
