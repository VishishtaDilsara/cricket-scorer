import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FileDown, Plus } from 'lucide-react'
import { api, errorText, useApi } from '../api'
import { useAuth } from '../auth'
import type { Career, MatchSummary, Player, PlayerProfile, TeamRef } from '../types'
import { BarList, ColumnChart } from '../charts'
import { DISMISSAL_LABEL } from '../engine'
import { AsyncButton, Badge, BusyLabel, Field, MatchList, Modal, ShareButton, SignInPrompt, Status } from '../ui'
import toast from 'react-hot-toast'

export function Teams() {
  const { user, ready } = useAuth()
  const nav = useNavigate()
  const { data, error, loading } = useApi<TeamRef[]>(user ? '/teams' : null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [shortName, setShort] = useState('')
  const [homeGround, setGround] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { id } = await api<{ id: string }>('POST', '/teams', { name, shortName: shortName || null, homeGround: homeGround || null })
      nav(`/teams/${id}`)
    } catch (x) { toast.error(errorText(x)); setBusy(false) }
  }
  const grid = (list: TeamRef[]) => (
    <div className="grid thirds">
      {list.map((t) => <Link key={t.id} to={`/teams/${t.id}`} className="card row"><Badge team={t} large /><span className="strong truncate" style={{ fontWeight: 800 }}>{t.name}</span></Link>)}
    </div>
  )
  return (
    <div className="page">
      <div className="page-head"><h1>Teams</h1>{user?.admin && <button className="btn primary" onClick={() => setOpen(true)}><Plus size={16} />New team</button>}</div>
      {ready && !user && <SignInPrompt what="teams" />}
      <Status loading={loading} error={error} />
      {data && (data.length ? grid(data) : <div className="card empty">{user?.admin ? 'No teams yet. Create one, or start a quick match and teams are made for you.' : 'Your admin has not created any teams yet.'}</div>)}
      {open && (
        <Modal title="New team" onClose={() => setOpen(false)}>
          <form className="col" onSubmit={create}>
            <Field label="Team name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
            <Field label="Short name (up to 4 letters)"><input className="input" value={shortName} maxLength={4} onChange={(e) => setShort(e.target.value)} /></Field>
            <Field label="Home ground"><input className="input" value={homeGround} onChange={(e) => setGround(e.target.value)} /></Field>
            <button className="btn primary" disabled={busy} aria-busy={busy}><BusyLabel busy={busy} text="Creating…">Create team</BusyLabel></button>
          </form>
        </Modal>
      )}
    </div>
  )
}

type TeamView = {
  team: TeamRef & { homeGround: string | null; captainId: string | null; viceCaptainId: string | null; keeperId: string | null }; canEdit: boolean; players: Player[]
  record: { played: number; won: number; lost: number; tied: number; noResult: number }; matches: MatchSummary[]
}

