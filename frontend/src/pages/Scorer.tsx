import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowLeftRight, CloudOff, MoreHorizontal, RefreshCw, Sun, Undo2, Wifi } from 'lucide-react'
import { store as local } from '../api'
import { useAuth } from '../auth'
import { DISMISSAL_LABEL, allowedDismissals } from '../engine'
import { ScorerStore } from '../scorer/store'
import type { Ball, Dismissal, ExtraType, InningsView, MatchView, PlayerRef, TeamFull } from '../types'
import { BallChip, Field, Modal, roleTags } from '../ui'
import { chase } from './Overview'
import toast from 'react-hot-toast'
import { confirm } from '../confirm'

type Mods = { wide: boolean; noBall: boolean; bye: boolean; legBye: boolean }
const NO_MODS: Mods = { wide: false, noBall: false, bye: false, legBye: false }
type Sheet = null | 'wicket' | 'more' | 'runs' | 'bowler' | 'striker' | 'nonStriker' | 'revise' | 'result' | 'edit'

export default function Scorer() {
  const { id } = useParams()
  const store = useMemo(() => new ScorerStore(id!), [id])
  useSyncExternalStore(store.subscribe, store.snapshot)
  // Sync and server errors pop up as toasts; the same message is shown once even if it repeats while retrying.
  useEffect(() => {
    if (!store.error) return
    toast.error(store.error, { id: store.error })
    store.dismissError()
  }, [store, store.error])
  useEffect(() => { void store.init(); return () => store.dispose() }, [store])
  const [sun, setSun] = useState(local.get('wk:sun') === '1')
  const [mods, setMods] = useState<Mods>(NO_MODS)
  const [sheet, setSheet] = useState<Sheet>(null)

  const doc = store.doc
  if (!doc) return <div className="scorer"><div className="empty">{store.loading ? 'Loading…' : store.error}</div><Link className="btn" to={`/matches/${id}`}>Back to match</Link></div>

  const inn = store.current()
  const m = doc.summary
  const team = (tid: string | undefined) => (doc.teamA?.id === tid ? doc.teamA : doc.teamB) as TeamFull
  const locked = store.lock === 'other'
  const toggleSun = () => { local.set('wk:sun', sun ? null : '1'); setSun(!sun) }

  const record = (n: number) => {
    if (mods.wide) store.addBall({ extraType: 'WIDE', extraRuns: n })
    else if (mods.noBall) store.addBall(mods.bye || mods.legBye ? { extraType: 'NO_BALL', extraRuns: n, subExtra: mods.legBye ? 'LEG_BYE' : 'BYE' } : { extraType: 'NO_BALL', runsBat: n })
    else if ((mods.bye || mods.legBye) && n > 0) store.addBall({ extraType: mods.legBye ? 'LEG_BYE' : 'BYE', extraRuns: n })
    else store.addBall({ runsBat: n })
    setMods(NO_MODS)
    setSheet(null)
  }
  const mod = (k: keyof Mods) => setMods((cur) => {
    const next = { ...cur, [k]: !cur[k] }
    if (k === 'wide' && next.wide) return { ...NO_MODS, wide: true }
    if (k !== 'wide') next.wide = false
    if (k === 'bye' && next.bye) next.legBye = false
    if (k === 'legBye' && next.legBye) next.bye = false
    return next
  })
  const extraNow: ExtraType = mods.wide ? 'WIDE' : mods.noBall ? 'NO_BALL' : mods.bye ? 'BYE' : mods.legBye ? 'LEG_BYE' : 'NONE'

  // What the scorer must choose before the next ball can be recorded.
  const st = inn?.state
  const rules = inn ? store.rulesFor(inn) : doc.rules
  const alone = !!st && rules.lastManStands && st.wickets >= rules.playersPerSide - 1
  const need: Sheet = !inn || inn.closed ? null : !inn.strikerId ? 'striker' : !inn.nonStrikerId && !alone ? 'nonStriker' : !inn.bowlerId ? 'bowler' : null

  return (
    <div className="scorer" data-theme={sun ? 'sun' : undefined} style={sun ? { maxWidth: 'none', paddingInline: 'max(12px, calc(50vw - 280px))' } : undefined}>
      <div className="scorer-top">
        <Link to={`/matches/${id}`} className="icon-btn" aria-label="Back to match page"><ArrowLeft size={17} /></Link>
        <div className="grow"><div className="truncate" style={{ fontWeight: 800 }}>{m.teamA?.name} v {m.teamB?.name}</div><div className="small muted">{m.format}{m.label ? ` · ${m.label}` : ''}</div></div>
        <SyncPill store={store} />
        <button className="icon-btn" onClick={toggleSun} aria-label="Toggle sunlight theme" title="Sunlight theme"><Sun size={16} /></button>
      </div>

      {locked && <div className="note info row between wrap"><span>Another device is scoring this match. This screen is read-only.</span><button className="btn sm primary" onClick={() => store.claim(true)}>Take over scoring</button></div>}

      {m.state === 'SCHEDULED' && <PreMatch store={store} doc={doc} disabled={locked} />}

      {inn && st && (
        <>
          <div className="card">
            <div className="row between"><span className="muted" style={{ fontWeight: 700 }}>{team(inn.battingTeamId).name} · {inn.no === 1 ? '1st' : '2nd'} innings</span>
              {st.freeHitNext && !inn.closed && <span className="pill warn">Free hit</span>}</div>
            <div className="score-line"><span className="total">{st.runs}/{st.wickets}</span><span className="muted num" style={{ fontWeight: 700 }}>{st.oversText} / {rules.overs} ov</span>
              <span className="muted num small" style={{ marginLeft: 'auto' }}>CRR {chase(doc, inn).crr.toFixed(2)}</span></div>
            {inn.target !== null && !inn.closed && (() => { const c = chase(doc, inn); return (
              <div style={{ fontWeight: 700, marginTop: 6 }}>Need <span className="brand">{c.need}</span> from {c.left} balls · Target {inn.target}{c.rrr !== null ? ` · RRR ${c.rrr.toFixed(2)}` : ''}</div>) })()}
            {inn.no === 1 && inn.closed && <div style={{ fontWeight: 700, marginTop: 6 }}>Innings break. {team(inn.bowlingTeamId).name} need {st.runs + 1} to win.</div>}
            {m.state === 'COMPLETED' && <div className="brand" style={{ fontWeight: 800, marginTop: 6 }}>{m.resultText}</div>}
            {m.state === 'ABANDONED' && <div className="muted" style={{ fontWeight: 800, marginTop: 6 }}>{m.resultText}</div>}
          </div>

          {!inn.closed && (
            <div className="crease">
              {([['striker', inn.strikerId], ['nonStriker', inn.nonStrikerId]] as const).map(([role, pid]) => {
                const b = st.batters.find((x) => x.playerId === pid)
                if (role === 'nonStriker' && alone) return null
                return (
                  <button key={role} className={role === 'striker' ? 'on-strike' : ''} onClick={() => setSheet(role)} disabled={locked}>
                    <span className="truncate">{pid ? store.names().get(pid) : <span className="muted">Choose {role === 'striker' ? 'striker' : 'non-striker'}</span>}{role === 'striker' && pid ? ' *' : ''}</span>
                    <span className="fig">{b ? `${b.runs} (${b.balls})` : pid ? '0 (0)' : ''}</span>
                  </button>
                )
              })}
              {(() => { const bw = st.bowlers.find((x) => x.playerId === inn.bowlerId); return (
                <button onClick={() => setSheet('bowler')} disabled={locked}>
                  <span className="truncate">{inn.bowlerId ? <><span className="muted small">Bowling </span>{store.names().get(inn.bowlerId)}</> : <span className="muted">Choose bowler</span>}</span>
                  <span className="fig">{bw ? `${Math.floor(bw.balls / rules.ballsPerOver)}.${bw.balls % rules.ballsPerOver}-${bw.maidens}-${bw.runs}-${bw.wickets}` : ''}</span>
                </button>) })()}
            </div>
          )}

          <div className="strip" aria-label="This over">
            {(st.overComplete || inn.closed ? [] : st.overs[st.overs.length - 1]?.balls ?? []).map((b, i) => <BallChip key={i} label={b} />)}
            {(st.overComplete || !st.overs.length) && !inn.closed && <span className="muted small">New over</span>}
          </div>

          {inn.closed ? (
            <div className="pad">
              {inn.no === 1 && m.state === 'INNINGS_BREAK' && <button className="btn primary block" style={{ minHeight: 56 }} disabled={locked} onClick={() => store.startSecondInnings()}>Start 2nd innings</button>}
              {m.state === 'COMPLETED' && <Link to={`/matches/${id}`} className="btn primary block" style={{ minHeight: 56 }}>View full scorecard</Link>}
              <div className="pad-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button className="key util" disabled={locked || !store.canUndo() || m.state === 'ABANDONED'} onClick={() => store.undo()}><span className="row"><Undo2 size={16} />Undo last ball</span></button>
                <button className="key util" disabled={locked} onClick={() => setSheet('more')}><span className="row"><MoreHorizontal size={16} />More</span></button>
              </div>
            </div>
          ) : need ? (
            <PlayerPicker key={need} role={need} store={store} inn={inn} onDone={() => setSheet(null)} inline />
          ) : (
            <div className="pad">
              <div className="pad-row">
                {([['wide', 'Wide'], ['noBall', 'No ball'], ['bye', 'Bye'], ['legBye', 'Leg bye']] as const).map(([k, label]) => (
                  <button key={k} className={`key mod ${mods[k] ? 'on' : ''}`} aria-pressed={mods[k]} disabled={locked} onClick={() => mod(k)}>{label}</button>
                ))}
              </div>
              <div className="pad-row">
                {[0, 1, 2, 3].map((n) => <button key={n} className="key run" disabled={locked} onClick={() => record(n)}>{n}</button>)}
              </div>
              <div className="pad-row">
                <button className="key run boundary" disabled={locked} onClick={() => record(4)}>4</button>
                <button className="key run boundary" disabled={locked} onClick={() => record(6)}>6</button>
                <button className="key util" disabled={locked} onClick={() => setSheet('runs')}>5, 7+</button>
                <button className="key wkt" disabled={locked} onClick={() => setSheet('wicket')}>WICKET</button>
              </div>
              <div className="pad-row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <button className="key util" disabled={locked || !store.canUndo()} onClick={() => store.undo()}><span className="row"><Undo2 size={16} />Undo</span></button>
                <button className="key util" disabled={locked || alone} onClick={() => store.swapStrike()}><span className="row"><ArrowLeftRight size={16} />Swap</span></button>
                <button className="key util" disabled={locked} onClick={() => setSheet('more')}><span className="row"><MoreHorizontal size={16} />More</span></button>
              </div>
            </div>
          )}
        </>
      )}

      {sheet === 'runs' && <Modal title="Runs" onClose={() => setSheet(null)}><div className="chips">{[5, 7, 8].map((n) => <button key={n} className="chip" onClick={() => record(n)}>{n}</button>)}</div></Modal>}
      {inn && (sheet === 'striker' || sheet === 'nonStriker' || sheet === 'bowler') && !need && (
        <Modal title={sheet === 'bowler' ? 'Change bowler' : 'Change batter'} onClose={() => setSheet(null)}><PlayerPicker role={sheet} store={store} inn={inn} onDone={() => setSheet(null)} /></Modal>
      )}
      {inn && sheet === 'wicket' && (
        <WicketSheet store={store} inn={inn} extra={extraNow} mods={mods} onClose={() => setSheet(null)} onDone={() => { setMods(NO_MODS); setSheet(null) }} />
      )}
      {sheet === 'more' && inn && (
        <Modal title="More" onClose={() => setSheet(null)}>
          <div className="pick-list">
            {!inn.closed && <button onClick={() => { store.addBall({ extraType: 'PENALTY', extraRuns: 5 }); setSheet(null) }}>Award 5 penalty runs to the batting side</button>}
            {!inn.closed && <button onClick={() => setSheet('bowler')}>Change bowler mid-over</button>}
            <button onClick={() => setSheet('edit')}>Edit an earlier ball</button>
            {!inn.closed && <button onClick={() => setSheet('revise')}>Reduce overs / revise target</button>}
            {!inn.closed && <button onClick={async () => { if (await confirm({ title: 'End this innings now?', message: 'Use this when the innings closes early, for example a declaration or rain.', yes: 'Yes, end it' })) { store.endInnings(); setSheet(null) } }}>End innings</button>}
            <button onClick={() => setSheet('result')}>Abandon match or set the result</button>
          </div>
        </Modal>
      )}
      {sheet === 'revise' && inn && <ReviseSheet store={store} inn={inn} onClose={() => setSheet(null)} />}
      {sheet === 'result' && <ResultSheet store={store} doc={doc} onClose={() => setSheet(null)} />}
      {sheet === 'edit' && inn && <EditSheet store={store} inn={inn} onClose={() => setSheet(null)} />}
    </div>
  )
}

