import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorText, useApi } from '../api'
import type { TeamRef } from '../types'
import { Field } from '../ui'

const FORMATS: Record<string, { overs: number; balls: number }> = {
  T20: { overs: 20, balls: 6 }, T10: { overs: 10, balls: 6 }, '50 overs': { overs: 50, balls: 6 },
  'The Hundred': { overs: 20, balls: 5 }, Custom: { overs: 6, balls: 6 },
}

export default function NewMatch() {
  const nav = useNavigate()
  const { data: mine } = useApi<TeamRef[]>('/me/teams')
  const [teamA, setTeamA] = useState('')
  const [teamB, setTeamB] = useState('')
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
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pickFormat = (f: string) => { setFormat(f); setOvers(FORMATS[f].overs); setBalls(FORMATS[f].balls) }
  const team = (name: string, side: 'A' | 'B') => {
    const known = mine?.find((t) => t.name.toLowerCase() === name.trim().toLowerCase())
    return known ? { [`team${side}Id`]: known.id } : { [`team${side}Name`]: name.trim() }
  }

  const submit = async (e: FormEvent, score: boolean) => {
    e.preventDefault()
    if (!teamA.trim() || !teamB.trim()) { setError('Enter both team names'); return }
    setBusy(true)
    try {
      const { id } = await api<{ id: string }>('POST', '/matches', {
        ...team(teamA, 'A'), ...team(teamB, 'B'), format: format === 'Custom' ? `${overs} overs` : format, overs, ballsPerOver, playersPerSide,
        maxOversPerBowler, wideRuns, noBallRuns, freeHit, lastManStands, listed, practice, ground: ground || null,
        scheduledAt: when ? new Date(when).toISOString() : null,
      })
      nav(score ? `/matches/${id}/score` : `/matches/${id}`)
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div className="page-head"><div><h1>Start a match</h1><div className="muted small">Two team names and an overs count is enough. Players can be added as they come in.</div></div></div>
      <form className="card col" style={{ gap: 14 }} onSubmit={(e) => submit(e, true)}>
        <datalist id="my-teams">{mine?.map((t) => <option key={t.id} value={t.name} />)}</datalist>
        <div className="form-grid">
          <Field label="Team A"><input className="input" list="my-teams" value={teamA} onChange={(e) => setTeamA(e.target.value)} placeholder="e.g. Lions" autoFocus /></Field>
          <Field label="Team B"><input className="input" list="my-teams" value={teamB} onChange={(e) => setTeamB(e.target.value)} placeholder="e.g. Tigers" /></Field>
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
        {error && <div className="note error">{error}</div>}
        <div className="row wrap">
          <button className="btn primary" disabled={busy}>Create and start scoring</button>
          <button type="button" className="btn" disabled={busy} onClick={(e) => submit(e, false)}>Save as a fixture</button>
        </div>
      </form>
    </div>
  )
}