export function TeamPage() {
  const { id } = useParams()
  const { data, error, loading, reload } = useApi<TeamView>(`/teams/${id}`)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [hand, setHand] = useState('')
  const [style, setStyle] = useState('')
  const [adding, setAdding] = useState(false)
  const [savingRole, setSavingRole] = useState(false)
  if (!data) return <div className="page"><Status loading={loading} error={error} /></div>
  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (adding) return
    setAdding(true)
    try {
      await api('POST', `/teams/${id}/players`, { name, playerRole: role || null, battingHand: hand || null, bowlingStyle: style || null })
      toast.success(`${name.trim()} added`); setName(''); await reload()
    } catch (x) { toast.error(errorText(x)) } finally { setAdding(false) }
  }
  const remove = async (pid: string) => {
    try { await api('DELETE', `/teams/${id}/players/${pid}`); await reload() } catch (x) { toast.error(errorText(x)) } }
  const r = data.record
  const t = data.team
  type RoleKey = 'captainId' | 'viceCaptainId' | 'keeperId'
  const setTeamRole = async (k: RoleKey, pid: string) => {
    const next = { captainId: t.captainId, viceCaptainId: t.viceCaptainId, keeperId: t.keeperId, [k]: t[k] === pid ? null : pid }
    if (k === 'captainId' && next.viceCaptainId === pid) next.viceCaptainId = null
    if (k === 'viceCaptainId' && next.captainId === pid) next.captainId = null
    setSavingRole(true)
    try { await api('PUT', `/teams/${id}/roles`, next); await reload() } catch (x) { toast.error(errorText(x)) } finally { setSavingRole(false) }
  }
  const roleKeys: [RoleKey, string, string][] = [['captainId', 'C', 'Captain'], ['viceCaptainId', 'VC', 'Vice-captain'], ['keeperId', 'WK', 'Wicket-keeper']]
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
          {data.canEdit && data.players.length > 0 && <div className="small muted" style={{ marginBottom: 8 }}>Tap C, VC or WK to set the usual captain, vice-captain (optional) and wicket-keeper. Every new match starts with them, and they can be swapped before a toss.</div>}
          {data.players.map((p) => (
            <div key={p.id} className="row between" style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <Link to={`/players/${p.id}`} className="grow"><div className="strong" style={{ fontWeight: 700 }}>{p.name}</div>
                <div className="small muted">{[p.playerRole, p.battingHand && `${p.battingHand} bat`, p.bowlingStyle].filter(Boolean).join(' · ') || 'Name only'}</div></Link>
              <span className="row" style={{ gap: 6 }}>
                {data.canEdit ? roleKeys.map(([k, short, label]) => (
                  <button key={k} type="button" disabled={savingRole} aria-busy={savingRole} className={`role-dot sm ${t[k] === p.id ? 'on' : ''}`} aria-pressed={t[k] === p.id}
                    aria-label={`${label}: ${p.name}`} title={label} onClick={() => setTeamRole(k, p.id)}>{short}</button>
                )) : roleKeys.filter(([k]) => t[k] === p.id).map(([k, short]) => <span key={k} className={`pill ${k === 'keeperId' ? 'good' : 'brand'}`}>{short}</span>)}
                {data.canEdit && <AsyncButton className="btn sm danger" busyText="Removing…" onClick={() => remove(p.id)}
                  confirmFirst={{ title: `Remove ${p.name} from the team?`, message: 'Their past scores are kept. You can add them back later.', yes: 'Yes, remove', danger: true }}>Remove</AsyncButton>}
              </span>
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
                <button className="btn" disabled={adding} aria-busy={adding}><BusyLabel busy={adding} text="Adding…"><Plus size={16} />Add player</BusyLabel></button>
            </form>
          )}
        </div>
        <div className="card flush"><div className="card-head"><h2>Matches</h2></div><MatchList matches={data.matches} empty="No matches yet." /></div>
      </div>
    </div>
  )
}

export type PlayerView = { player: Player; teams: TeamRef[]; stats: Career; matches: MatchSummary[]; canEdit: boolean; profile?: PlayerProfile; canReport?: boolean }

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
        <div className="row wrap">
          <ShareButton title={p.name} />
          {data.canReport && <PlayerPdfButton data={data} />}
        </div>
      </div>
      <div className="col" style={{ gap: 14 }}>
        {block('Batting', [['Matches', s.matches], ['Innings', s.innings], ['Not outs', s.notOuts], ['Runs', s.runs], ['Highest', s.highestScore ?? '–'], ['Average', f(s.average)],
          ['Strike rate', f(s.strikeRate)], ['30s', s.thirties], ['50s', s.fifties], ['100s', s.hundreds], ['4s', s.fours], ['6s', s.sixes]])}
        {block('Bowling', [['Overs', overs], ['Maidens', s.maidens], ['Runs', s.conceded], ['Wickets', s.wickets], ['Best', s.best ?? '–'], ['Average', f(s.bowlingAverage)],
          ['Economy', f(s.economy)], ['Strike rate', f(s.bowlingStrikeRate)]])}
        {block('Fielding', [['Catches', s.catches], ['Run outs', s.runOuts], ['Stumpings', s.stumpings]])}
        <PlayerCharts data={data} />
        <div className="card flush"><div className="card-head"><h2>Recent matches</h2></div><MatchList matches={data.matches} empty="No matches yet." /></div>
      </div>
    </div>
  )
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const ov = (balls: number, bpo: number) => `${Math.floor(balls / bpo)}.${balls % bpo}`

