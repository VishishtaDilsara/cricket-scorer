import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Award, Pencil, Settings } from 'lucide-react'
import { api, errorText, streamUrl, useApi } from '../api'
import type { InningsView, MatchView } from '../types'
import { Badge, BallChip, Field, Modal, ShareButton, StatePill, Status, fmtDate, scoreOf } from '../ui'
import { chase } from './Overview'

export default function MatchPage() {
  const { id } = useParams()
  const { data: v, error, loading, reload } = useApi<MatchView>(`/matches/${id}`)
  const [tab, setTab] = useState<'live' | 'scorecard' | 'overs'>('live')
  const [manage, setManage] = useState(false)

  // Live updates: the server pushes an event the moment a ball is committed (FR-LIVE-02).
  useEffect(() => {
    const es = new EventSource(streamUrl(id!))
    es.addEventListener('update', () => void reload())
    const poll = window.setInterval(() => void reload(), 20000) // safety net if the stream is blocked
    return () => { es.close(); window.clearInterval(poll) }
  }, [id, reload])

  if (!v) return <div className="page"><Status loading={loading} error={error} /></div>
  const m = v.summary
  const cur = v.innings[v.innings.length - 1] as InningsView | undefined
  const teamName = (tid: string) => (v.teamA?.id === tid ? v.teamA.name : v.teamB?.name) ?? ''
  const live = m.state === 'LIVE' || m.state === 'INNINGS_BREAK'
  const toss = v.tossWinnerId ? `${teamName(v.tossWinnerId)} won the toss and chose to ${v.tossDecision === 'BAT' ? 'bat' : 'bowl'}` : null

  return (
    <div className="page">
      <div className="card feature" style={{ marginBottom: 14 }}>
        <div className="row between wrap">
          <div className="row wrap"><StatePill m={m} />
            <span className="muted small">{[m.label, m.format, m.ground, fmtDate(m.scheduledAt)].filter(Boolean).join(' · ')}</span>
            {m.tournamentId && <Link className="small brand" to={`/tournaments/${m.tournamentId}`}>{m.tournamentName}</Link>}
          </div>
          <div className="row wrap">
            <ShareButton title={`${m.teamA?.name ?? 'TBD'} v ${m.teamB?.name ?? 'TBD'}`} />
            {v.canManage && <button className="btn" onClick={() => setManage(true)}><Settings size={16} />Manage</button>}
            {v.canScore && m.teamA && m.teamB && <Link to={`/matches/${m.id}/score`} className="btn primary"><Pencil size={16} />{m.state === 'SCHEDULED' ? 'Start scoring' : 'Score'}</Link>}
          </div>
        </div>
        <div className="versus">
          {[m.teamA, m.teamB].map((t, i) => (
            <div key={i} className={`side-team ${i ? 'right' : ''}`} style={i ? { gridColumn: 3 } : undefined}>
              <Badge team={t} large />
              <div className="grow">
                {t ? <Link to={`/teams/${t.id}`} className="truncate" style={{ fontWeight: 800, fontSize: 16, display: 'block' }}>{t.name}</Link> : <div className="muted">To be decided</div>}
                <div className="big">{scoreOf(m, t?.id).split(' ')[0] || '–'}</div>
                <div className="small muted">{scoreOf(m, t?.id).split(' ')[1]}</div>
              </div>
            </div>
          ))}
          <div className="mid" style={{ gridColumn: 2, gridRow: 1 }}>VS</div>
        </div>
        {m.resultText ? <div className="brand" style={{ fontWeight: 800 }}>{m.resultText}{v.overrideReason ? <span className="muted small"> · {v.overrideReason}</span> : null}</div>
          : cur && cur.target !== null && live ? <ChaseLine v={v} inn={cur} team={teamName(cur.battingTeamId)} />
          : toss ? <div className="muted">{toss}</div> : <div className="muted">Match has not started.</div>}
      </div>

      <div className="tabs">
        {(['live', 'scorecard', 'overs'] as const).map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'live' ? 'Summary' : t === 'scorecard' ? 'Scorecard' : 'Ball by ball'}</button>
        ))}
      </div>
      {!cur && <div className="card empty">The scorecard appears here as soon as the first ball is recorded. This page updates by itself.</div>}
      {cur && tab === 'live' && <Summary v={v} inn={cur} toss={toss} />}
      {tab === 'scorecard' && v.innings.map((inn) => <Scorecard key={inn.no} inn={inn} team={teamName(inn.battingTeamId)} perOver={v.rules.ballsPerOver} />)}
      {tab === 'overs' && [...v.innings].reverse().map((inn) => <Overs key={inn.no} inn={inn} team={teamName(inn.battingTeamId)} />)}
      {manage && <Manage v={v} onClose={() => { setManage(false); void reload() }} />}
    </div>
  )
}

