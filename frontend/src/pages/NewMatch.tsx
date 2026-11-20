import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorText, useApi } from '../api'
import type { TeamRef } from '../types'
import { BusyLabel, Field } from '../ui'
import toast from 'react-hot-toast'

const FORMATS: Record<string, { overs: number; balls: number }> = {
  T20: { overs: 20, balls: 6 }, T10: { overs: 10, balls: 6 }, '50 overs': { overs: 50, balls: 6 },
  'The Hundred': { overs: 20, balls: 5 }, Custom: { overs: 6, balls: 6 },
}

type Side = { mode: 'existing' | 'new'; id: string; name: string }

/** One side of the match: pick one of the admin's teams, or type a name to create a new team. */
function TeamPicker({ label, side, onChange, teams, taken, placeholder }: {
  label: string; side: Side; onChange: (s: Side) => void; teams: TeamRef[]; taken: string; placeholder: string
}) {
  return (
    <div className="field">
      <div className="row between">
        <span>{label}</span>
        {teams.length > 0 && (
          <span className="seg" role="group" aria-label={`${label}: existing or new team`}>
            <button type="button" className={side.mode === 'existing' ? 'on' : ''} aria-pressed={side.mode === 'existing'} onClick={() => onChange({ ...side, mode: 'existing' })}>Existing</button>
            <button type="button" className={side.mode === 'new' ? 'on' : ''} aria-pressed={side.mode === 'new'} onClick={() => onChange({ ...side, mode: 'new' })}>New</button>
          </span>
        )}
      </div>
      {side.mode === 'existing' ? (
        <select className="input" value={side.id} onChange={(e) => onChange({ ...side, id: e.target.value })} aria-label={label}>
          <option value="">Choose a team…</option>
          {teams.map((t) => <option key={t.id} value={t.id} disabled={t.id === taken}>{t.name}{t.id === taken ? ' (other side)' : ''}</option>)}
        </select>
      ) : (
        <input className="input" value={side.name} onChange={(e) => onChange({ ...side, name: e.target.value })} placeholder={placeholder} aria-label={`${label} name`} />
      )}
    </div>
  )
}