function SyncPill({ store }: { store: ScorerStore }) {
  const n = store.queue.length
  if (!store.online) return <span className="pill bad sync"><CloudOff size={12} />Offline{n ? ` · ${n} saved` : ''}</span>
  if (n) return <span className="pill warn sync"><RefreshCw size={12} />{n} pending</span>
  return <span className="pill good sync"><Wifi size={12} />Synced</span>
}

/** Before the toss: both squads must be complete, with a captain and a wicket-keeper picked for each side. */
function PreMatch({ store, doc, disabled }: { store: ScorerStore; doc: MatchView; disabled: boolean }) {
  const teams = [doc.teamA, doc.teamB].filter((t): t is TeamFull => t !== null)
  if (teams.length < 2) return <div className="card muted">Both teams must be known before this match can start.</div>
  const need = doc.rules.playersPerSide
  const missing: string[] = []
  for (const t of teams) {
    const r = doc.roles?.find((x) => x.teamId === t.id)
    if (t.players.length < need) missing.push(`${t.name}: add ${need - t.players.length} more player${need - t.players.length === 1 ? '' : 's'}`)
    if (!r?.captainId) missing.push(`${t.name}: choose a captain`)
    if (!r?.keeperId) missing.push(`${t.name}: choose a wicket-keeper`)
  }
  return (
    <>
      {teams.map((t) => <SquadSetup key={t.id} store={store} team={t} need={need} disabled={disabled} />)}
      <Toss doc={doc} onStart={(w, d) => store.start(w, d)} disabled={disabled} missing={missing} />
    </>
  )
}