function ChaseLine({ v, inn, team }: { v: MatchView; inn: InningsView; team: string }) {
  const c = chase(v, inn)
  return <div style={{ fontWeight: 700 }}>{team} need <span className="brand">{c.need}</span> from {c.left} balls · Target {inn.target}{c.rrr !== null ? ` · Required rate ${c.rrr.toFixed(2)}` : ''}</div>
}

function Summary({ v, inn, toss }: { v: MatchView; inn: InningsView; toss: string | null }) {
  const st = inn.state
  const atCrease = st.batters.filter((b) => b.playerId === inn.strikerId || b.playerId === inn.nonStrikerId)
  const bowler = st.bowlers.find((b) => b.playerId === inn.bowlerId) ?? st.bowlers[st.bowlers.length - 1]
  const c = chase(v, inn)
  const stand = st.partnerships[st.partnerships.length - 1]
  const lastSix = st.overs.flatMap((o) => o.balls).slice(-6)
  return (
    <div className="grid split">
      <div className="col" style={{ gap: 14 }}>
        <div className="card flush">
          <div className="card-head"><h2>At the crease</h2>{st.freeHitNext && !inn.closed && <span className="pill warn">Free hit</span>}</div>
          <div className="table-scroll"><table className="table">
            <thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
            <tbody>
              {(inn.closed ? [] : atCrease).map((b) => (
                <tr key={b.playerId}><td><Link to={`/players/${b.playerId}`} className="strong">{b.name}{b.playerId === inn.strikerId ? ' *' : ''}</Link></td>
                  <td className="strong">{b.runs}</td><td>{b.balls}</td><td>{b.fours}</td><td>{b.sixes}</td><td>{b.balls ? ((b.runs * 100) / b.balls).toFixed(1) : '–'}</td></tr>
              ))}
              {(inn.closed || !atCrease.length) && <tr><td colSpan={6} className="muted">{inn.closed ? 'Innings complete' : 'Waiting for the batters'}</td></tr>}
            </tbody>
          </table></div>
          {bowler && !inn.closed && (
            <div className="table-scroll"><table className="table">
              <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
              <tbody><tr><td><Link to={`/players/${bowler.playerId}`} className="strong">{bowler.name}</Link></td><td>{oversOf(bowler.balls, v.rules.ballsPerOver)}</td><td>{bowler.maidens}</td><td>{bowler.runs}</td><td className="strong">{bowler.wickets}</td><td>{econ(bowler.runs, bowler.balls, v.rules.ballsPerOver)}</td></tr></tbody>
            </table></div>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h2>Last six balls</h2><span className="small muted">Over {st.oversText}</span></div>
          <div className="strip">{lastSix.length ? lastSix.map((b, i) => <BallChip key={i} label={b} />) : <span className="muted">No balls yet</span>}</div>
          <div className="stat-row">
            <div><div className="k">Run rate</div><div className="v">{c.crr.toFixed(2)}</div></div>
            {c.rrr !== null && !inn.closed && <div><div className="k">Required</div><div className="v">{c.rrr.toFixed(2)}</div></div>}
            {stand && !inn.closed && <div><div className="k">Partnership</div><div className="v">{stand.runs} ({stand.balls})</div></div>}
            <div><div className="k">Extras</div><div className="v">{extras(inn)}</div></div>
          </div>
        </div>
      </div>
      <div className="col" style={{ gap: 14 }}>
      {v.summary.state === 'COMPLETED' && <PlayerOfMatchCard v={v} />}
      <div className="card col">
        <h2>Match info</h2>
        {toss && <div><div className="small dim">Toss</div>{toss}</div>}
        <div><div className="small dim">Format</div>{v.rules.overs} overs · {v.rules.ballsPerOver}-ball overs · {v.rules.playersPerSide} a side</div>
        <div><div className="small dim">Rules</div>Wide {v.rules.wideRuns} · No-ball {v.rules.noBallRuns} · Free hit {v.rules.freeHit ? 'on' : 'off'}{v.rules.lastManStands ? ' · Last man stands' : ''}{v.rules.maxOversPerBowler ? ` · Max ${v.rules.maxOversPerBowler} overs a bowler` : ''}</div>
        {st.fow.length > 0 && <div><div className="small dim">Last wicket</div>{st.fow[st.fow.length - 1].name} at {st.fow[st.fow.length - 1].score}/{st.fow[st.fow.length - 1].wicket} ({st.fow[st.fow.length - 1].over} ov)</div>}
      </div>
      </div>
    </div>
  )
}

type Impact = { playerId: string; name: string; teamId: string | null; points: number; runs: number; balls: number; batted: boolean
  wickets: number; conceded: number; bowled: number; catches: number; runOuts: number; stumpings: number }

/** Every player's contribution across the match, best first. Used to suggest a player of the match. */
function impacts(v: MatchView): Impact[] {
  const bpo = v.rules.ballsPerOver
  const by = new Map<string, Impact>()
  const get = (id: string, name: string, teamId: string | null) => {
    let p = by.get(id)
    if (!p) { p = { playerId: id, name, teamId, points: 0, runs: 0, balls: 0, batted: false, wickets: 0, conceded: 0, bowled: 0, catches: 0, runOuts: 0, stumpings: 0 }; by.set(id, p) }
    if (!p.name && name) p.name = name
    return p
  }
  const squadName = (id: string) => [...(v.teamA?.players ?? []), ...(v.teamB?.players ?? [])].find((p) => p.id === id)?.name ?? ''
  const totalRuns = v.innings.reduce((a, i) => a + i.state.runs, 0)
  const totalBalls = v.innings.reduce((a, i) => a + i.state.legalBalls, 0)
  const parPerBall = totalBalls ? totalRuns / totalBalls : 1
  for (const inn of v.innings) {
    for (const b of inn.state.batters) {
      const p = get(b.playerId, b.name, inn.battingTeamId)
      p.runs += b.runs; p.balls += b.balls; p.batted = p.batted || b.balls > 0
      if (b.fielderId) {
        const f = get(b.fielderId, squadName(b.fielderId), inn.bowlingTeamId)
        if (b.dismissal === 'CAUGHT') f.catches++
        else if (b.dismissal === 'STUMPED') f.stumpings++
        else if (b.dismissal === 'RUN_OUT') f.runOuts++
      }
      if (b.dismissal === 'CAUGHT_AND_BOWLED' && b.bowlerId) get(b.bowlerId, squadName(b.bowlerId), inn.bowlingTeamId).catches++
    }
    for (const b of inn.state.bowlers) {
      const p = get(b.playerId, b.name, inn.bowlingTeamId)
      p.wickets += b.wickets; p.conceded += b.runs; p.bowled += b.balls
      p.points += b.maidens * 8
    }
    for (const b of inn.state.batters) {
      const p = by.get(b.playerId)!
      p.points += b.runs + b.fours + b.sixes * 2 + (b.balls >= bpo ? (b.runs - b.balls) * 0.5 : 0)
    }
  }
  for (const p of by.values()) {
    p.points += p.wickets * 20 + (p.bowled >= bpo ? parPerBall * p.bowled - p.conceded : 0)
    p.points += (p.catches + p.stumpings + p.runOuts) * 8
    if (p.teamId && p.teamId === v.summary.winnerId) p.points += 5
    if (!p.name) p.name = squadName(p.playerId) || 'Unknown'
  }
  return [...by.values()].sort((a, b) => b.points - a.points)
}

function statLine(p: Impact, bpo: number) {
  const parts: string[] = []
  if (p.batted) parts.push(`${p.runs} (${p.balls})`)
  if (p.bowled) parts.push(`${p.wickets}/${p.conceded} in ${oversOf(p.bowled, bpo)} ov`)
  const field = [p.catches && `${p.catches} ct`, p.stumpings && `${p.stumpings} st`, p.runOuts && `${p.runOuts} run out`].filter(Boolean)
  if (field.length) parts.push(field.join(', '))
  return parts.join(' · ')
}

function PlayerOfMatchCard({ v }: { v: MatchView }) {
  const all = impacts(v)
  const chosen = v.playerOfMatchId
  const p = chosen ? all.find((x) => x.playerId === chosen) : all[0]
  const squad = [v.teamA, v.teamB].find((t) => t?.players.some((x) => x.id === chosen))
  const name = p?.name ?? squad?.players.find((x) => x.id === chosen)?.name
  if (!name) return null
  const teamId = p?.teamId ?? squad?.id ?? null
  const team = [v.summary.teamA, v.summary.teamB].find((t) => t?.id === teamId)
  const line = p ? statLine(p, v.rules.ballsPerOver) : ''
  const id = p?.playerId ?? chosen!
  return (
    <div className="card col">
      <div className="card-head"><h2>Player of the match</h2><Award size={20} className="brand" /></div>
      <div className="row" style={{ gap: 12 }}>
        <Badge team={team ?? null} />
        <div className="grow">
          <Link to={`/players/${id}`} className="strong" style={{ fontSize: 17, display: 'block' }}>{name}</Link>
          <div className="small muted">{[team?.name, line].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      {!chosen && <div className="small dim">Picked automatically from the scorecard</div>}
    </div>
  )
}

const oversOf = (balls: number, bpo: number) => `${Math.floor(balls / bpo)}.${balls % bpo}`
const econ = (runs: number, balls: number, bpo: number) => (balls ? ((runs * bpo) / balls).toFixed(2) : '–')
const extras = (inn: InningsView) => inn.state.wides + inn.state.noBalls + inn.state.byes + inn.state.legByes + inn.state.penalties

function Scorecard({ inn, team, perOver }: { inn: InningsView; team: string; perOver: number }) {
  const st = inn.state
  return (
    <div className="card flush" style={{ marginBottom: 14 }}>
      <div className="card-head"><h2>{team} innings</h2><span className="strong num">{st.runs}/{st.wickets} <span className="muted">({st.oversText} ov)</span></span></div>
      <div className="table-scroll"><table className="table">
        <thead><tr><th>Batting</th><th className="left">How out</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
        <tbody>
          {st.batters.map((b) => (
            <tr key={b.playerId}><td><Link to={`/players/${b.playerId}`} className="strong">{b.name}</Link></td><td className="left muted">{b.howOut}</td>
              <td className="strong">{b.runs}</td><td>{b.balls}</td><td>{b.fours}</td><td>{b.sixes}</td><td>{b.balls ? ((b.runs * 100) / b.balls).toFixed(1) : '–'}</td></tr>
          ))}
          <tr><td>Extras</td><td className="left muted">wd {st.wides}, nb {st.noBalls}, b {st.byes}, lb {st.legByes}{st.penalties ? `, pen ${st.penalties}` : ''}</td><td className="strong">{extras(inn)}</td><td colSpan={4} /></tr>
          <tr><td className="strong">Total</td><td className="left muted">{st.wickets} wkts, {st.oversText} overs</td><td className="strong">{st.runs}</td><td colSpan={4} /></tr>
        </tbody>
      </table></div>
      <div className="table-scroll"><table className="table">
        <thead><tr><th>Bowling</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th><th>Wd</th><th>Nb</th></tr></thead>
        <tbody>
          {st.bowlers.map((b) => (
            <tr key={b.playerId}><td><Link to={`/players/${b.playerId}`} className="strong">{b.name}</Link></td><td>{oversOf(b.balls, perOver)}</td><td>{b.maidens}</td><td>{b.runs}</td>
              <td className="strong">{b.wickets}</td><td>{econ(b.runs, b.balls, perOver)}</td><td>{b.wides}</td><td>{b.noBalls}</td></tr>
          ))}
        </tbody>
      </table></div>
      {st.fow.length > 0 && <div style={{ padding: '12px 16px' }}><div className="small dim">Fall of wickets</div>{st.fow.map((f) => `${f.score}/${f.wicket} (${f.name}, ${f.over})`).join(' · ')}</div>}
      {st.partnerships.length > 0 && (
        <div style={{ padding: '0 16px 14px' }}><div className="small dim">Partnerships</div>
          {st.partnerships.map((p, i) => <div key={i} className="row between small" style={{ padding: '3px 0' }}><span>{p.nameA}{p.nameB ? ` & ${p.nameB}` : ''}</span><span className="num">{p.runs} ({p.balls})</span></div>)}
        </div>
      )}
    </div>
  )
}

function Overs({ inn, team }: { inn: InningsView; team: string }) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-head"><h2>{team} innings</h2></div>
      {[...inn.state.overs].reverse().map((o) => (
        <div key={o.number} className="row wrap" style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
          <div style={{ width: 150 }}><div className="strong">Over {o.number}</div><div className="small muted truncate">{o.bowlerName} · {o.runs} run{o.runs === 1 ? '' : 's'}{o.wickets ? `, ${o.wickets} wkt` : ''}</div></div>
          <div className="strip">{o.balls.map((b, i) => <BallChip key={i} label={b} />)}</div>
        </div>
      ))}
      {!inn.state.overs.length && <div className="muted">No balls yet.</div>}
    </div>
  )
}

function Manage({ v, onClose }: { v: MatchView; onClose: () => void }) {
  const nav = useNavigate()
  const m = v.summary
  const { data: scorers, reload } = useApi<{ userId: string; name: string; email: string }[]>(`/matches/${m.id}/scorers`)
  const [email, setEmail] = useState('')
  const [when, setWhen] = useState(m.scheduledAt ? toLocal(m.scheduledAt) : '')
  const [ground, setGround] = useState(m.ground ?? '')
  const [listed, setListed] = useState(v.listed)
  const [resultType, setResultType] = useState('WIN')
  const [winner, setWinner] = useState(m.teamA?.id ?? '')
  const [reason, setReason] = useState('')
  const [pom, setPom] = useState(v.playerOfMatchId ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); setMsg(ok) } catch (e) { setMsg(errorText(e)) }
  }
  const addScorer = (e: FormEvent) => { e.preventDefault(); void run(async () => { await api('POST', `/matches/${m.id}/scorers`, { email }); setEmail(''); await reload() }, 'Scorer added') }
  return (
    <Modal title="Manage match" onClose={onClose}>
      <div className="col" style={{ gap: 16 }}>
        {msg && <div className="note info">{msg}</div>}
        <div className="col">
          <h3>Scorers</h3>
          {scorers?.map((s) => (
            <div key={s.userId} className="row between"><span>{s.name} <span className="muted small">{s.email}</span></span>
              <button className="btn sm danger" onClick={() => run(async () => { await api('DELETE', `/matches/${m.id}/scorers/${s.userId}`); await reload() }, 'Scorer removed')}>Remove</button></div>
          ))}
          {scorers && !scorers.length && <div className="muted small">Only you can score this match so far.</div>}
          <form className="row" onSubmit={addScorer}><input className="input" type="email" placeholder="Scorer's account email" value={email} onChange={(e) => setEmail(e.target.value)} required /><button className="btn">Add</button></form>
        </div>
        <div className="col">
          <h3>Schedule</h3>
          <div className="form-grid">
            <Field label="Date and time"><input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
            <Field label="Ground"><input className="input" value={ground} onChange={(e) => setGround(e.target.value)} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} />Public (listed and searchable). Off = visible only by link.</label>
          <button className="btn" onClick={() => run(() => api('PUT', `/matches/${m.id}`, { scheduledAt: when ? new Date(when).toISOString() : null, ground, listed }), 'Saved')}>Save schedule</button>
        </div>
        <div className="col">
          <h3>Set or override the result</h3>
          <div className="form-grid">
            <Field label="Outcome">
              <select className="input" value={resultType} onChange={(e) => setResultType(e.target.value)}>
                <option value="WIN">Awarded win</option><option value="TIE">Tie</option><option value="NO_RESULT">No result</option><option value="ABANDONED">Abandoned</option>
              </select>
            </Field>
            {resultType === 'WIN' && (
              <Field label="Winner"><select className="input" value={winner} onChange={(e) => setWinner(e.target.value)}>
                {[m.teamA, m.teamB].map((t) => t && <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
            )}
          </div>
          <Field label="Reason (recorded in the audit log)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Walkover, super over, rain" /></Field>
          <button className="btn" disabled={!reason.trim()} onClick={() => run(() => api('POST', `/matches/${m.id}/result`, { resultType, winnerId: resultType === 'WIN' ? winner : null, reason }), 'Result recorded')}>Record result</button>
        </div>
        {m.state === 'COMPLETED' && (
          <div className="col">
            <h3>Player of the match</h3>
            <Field label="Player">
              <select className="input" value={pom} onChange={(e) => setPom(e.target.value)}>
                <option value="">Automatic (best performance on the scorecard)</option>
                {[v.teamA, v.teamB].map((t) => t && (
                  <optgroup key={t.id} label={t.name}>{t.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                ))}
              </select>
            </Field>
            <button className="btn" onClick={() => run(() => api('PUT', `/matches/${m.id}/player-of-match`, { playerId: pom || null }), 'Player of the match saved')}>Save player of the match</button>
          </div>
        )}
        <button className="btn danger" onClick={() => { if (window.confirm('Delete this match and all its balls? This cannot be undone.')) void run(async () => { await api('DELETE', `/matches/${m.id}`); nav('/matches') }, 'Deleted') }}>Delete match</button>
      </div>
    </Modal>
  )
}

function toLocal(iso: string) {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
