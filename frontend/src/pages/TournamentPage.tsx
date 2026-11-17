import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, errorText, useApi } from '../api'
import type { Board, MatchSummary, TournamentView } from '../types'
import { Badge, Field, MatchRow, ShareButton, Status, fmtDate, scoreOf, sourceLabel } from '../ui'
import { Standings } from './Overview'
import { STRUCTURES, statusPill } from './Tournaments'

export default function TournamentPage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const { data, error, loading, reload } = useApi<TournamentView>(`/tournaments/${id}`)
  if (!data) return <div className="page"><Status loading={loading} error={error} /></div>
  const t = data.tournament
  const knockouts = data.fixtures.filter((f) => f.stage === 'KNOCKOUT')
  const tabs = [
    ['fixtures', 'Fixtures'], ...(data.tables.length ? [['table', 'Points table']] : []), ...(knockouts.length ? [['bracket', 'Bracket']] : []),
    ['teams', 'Teams'], ['leaders', 'Leaderboards'], ...(data.canManage ? [['manage', 'Organiser']] : []),
  ]
  const tab = tabs.find(([k]) => k === params.get('tab'))?.[0] ?? 'fixtures'
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="row"><h1>{t.name}</h1>{statusPill(t.status)}</div>
          <div className="muted small">{[STRUCTURES[t.structure], `${t.overs} overs`, t.startDate && fmtDate(t.startDate, false), t.venue].filter(Boolean).join(' · ')}</div></div>
        <ShareButton title={t.name} />
      </div>
      <div className="tabs">{tabs.map(([k, label]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setParams({ tab: k })}>{label}</button>)}</div>
      {tab === 'fixtures' && <Fixtures data={data} />}
      {tab === 'table' && <Table data={data} />}
      {tab === 'bracket' && <Bracket matches={knockouts} />}
      {tab === 'teams' && <TeamsTab data={data} />}
      {tab === 'leaders' && <Leaders id={t.id} />}
      {tab === 'manage' && data.canManage && <Organiser data={data} reload={reload} />}
    </div>
  )
}

function Fixtures({ data }: { data: TournamentView }) {
  if (!data.fixtures.length) return <div className="card empty">Fixtures have not been published yet.</div>
  const live = data.fixtures.filter((f) => f.state === 'LIVE' || f.state === 'INNINGS_BREAK')
  const rest = data.fixtures.filter((f) => !live.includes(f))
  return <div className="card flush">{[...live, ...rest].map((m) => <MatchRow key={m.id} m={m} />)}</div>
}

function Table({ data }: { data: TournamentView }) {
  const t = data.tournament
  return (
    <div className="col" style={{ gap: 14 }}>
      <Standings t={data} />
      <div className="muted small">
        Win {t.pointsWin} · Loss {t.pointsLoss} · Tie {t.pointsTie} · No result {t.pointsNr}. Level teams are split by wins, then net run rate, then head-to-head.
        {t.qualifyPerGroup > 0 && ` The top ${t.qualifyPerGroup} in each ${data.tables.length > 1 ? 'group' : 'table'} qualify (Q); the rest are eliminated (E) once the group is complete.`}
      </div>
      {data.adjustments.length > 0 && (
        <div className="card"><div className="card-head"><h2>Table adjustments</h2></div>
          {data.adjustments.map((a) => <div key={a.id} className="row between small" style={{ padding: '4px 0' }}><span><b>{a.teamName}</b> · {a.reason}</span><span className="num">{a.pointsDelta > 0 ? '+' : ''}{a.pointsDelta} pts</span></div>)}
        </div>
      )}
    </div>
  )
}

function Bracket({ matches }: { matches: MatchSummary[] }) {
  // A round is every knockout match sharing a code prefix: QF1..QF4, SF1..SF2, F.
  const rounds = new Map<string, MatchSummary[]>()
  for (const m of matches) {
    const key = (m.code ?? '').replace(/-?\d+$/, '')
    rounds.set(key, [...(rounds.get(key) ?? []), m])
  }
  const side = (m: MatchSummary, team: MatchSummary['teamA'], source: string | null) => (
    <div className={team && m.winnerId === team.id ? 'won' : ''}>
      <span className={`row truncate ${team ? '' : 'tbd'}`}>{team && <Badge team={team} />}{team ? team.name : sourceLabel(source)}</span>
      <span className="num">{scoreOf(m, team?.id).split(' ')[0]}</span>
    </div>
  )
  return (
    <div className="bracket">
      {[...rounds.values()].map((list) => (
        <div key={list[0].id} className="round">
          <div className="small dim" style={{ fontWeight: 800, textTransform: 'uppercase' }}>{(list[0].label ?? '').replace(/ \d+$/, '')}</div>
          {list.map((m) => <Link key={m.id} to={`/matches/${m.id}`} className="tie">{side(m, m.teamA, m.sourceA)}{side(m, m.teamB, m.sourceB)}</Link>)}
        </div>
      ))}
    </div>
  )
}