function SquadSetup({ store, team, need, disabled }: { store: ScorerStore; team: TeamFull; need: number; disabled: boolean }) {
  const admin = useAuth().user?.admin ?? false
  const [names, setNames] = useState('')
  const r = store.doc!.roles?.find((x) => x.teamId === team.id) ?? { captainId: null, viceCaptainId: null, keeperId: null }
  const set = (k: 'captainId' | 'viceCaptainId' | 'keeperId', id: string) => {
    const next = { captainId: r.captainId, viceCaptainId: r.viceCaptainId, keeperId: r.keeperId, [k]: r[k] === id && k === 'viceCaptainId' ? null : id }
    if (k === 'captainId' && next.viceCaptainId === id) next.viceCaptainId = null
    if (k === 'viceCaptainId' && next.captainId === id) next.captainId = null
    store.setRoles(team.id, next)
  }
  const add = (e: FormEvent) => {
    e.preventDefault()
    const list = names.split(/[,\n]/).map((n) => n.trim()).filter(Boolean)
    const have = new Set(team.players.map((p) => p.name.toLowerCase()))
    const fresh = list.filter((n) => !have.has(n.toLowerCase()))
    fresh.forEach((n) => store.addPlayer(team.id, n))
    if (fresh.length < list.length) toast(`${list.length - fresh.length} already in the squad, skipped`)
    setNames('')
  }
  const short = team.players.length < need
  return (
    <div className="card col" style={{ gap: 12 }}>
      <div className="row between">
        <h2>{team.name}</h2>
        <span className={`pill ${short ? 'warn' : 'good'}`}>{team.players.length} / {need} players</span>
      </div>
      {team.players.length > 0 && (
        <div className="squad-setup">
          <div className="small dim squad-head"><span>Player</span><span>C</span><span>VC</span><span>WK</span></div>
          {team.players.map((p) => (
            <div key={p.id} className="squad-row">
              <span className="truncate">{p.name}</span>
              {(['captainId', 'viceCaptainId', 'keeperId'] as const).map((k) => (
                <button key={k} type="button" disabled={disabled} className={`role-dot ${r[k] === p.id ? 'on' : ''}`}
                  aria-label={`${k === 'captainId' ? 'Captain' : k === 'viceCaptainId' ? 'Vice-captain' : 'Wicket-keeper'}: ${p.name}`}
                  aria-pressed={r[k] === p.id} onClick={() => set(k, p.id)}>{k === 'captainId' ? 'C' : k === 'viceCaptainId' ? 'VC' : 'WK'}</button>
              ))}
            </div>
          ))}
        </div>
      )}
      {!team.players.length && <div className="muted small">No players in this team yet.</div>}
      {admin ? (
        <form className="col" style={{ gap: 6 }} onSubmit={add}>
          <div className="row">
            <input className="input" placeholder="Player names, separated by commas" value={names} onChange={(e) => setNames(e.target.value)} aria-label={`Add players to ${team.name}`} disabled={disabled} />
            <button className="btn" disabled={disabled || !names.trim()}>Add</button>
          </div>
          <div className="small muted">Players are saved to the team, so they are already there next match. Vice-captain is optional.</div>
        </form>
      ) : short ? <div className="small muted">Players missing? Ask your admin to add them to {team.name}.</div> : null}
    </div>
  )
}