export default function NewMatch() {
  const nav = useNavigate()
  const { data: mine } = useApi<TeamRef[]>('/me/teams')
  const [teamA, setTeamA] = useState<Side>({ mode: 'existing', id: '', name: '' })
  const [teamB, setTeamB] = useState<Side>({ mode: 'existing', id: '', name: '' })
  const [format, setFormat] = useState('T20')
  const [overs, setOvers] = useState(20)
  const [ballsPerOver, setBalls] = useState(6)
  const [more, setMore] = useState(false)
  const [playersPerSide, setPlayers] = useState(11)
  const [maxOversPerBowler, setMaxOvers] = useState(0)
  const [wideRuns, setWide] = useState(1)
  const [noBallRuns, setNoBall] = useState(1)
  const [freeHit, setFreeHit] = useState(true)
  const [lastManStands, setLms] = useState(false)
  const [listed, setListed] = useState(true)
  const [practice, setPractice] = useState(false)
  const [ground, setGround] = useState('')
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState<'start' | 'save' | null>(null)

  const pickFormat = (f: string) => { setFormat(f); setOvers(FORMATS[f].overs); setBalls(FORMATS[f].balls) }
  const hasTeams = !!mine?.length
  // With no saved teams yet, both sides start as new teams.
  const sideA = hasTeams ? teamA : { ...teamA, mode: 'new' as const }
  const sideB = hasTeams ? teamB : { ...teamB, mode: 'new' as const }
  const team = (s: Side, side: 'A' | 'B') => {
    if (s.mode === 'existing') return { [`team${side}Id`]: s.id }
    const known = mine?.find((t) => t.name.toLowerCase() === s.name.trim().toLowerCase())
    return known ? { [`team${side}Id`]: known.id } : { [`team${side}Name`]: s.name.trim() }
  }
  const label = (s: Side) => (s.mode === 'existing' ? mine?.find((t) => t.id === s.id)?.name ?? '' : s.name.trim())

  const submit = async (e: FormEvent, score: boolean) => {
    e.preventDefault()
    if (!label(sideA) || !label(sideB)) { toast.error('Pick or name both teams'); return }
    if (label(sideA).toLowerCase() === label(sideB).toLowerCase()) { toast.error('A team cannot play itself. Pick two different teams.'); return }
    setBusy(score ? 'start' : 'save')
    try {
      const { id } = await api<{ id: string }>('POST', '/matches', {
        ...team(sideA, 'A'), ...team(sideB, 'B'), format: format === 'Custom' ? `${overs} overs` : format, overs, ballsPerOver, playersPerSide,
        maxOversPerBowler, wideRuns, noBallRuns, freeHit, lastManStands, listed, practice, ground: ground || null,
        scheduledAt: when ? new Date(when).toISOString() : null,
      })
      nav(score ? `/matches/${id}/score` : `/matches/${id}`)
    } catch (err) {
      toast.error(errorText(err))
      setBusy(null)
    }
  }

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div className="page-head"><div><h1>Start a match</h1><div className="muted small">Pick two of your teams, or name new ones. Players can be added before the toss.</div></div></div>
      <form className="card col" style={{ gap: 14 }} onSubmit={(e) => submit(e, true)}>
        <div className="form-grid">
          <TeamPicker label="Team A" side={sideA} onChange={setTeamA} teams={mine ?? []} taken={sideB.mode === 'existing' ? sideB.id : ''} placeholder="e.g. Lions" />
          <TeamPicker label="Team B" side={sideB} onChange={setTeamB} teams={mine ?? []} taken={sideA.mode === 'existing' ? sideA.id : ''} placeholder="e.g. Tigers" />
          <Field label="Format">
            <select className="input" value={format} onChange={(e) => pickFormat(e.target.value)}>{Object.keys(FORMATS).map((f) => <option key={f}>{f}</option>)}</select>
          </Field>
          <Field label="Overs per innings"><input className="input" type="number" min={1} max={100} value={overs} onChange={(e) => { setOvers(+e.target.value); setFormat('Custom') }} /></Field>
        </div>
        <button type="button" className="btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => setMore(!more)}>{more ? 'Hide' : 'Show'} match rules and schedule</button>
        {more && (
          <div className="form-grid">
            <Field label="Players per side (2–11)"><input className="input" type="number" min={2} max={11} value={playersPerSide} onChange={(e) => setPlayers(+e.target.value)} /></Field>
            <Field label="Balls per over (4–10)"><input className="input" type="number" min={4} max={10} value={ballsPerOver} onChange={(e) => setBalls(+e.target.value)} /></Field>
            <Field label="Max overs per bowler (0 = no limit)"><input className="input" type="number" min={0} value={maxOversPerBowler} onChange={(e) => setMaxOvers(+e.target.value)} /></Field>
            <Field label="Runs for a wide"><input className="input" type="number" min={0} max={5} value={wideRuns} onChange={(e) => setWide(+e.target.value)} /></Field>
            <Field label="Runs for a no-ball"><input className="input" type="number" min={0} max={5} value={noBallRuns} onChange={(e) => setNoBall(+e.target.value)} /></Field>
            <Field label="Ground"><input className="input" value={ground} onChange={(e) => setGround(e.target.value)} /></Field>
            <Field label="Date and time"><input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
            <div className="col" style={{ gap: 8 }}>
              <label className="check"><input type="checkbox" checked={freeHit} onChange={(e) => setFreeHit(e.target.checked)} />Free hit after a no-ball</label>
              <label className="check"><input type="checkbox" checked={lastManStands} onChange={(e) => setLms(e.target.checked)} />Last man stands</label>
              <label className="check"><input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} />Public (listed and searchable)</label>
              <label className="check"><input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} />Practice match (not in career stats)</label>
            </div>
          </div>
        )}
        <div className="row wrap">
          <button className="btn primary" disabled={!!busy} aria-busy={busy === 'start'}><BusyLabel busy={busy === 'start'} text="Creating…">Create and start scoring</BusyLabel></button>
          <button type="button" className="btn" disabled={!!busy} aria-busy={busy === 'save'} onClick={(e) => submit(e, false)}><BusyLabel busy={busy === 'save'} text="Saving…">Save as a fixture</BusyLabel></button>
        </div>
      </form>
    </div>
  )
}