function TeamsTab({ data }: { data: TournamentView }) {
  if (!data.teams.length) return <div className="card empty">No teams have been added yet.</div>
  return (
    <div className="grid thirds">
      {data.teams.map((e) => (
        <Link key={e.team.id} to={`/teams/${e.team.id}`} className="card row"><Badge team={e.team} large />
          <div className="grow"><div className="truncate" style={{ fontWeight: 800 }}>{e.team.name}</div>{e.groupName && e.groupName !== 'League' && <div className="muted small">Group {e.groupName}</div>}</div></Link>
      ))}
    </div>
  )
}

function Leaders({ id }: { id: string }) {
  const { data, error, loading } = useApi<Board[]>(`/tournaments/${id}/leaderboards`)
  if (!data) return <Status loading={loading} error={error} />
  return (
    <div className="grid thirds">
      {data.map((b) => (
        <div key={b.key} className="card">
          <div className="card-head"><h2>{b.title}</h2></div>
          {b.entries.slice(0, 5).map((e, i) => (
            <Link to={`/players/${e.playerId}`} key={e.playerId} className="row" style={{ padding: '7px 0', borderTop: i ? '1px solid var(--line)' : 0 }}>
              <span className="dim num" style={{ width: 16 }}>{i + 1}</span>
              <div className="grow"><div className="truncate" style={{ fontWeight: 700 }}>{e.name}</div><div className="small muted truncate">{e.detail}</div></div>
              <span className={`num ${i === 0 ? 'brand' : ''}`} style={{ fontWeight: 800, fontSize: 17 }}>{e.value}</span>
            </Link>
          ))}
          {!b.entries.length && <div className="muted small">No figures yet.</div>}
        </div>
      ))}
    </div>
  )
}