function PlayerPdfButton({ data }: { data: PlayerView }) {
  const [busy, setBusy] = useState(false)
  return (
    <button className="btn" disabled={busy} onClick={async () => {
      setBusy(true)
      try { const { downloadPlayerReport } = await import('../playerReport'); await downloadPlayerReport(data); toast.success('Report downloaded') }
      catch (e) { toast.error(`Could not create the report: ${errorText(e)}`) } finally { setBusy(false) }
    }}><BusyLabel busy={busy} text="Preparing…"><FileDown size={16} />PDF report</BusyLabel></button>
  )
}

/** Form and make-up of the player's career: runs per innings, wickets per match, how the runs came, how they got out. */
function PlayerCharts({ data }: { data: PlayerView }) {
  const [table, setTable] = useState(false)
  // An older backend (e.g. mid-deploy) sends no profile; show the page without charts rather than crash.
  if (!data.profile?.form?.length) return null
  const { form, scoring, dismissals } = data.profile
  const s = data.stats
  const bat = form.filter((f) => f.batted).slice(-30)
  const bowl = form.filter((f) => f.bowlBalls > 0).slice(-30)
  const faced = scoring.dots + scoring.ones + scoring.twos + scoring.threes + scoring.fours + scoring.sixes + scoring.other
  const runs = scoring.ones + scoring.twos * 2 + scoring.threes * 3 + scoring.fours * 4 + scoring.sixes * 6
  const otherRuns = Math.max(0, s.runs - runs)
  const pct = (n: number, of: number) => (of ? `${Math.round((n * 100) / of)}%` : '0%')
  const boundaryRuns = scoring.fours * 4 + scoring.sixes * 6
  const outs = Object.entries(dismissals).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
  return (
    <>
      <div className="grid halves">
        <div className="card">
          <div className="card-head"><div><h2>Runs per innings</h2><div className="small muted">{bat.length < form.filter((f) => f.batted).length ? `Last ${bat.length} innings` : `${bat.length} innings`} · line shows the batting average</div></div></div>
          {bat.length ? <ColumnChart unit="runs per innings" color="var(--brand)"
            refLine={s.average !== null ? { value: s.average, label: `Avg ${s.average.toFixed(1)}` } : null}
            data={bat.map((f) => ({ key: f.matchId, value: f.runs, label: shortDate(f.date), mark: f.out ? '' : '*',
              tip: <><b>{f.runs}{f.out ? '' : '*'}</b> ({f.balls}) <span className="dim">· SR {f.balls ? ((f.runs * 100) / f.balls).toFixed(1) : '–'}</span><br />v {f.opponent ?? 'Unknown'} · {shortDate(f.date)}{f.dismissal ? <><br />{DISMISSAL_LABEL[f.dismissal]}</> : <><br />Not out</>}</> }))} />
            : <div className="muted small">Has not batted yet.</div>}
        </div>
        <div className="card">
          <div className="card-head"><div><h2>Wickets per match</h2><div className="small muted">{bowl.length} {bowl.length === 1 ? 'match' : 'matches'} bowled · economy {s.economy?.toFixed(2) ?? '–'}</div></div></div>
          {bowl.length ? <ColumnChart unit="wickets per match" color="#4f6f8f"
            data={bowl.map((f) => ({ key: f.matchId, value: f.wickets, label: shortDate(f.date),
              tip: <><b>{f.wickets}/{f.conceded}</b> <span className="dim">· {ov(f.bowlBalls, f.ballsPerOver)} ov · econ {f.bowlBalls ? ((f.conceded * f.ballsPerOver) / f.bowlBalls).toFixed(2) : '–'}</span><br />v {f.opponent ?? 'Unknown'} · {shortDate(f.date)}</> }))} />
            : <div className="muted small">Has not bowled yet.</div>}
        </div>
        <div className="card">
          <div className="card-head"><h2>How the runs came</h2></div>
          <div className="stat-chips">
            <div><div className="k">Balls faced</div><div className="v">{faced}</div></div>
            <div><div className="k">Dot balls</div><div className="v">{pct(scoring.dots, faced)}</div></div>
            <div><div className="k">Runs in boundaries</div><div className="v">{pct(boundaryRuns, s.runs)}</div></div>
          </div>
          <BarList color="var(--brand)" empty="No runs scored yet." rows={[
            { key: '1', label: 'Singles', value: scoring.ones, shown: `${scoring.ones} runs`, detail: pct(scoring.ones, s.runs) },
            { key: '2', label: 'Twos', value: scoring.twos * 2, shown: `${scoring.twos * 2} runs`, detail: pct(scoring.twos * 2, s.runs) },
            { key: '3', label: 'Threes', value: scoring.threes * 3, shown: `${scoring.threes * 3} runs`, detail: pct(scoring.threes * 3, s.runs) },
            { key: '4', label: 'Fours', value: scoring.fours * 4, shown: `${scoring.fours * 4} runs`, detail: pct(scoring.fours * 4, s.runs) },
            { key: '6', label: 'Sixes', value: scoring.sixes * 6, shown: `${scoring.sixes * 6} runs`, detail: pct(scoring.sixes * 6, s.runs) },
            ...(otherRuns ? [{ key: 'o', label: 'Other', value: otherRuns, shown: `${otherRuns} runs`, detail: pct(otherRuns, s.runs) }] : []),
          ]} />
        </div>
        <div className="card">
          <div className="card-head"><div><h2>How they got out</h2><div className="small muted">{s.innings - s.notOuts} dismissals in {s.innings} innings · {s.notOuts} not out</div></div></div>
          <BarList color="#4f6f8f" empty="Never been dismissed." rows={outs.map(([k, n]) => ({
            key: k, label: DISMISSAL_LABEL[k as keyof typeof DISMISSAL_LABEL] ?? k, value: n ?? 0, shown: String(n), detail: pct(n ?? 0, s.innings - s.notOuts),
          }))} />
        </div>
      </div>
      <div className="card flush">
        <div className="card-head"><h2>Match by match</h2><button className="btn sm" onClick={() => setTable(!table)}>{table ? 'Hide table' : 'Show table'}</button></div>
        {table && (
          <div className="table-scroll"><table className="table">
            <thead><tr><th>Date</th><th className="left">Opponent</th><th>Runs</th><th>Balls</th><th>SR</th><th className="left">How out</th><th>Overs</th><th>Wkts</th><th>Runs conceded</th><th>Econ</th></tr></thead>
            <tbody>{[...form].reverse().map((f) => (
              <tr key={f.matchId}>
                <td><Link className="brand" to={`/matches/${f.matchId}`}>{shortDate(f.date)}</Link></td><td className="left">{f.opponent ?? '–'}</td>
                <td className="strong">{f.batted ? `${f.runs}${f.out ? '' : '*'}` : '–'}</td><td>{f.batted ? f.balls : '–'}</td>
                <td>{f.batted && f.balls ? ((f.runs * 100) / f.balls).toFixed(1) : '–'}</td>
                <td className="left muted">{f.batted ? (f.dismissal ? DISMISSAL_LABEL[f.dismissal] : 'not out') : 'did not bat'}</td>
                <td>{f.bowlBalls ? ov(f.bowlBalls, f.ballsPerOver) : '–'}</td><td className="strong">{f.bowlBalls ? f.wickets : '–'}</td>
                <td>{f.bowlBalls ? f.conceded : '–'}</td><td>{f.bowlBalls ? ((f.conceded * f.ballsPerOver) / f.bowlBalls).toFixed(2) : '–'}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  )
}