function Toss({ doc, onStart, disabled, missing }: { doc: MatchView; onStart: (winner: string, decision: 'BAT' | 'BOWL') => void; disabled: boolean; missing: string[] }) {
  const [winner, setWinner] = useState<string | null>(null)
  const [decision, setDecision] = useState<'BAT' | 'BOWL' | null>(null)
  const [flip, setFlip] = useState<string | null>(null)
  const teams = [doc.teamA, doc.teamB].filter((t): t is TeamFull => t !== null)
  if (teams.length < 2) return <div className="card muted">Both teams must be known before this match can start.</div>
  return (
    <div className="card col" style={{ gap: 14 }}>
      <h2>Toss</h2>
      <div className="row wrap">
        <button className="btn" onClick={() => setFlip(crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? 'Heads' : 'Tails')}>Flip a coin</button>
        {flip && <span className="brand" style={{ fontWeight: 800 }}>{flip}</span>}
      </div>
      <Field label="Who won the toss?"><div className="chips">{teams.map((t) => <button key={t.id} type="button" className={`chip ${winner === t.id ? 'on' : ''}`} onClick={() => setWinner(t.id)}>{t.name}</button>)}</div></Field>
      <Field label="They chose to"><div className="chips">
        <button type="button" className={`chip ${decision === 'BAT' ? 'on' : ''}`} onClick={() => setDecision('BAT')}>Bat</button>
        <button type="button" className={`chip ${decision === 'BOWL' ? 'on' : ''}`} onClick={() => setDecision('BOWL')}>Bowl</button></div></Field>
      {missing.length > 0 && <div className="small muted">Before the match can start:<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{missing.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      <button className="btn primary block" style={{ minHeight: 52 }} disabled={!winner || !decision || disabled || missing.length > 0} onClick={() => onStart(winner!, decision!)}>Start match</button>
    </div>
  )
}

function PlayerPicker({ role, store, inn, onDone, inline }: { role: 'striker' | 'nonStriker' | 'bowler'; store: ScorerStore; inn: InningsView; onDone: () => void; inline?: boolean }) {
  const admin = useAuth().user?.admin ?? false
  const [name, setName] = useState('')
  const doc = store.doc!, st = inn.state, rules = store.rulesFor(inn)
  const batting = role !== 'bowler'
  const teamId = batting ? inn.battingTeamId : inn.bowlingTeamId
  const team = (doc.teamA?.id === teamId ? doc.teamA : doc.teamB)!
  const other = role === 'striker' ? inn.nonStrikerId : inn.strikerId
  const newOver = st.overComplete || st.legalBalls === 0

  const blocked = (p: PlayerRef): string | null => {
    if (batting) {
      const b = st.batters.find((x) => x.playerId === p.id)
      if (p.id === other) return 'at the crease'
      if (b && b.dismissal !== null && b.dismissal !== 'RETIRED_HURT') return 'out'
      return null
    }
    const bw = st.bowlers.find((x) => x.playerId === p.id)
    if (newOver && st.lastOverBowler === p.id) return 'bowled the last over'
    if (rules.maxOversPerBowler > 0 && bw && bw.balls >= rules.maxOversPerBowler * rules.ballsPerOver) return 'overs limit reached'
    return null
  }
  const pick = (pid: string) => {
    store.setPlayers(role === 'striker' ? { strikerId: pid } : role === 'nonStriker' ? { nonStrikerId: pid } : { bowlerId: pid })
    onDone()
  }
  const add = (e: FormEvent) => { e.preventDefault(); if (name.trim()) { pick(store.addPlayer(teamId, name.trim())); setName('') } }
  const title = role === 'bowler' ? (newOver ? 'Who bowls this over?' : 'Who takes over the bowling?') : role === 'striker' ? 'Who is on strike?' : 'Who is at the non-striker’s end?'
  const figures = (p: PlayerRef) => {
    if (batting) { const b = st.batters.find((x) => x.playerId === p.id); return b ? `${b.runs} (${b.balls})` : '' }
    const bw = st.bowlers.find((x) => x.playerId === p.id)
    return bw ? `${Math.floor(bw.balls / rules.ballsPerOver)}.${bw.balls % rules.ballsPerOver}-${bw.maidens}-${bw.runs}-${bw.wickets}` : ''
  }
  return (
    <div className={inline ? 'card col' : 'col'} style={inline ? { marginTop: 'auto' } : undefined}>
      <div><h2>{title}</h2><div className="small muted">{team.name}</div></div>
      <div className="pick-list">
        {team.players.map((p) => { const why = blocked(p); return (
          <button key={p.id} disabled={why !== null} onClick={() => pick(p.id)}><span>{p.name}{roleTags(doc, p.id)}</span><span className="muted small num">{why ?? figures(p)}</span></button>) })}
        {!team.players.length && <div className="muted small">{admin ? 'No players yet. Add the first one below.' : 'No players in this team yet.'}</div>}
      </div>
      {admin ? (
        <form className="row" onSubmit={add}>
          <input className="input" placeholder="Add a new player by name" value={name} onChange={(e) => setName(e.target.value)} aria-label="New player name" />
          <button className="btn">Add</button>
        </form>
      ) : <div className="small muted">Player missing? Ask your admin to add them to the team.</div>}
    </div>
  )
}

function WicketSheet({ store, inn, extra, mods, onClose, onDone }: { store: ScorerStore; inn: InningsView; extra: ExtraType; mods: Mods; onClose: () => void; onDone: () => void }) {
  const options = allowedDismissals(extra, inn.state.freeHitNext)
  const [type, setType] = useState<Dismissal | null>(null)
  const [outId, setOutId] = useState(inn.strikerId!)
  const [fielder, setFielder] = useState('')
  const [runs, setRuns] = useState(0)
  const doc = store.doc!
  const fielders = (doc.teamA?.id === inn.bowlingTeamId ? doc.teamA : doc.teamB)!.players
  const names = store.names()
  const eitherEnd = type !== null && ['RUN_OUT', 'OBSTRUCTING_FIELD', 'RETIRED_OUT', 'RETIRED_HURT', 'TIMED_OUT'].includes(type)
  const needsFielder = type !== null && ['CAUGHT', 'RUN_OUT', 'STUMPED'].includes(type)
  const canRun = type === 'RUN_OUT' || type === 'OBSTRUCTING_FIELD'

  const confirm = () => {
    if (!type) return
    const n = canRun ? runs : 0
    const base = { dismissal: type, dismissedId: eitherEnd ? outId : inn.strikerId, fielderId: needsFielder && fielder ? fielder : null }
    if (extra === 'WIDE') store.addBall({ ...base, extraType: 'WIDE', extraRuns: n })
    else if (extra === 'NO_BALL') store.addBall(mods.bye || mods.legBye ? { ...base, extraType: 'NO_BALL', extraRuns: n, subExtra: mods.legBye ? 'LEG_BYE' : 'BYE' } : { ...base, extraType: 'NO_BALL', runsBat: n })
    else if (extra === 'BYE' || extra === 'LEG_BYE') store.addBall({ ...base, extraType: extra, extraRuns: n })
    else store.addBall({ ...base, runsBat: n })
    onDone()
  }
  return (
    <Modal title={extra === 'NONE' ? (inn.state.freeHitNext ? 'Wicket (free hit)' : 'Wicket') : `Wicket off a ${extra.toLowerCase().replace('_', ' ')}`} onClose={onClose}>
      <div className="col" style={{ gap: 14 }}>
        <Field label="How out? Only dismissals possible on this delivery are shown.">
          <div className="chips">{options.map((d) => <button key={d} type="button" className={`chip ${type === d ? 'on' : ''}`} onClick={() => setType(d)}>{DISMISSAL_LABEL[d]}</button>)}</div>
        </Field>
        {eitherEnd && inn.nonStrikerId && (
          <Field label="Who is out?"><div className="chips">{[inn.strikerId!, inn.nonStrikerId].map((pid) => (
            <button key={pid} type="button" className={`chip ${outId === pid ? 'on' : ''}`} onClick={() => setOutId(pid)}>{names.get(pid)}</button>))}</div></Field>
        )}
        {needsFielder && (
          <Field label={type === 'STUMPED' ? 'Wicketkeeper' : 'Fielder'}>
            <select className="input" value={fielder} onChange={(e) => setFielder(e.target.value)}><option value="">Not recorded</option>{fielders.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </Field>
        )}
        {canRun && <Field label="Runs completed before the wicket"><div className="chips">{[0, 1, 2, 3].map((n) => <button key={n} type="button" className={`chip ${runs === n ? 'on' : ''}`} onClick={() => setRuns(n)}>{n}</button>)}</div></Field>}
        <div className="small muted">After the wicket you choose the new batter. Use Swap if the batters crossed.</div>
        <button className="btn primary block" style={{ minHeight: 52 }} disabled={!type} onClick={confirm}>Record wicket</button>
      </div>
    </Modal>
  )
}

function ReviseSheet({ store, inn, onClose }: { store: ScorerStore; inn: InningsView; onClose: () => void }) {
  const [overs, setOvers] = useState(String(inn.revisedOvers ?? store.doc!.rules.overs))
  const [target, setTarget] = useState(inn.target !== null ? String(inn.target) : '')
  return (
    <Modal title="Interrupted match" onClose={onClose}>
      <div className="col">
        <Field label="Overs for this innings"><input className="input" type="number" min={1} max={store.doc!.rules.overs} value={overs} onChange={(e) => setOvers(e.target.value)} /></Field>
        {inn.no === 2 && <Field label="Revised target (enter it by hand, e.g. from a DLS sheet)"><input className="input" type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} /></Field>}
        <button className="btn primary" onClick={() => {
          const t = inn.no === 2 && target && Number(target) !== inn.target ? Number(target) : null
          store.revise(Number(overs) || null, t)
          onClose()
        }}>Apply</button>
      </div>
    </Modal>
  )
}

function ResultSheet({ store, doc, onClose }: { store: ScorerStore; doc: MatchView; onClose: () => void }) {
  const [type, setType] = useState('ABANDONED')
  const [winner, setWinner] = useState(doc.teamA?.id ?? '')
  const [reason, setReason] = useState('')
  const submit = async () => {
    try { await store.setResult(type, type === 'WIN' ? winner : null, reason); onClose() } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed') }
  }
  return (
    <Modal title="Set the result" onClose={onClose}>
      <div className="col">
        <Field label="Outcome"><select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="ABANDONED">Match abandoned</option><option value="NO_RESULT">No result</option><option value="TIE">Tie</option><option value="WIN">Awarded win</option></select></Field>
        {type === 'WIN' && <Field label="Winner"><select className="input" value={winner} onChange={(e) => setWinner(e.target.value)}>{[doc.teamA, doc.teamB].map((t) => t && <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>}
        <Field label="Reason (recorded)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Rain, super over, walkover" /></Field>
        <button className="btn primary" disabled={!reason.trim()} onClick={submit}>Confirm result</button>
      </div>
    </Modal>
  )
}

function EditSheet({ store, inn, onClose }: { store: ScorerStore; inn: InningsView; onClose: () => void }) {
  const [ball, setBall] = useState<Ball | null>(null)
  const [runs, setRuns] = useState(0)
  const [extra, setExtra] = useState<ExtraType>('NONE')
  const names = store.names()
  const labels = inn.state.overs.flatMap((o) => o.balls.map((l) => ({ over: o.number, l })))
  const open = (b: Ball) => { setBall(b); setExtra(b.extraType); setRuns(b.extraType === 'NONE' ? b.runsBat : b.runsBat + b.extraRuns) }
  const save = () => {
    if (!ball) return
    const bat = extra === 'NONE' || (extra === 'NO_BALL' && ball.subExtra === null)
    store.editBall(inn.no, ball.id, { extraType: extra, runsBat: bat ? runs : 0, extraRuns: bat ? 0 : runs, subExtra: extra === 'NO_BALL' ? ball.subExtra : null })
    onClose()
  }
  if (ball) {
    return (
      <Modal title="Edit ball" onClose={onClose}>
        <div className="col">
          <div className="muted small">{names.get(ball.bowlerId)} to {names.get(ball.strikerId)}{ball.dismissal ? ` · ${DISMISSAL_LABEL[ball.dismissal]} (kept)` : ''}</div>
          <Field label="Delivery"><div className="chips">{(['NONE', 'WIDE', 'NO_BALL', 'BYE', 'LEG_BYE'] as ExtraType[]).map((x) => (
            <button key={x} type="button" className={`chip ${extra === x ? 'on' : ''}`} onClick={() => setExtra(x)}>{x === 'NONE' ? 'Off the bat' : x.replace('_', ' ').toLowerCase()}</button>))}</div></Field>
          <Field label={extra === 'WIDE' ? 'Extra runs run on the wide' : 'Runs'}><div className="chips">{[0, 1, 2, 3, 4, 5, 6].map((n) => <button key={n} type="button" className={`chip ${runs === n ? 'on' : ''}`} onClick={() => setRuns(n)}>{n}</button>)}</div></Field>
          <div className="small muted">Totals and figures are recalculated. Who faced the later balls stays as it was recorded. To change a wicket, undo back to it.</div>
          <button className="btn primary" onClick={save}>Save change</button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal title="Edit an earlier ball" onClose={onClose}>
      <div className="pick-list">
        {[...(inn.balls ?? [])].map((b, i) => ({ b, i })).reverse().slice(0, 60).map(({ b, i }) => (
          <button key={b.id} disabled={b.extraType === 'PENALTY' || (b.dismissal !== null && ['RETIRED_OUT', 'RETIRED_HURT', 'TIMED_OUT'].includes(b.dismissal))} onClick={() => open(b)}>
            <span className="truncate"><span className="muted small">Over {labels[i]?.over} · </span>{names.get(b.bowlerId)} to {names.get(b.strikerId)}</span><BallChip label={labels[i]?.l ?? ''} />
          </button>
        ))}
        {!inn.balls?.length && <div className="muted">No balls in this innings yet.</div>}
      </div>
    </Modal>
  )
}