function Organiser({ data, reload }: { data: TournamentView; reload: () => Promise<void> }) {
  const nav = useNavigate()
  const t = data.tournament
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [form, setForm] = useState({ ...t })
  const [teamName, setTeamName] = useState('')
  const [groups, setGroups] = useState(2)
  const [adjTeam, setAdjTeam] = useState(data.teams[0]?.team.id ?? '')
  const [adjPoints, setAdjPoints] = useState(-1)
  const [adjReason, setAdjReason] = useState('')
  const started = data.fixtures.some((f) => f.state !== 'SCHEDULED')

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); await reload(); setMsg({ ok: true, text: ok }) } catch (e) { setMsg({ ok: false, text: errorText(e) }) }
  }
  const base = `/tournaments/${t.id}`
  const num = (k: keyof typeof form) => (
    <input className="input" type="number" value={form[k] as number} onChange={(e) => setForm({ ...form, [k]: +e.target.value })} />
  )
  return (
    <div className="col" style={{ gap: 14 }}>
      {msg && <div className={`note ${msg.ok ? 'info' : 'error'}`}>{msg.text}</div>}
      <div className="card col">
        <h2>1 · Format and rules</h2>
        <div className="form-grid">
          <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Structure"><select className="input" value={form.structure} disabled={data.fixtures.length > 0} onChange={(e) => setForm({ ...form, structure: e.target.value as typeof form.structure })}>
            {Object.entries(STRUCTURES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Overs per innings">{num('overs')}</Field>
          <Field label="Players per side">{num('playersPerSide')}</Field>
          <Field label="Balls per over">{num('ballsPerOver')}</Field>
          <Field label={form.structure === 'LEAGUE' ? 'Teams into playoffs (0 = league only)' : 'Qualifiers per group'}>{num('qualifyPerGroup')}</Field>
          <Field label="Points: win">{num('pointsWin')}</Field>
          <Field label="Points: loss">{num('pointsLoss')}</Field>
          <Field label="Points: tie">{num('pointsTie')}</Field>
          <Field label="Points: no result">{num('pointsNr')}</Field>
          <Field label="Start date"><input className="input" type="date" value={form.startDate ?? ''} onChange={(e) => setForm({ ...form, startDate: e.target.value || null })} /></Field>
          <Field label="Venue"><input className="input" value={form.venue ?? ''} onChange={(e) => setForm({ ...form, venue: e.target.value })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={form.doubleRound} onChange={(e) => setForm({ ...form, doubleRound: e.target.checked })} />Double round-robin (home and away)</label>
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => run(() => api('PUT', base, form), 'Settings saved. Regenerate fixtures to apply rule changes to matches.')}>Save settings</button>
      </div>

      <div className="card col">
        <h2>2 · Teams{t.structure === 'GROUPS_KNOCKOUT' ? ' and groups' : ''}</h2>
        {data.teams.map((e) => (
          <div key={e.team.id} className="row between wrap">
            <span className="row"><Badge team={e.team} />{e.team.name}</span>
            <span className="row">
              {t.structure === 'GROUPS_KNOCKOUT' && (
                <select className="input" style={{ width: 110 }} value={e.groupName ?? ''} aria-label={`Group for ${e.team.name}`}
                  onChange={(ev) => run(() => api('PUT', `${base}/teams/${e.team.id}`, { groupName: ev.target.value }), 'Group updated')}>
                  <option value="">No group</option>{['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((g) => <option key={g} value={g}>Group {g}</option>)}
                </select>
              )}
              <button className="btn sm danger" onClick={() => run(() => api('DELETE', `${base}/teams/${e.team.id}`), 'Team removed')}>Remove</button>
            </span>
          </div>
        ))}
        <form className="row" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api('POST', `${base}/teams`, { name: teamName }); setTeamName('') }, 'Team added') }}>
          <input className="input" placeholder="New team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} required /><button className="btn">Add team</button>
        </form>
        {t.structure === 'GROUPS_KNOCKOUT' && (
          <div className="row wrap">
            <span className="muted small">Random draw into</span>
            <input className="input" style={{ width: 80 }} type="number" min={1} max={8} value={groups} onChange={(e) => setGroups(+e.target.value)} aria-label="Number of groups" />
            <span className="muted small">groups</span>
            <button className="btn" onClick={() => run(() => api('POST', `${base}/draw`, { groups }), 'Groups drawn')}>Run the draw</button>
          </div>
        )}
      </div>

      <div className="card col">
        <h2>3 · Fixtures</h2>
        <div className="muted small">Generates the full schedule: every team plays each other in its group, then knockouts are filled from the final group positions and earlier winners. Edit any fixture's date, ground or scorers from its match page.</div>
        <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={started} onClick={() => {
          if (!data.fixtures.length || window.confirm('Replace the existing fixtures with a fresh schedule?')) void run(() => api('POST', `${base}/fixtures`), 'Fixtures generated')
        }}>{data.fixtures.length ? 'Regenerate fixtures' : 'Generate fixtures'}</button>
        {started && <div className="muted small">Matches have started, so the schedule can no longer be regenerated.</div>}
      </div>

      {data.tables.length > 0 && (
        <div className="card col">
          <h2>Adjust the points table</h2>
          <div className="form-grid">
            <Field label="Team"><select className="input" value={adjTeam} onChange={(e) => setAdjTeam(e.target.value)}>{data.teams.map((e) => <option key={e.team.id} value={e.team.id}>{e.team.name}</option>)}</select></Field>
            <Field label="Points (+ or −)"><input className="input" type="number" value={adjPoints} onChange={(e) => setAdjPoints(+e.target.value)} /></Field>
          </div>
          <Field label="Reason (shown publicly and logged)"><input className="input" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="e.g. Slow over rate" /></Field>
          <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={!adjReason.trim() || !adjTeam}
            onClick={() => run(async () => { await api('POST', `${base}/adjustments`, { teamId: adjTeam, pointsDelta: adjPoints, reason: adjReason }); setAdjReason('') }, 'Adjustment recorded')}>Apply adjustment</button>
          <div className="muted small">For a walkover or forfeit, open the fixture and use Manage → Set or override the result.</div>
        </div>
      )}

      <button className="btn danger" style={{ alignSelf: 'flex-start' }} onClick={() => {
        if (window.confirm('Delete this tournament with all its fixtures and scores? This cannot be undone.')) void run(async () => { await api('DELETE', base); nav('/tournaments') }, 'Deleted')
      }}>Delete tournament</button>
    </div>
  )
}
