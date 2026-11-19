import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Trophy } from 'lucide-react'
import { api, errorText, useApi } from '../api'
import { useAuth } from '../auth'
import type { TournamentCard } from '../types'
import { Field, Modal, SignInPrompt, Status, fmtDate } from '../ui'
import toast from 'react-hot-toast'

export const STRUCTURES: Record<string, string> = { LEAGUE: 'Round-robin league', GROUPS_KNOCKOUT: 'Groups then knockouts', KNOCKOUT: 'Straight knockout' }

export function statusPill(status: string) {
  const cls = status === 'LIVE' ? 'live' : status === 'COMPLETED' ? 'good' : status === 'FIXTURES' ? 'brand' : ''
  return <span className={`pill ${cls}`}>{status === 'FIXTURES' ? 'Fixtures out' : status.toLowerCase()}</span>
}

export default function Tournaments() {
  const { user, ready } = useAuth()
  const nav = useNavigate()
  const { data, error, loading } = useApi<TournamentCard[]>(user ? '/tournaments' : null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [structure, setStructure] = useState('GROUPS_KNOCKOUT')
  const [overs, setOvers] = useState(20)
  const [startDate, setStart] = useState('')
  const [venue, setVenue] = useState('')
  const create = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const { id } = await api<{ id: string }>('POST', '/tournaments', { name, structure, overs, startDate: startDate || null, venue: venue || null })
      nav(`/tournaments/${id}?tab=manage`)
    } catch (x) { toast.error(errorText(x)) }
  }
  return (
    <div className="page">
      <div className="page-head"><h1>Tournaments</h1>
        {user?.admin && <button className="btn primary" onClick={() => setOpen(true)}><Plus size={16} />New tournament</button>}</div>
      {ready && !user && <SignInPrompt what="tournaments" />}
      <Status loading={loading} error={error} />
      {data && !data.length && <div className="card empty">{user?.admin ? 'No tournaments yet. Create one to get fixtures, a points table with net run rate, and a knockout bracket.' : 'Your admin has not created any tournaments yet.'}</div>}
      <div className="grid thirds">
        {data?.map((t) => (
          <Link key={t.id} to={`/tournaments/${t.id}`} className="card col">
            <div className="row between"><span className="tile-icon" style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--panel-3)', display: 'grid', placeItems: 'center', color: 'var(--brand)' }}><Trophy size={17} /></span>{statusPill(t.status)}</div>
            <div><div style={{ fontWeight: 800, fontSize: 16 }}>{t.name}</div><div className="muted small">{STRUCTURES[t.structure]} · {t.teams} teams</div></div>
            <div className="muted small">{[t.startDate && fmtDate(t.startDate, false), t.venue].filter(Boolean).join(' · ') || 'Dates not set'}</div>
          </Link>
        ))}
      </div>
      {open && (
        <Modal title="New tournament" onClose={() => setOpen(false)}>
          <form className="col" onSubmit={create}>
            <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
            <Field label="Structure"><select className="input" value={structure} onChange={(e) => setStructure(e.target.value)}>
              {Object.entries(STRUCTURES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <div className="form-grid">
              <Field label="Overs per innings"><input className="input" type="number" min={1} max={100} value={overs} onChange={(e) => setOvers(+e.target.value)} /></Field>
              <Field label="Start date"><input className="input" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /></Field>
            </div>
            <Field label="Venue"><input className="input" value={venue} onChange={(e) => setVenue(e.target.value)} /></Field>
            <button className="btn primary">Create tournament</button>
          </form>
        </Modal>
      )}
    </div>
  )
}
