import { useState, type FormEvent } from 'react'
import { UserPlus } from 'lucide-react'
import { api, errorText, useApi } from '../api'
import type { ScorerAccount } from '../types'
import { Field, Modal, Status, initials } from '../ui'
import toast from 'react-hot-toast'
import { confirm } from '../confirm'

/** Admin only: the scorer accounts that can score this admin's matches. */
export default function Scorers() {
  const { data, error, loading, reload } = useApi<ScorerAccount[]>('/scorers')
  const [open, setOpen] = useState(false)
  const [resetFor, setResetFor] = useState<ScorerAccount | null>(null)

  const remove = async (s: ScorerAccount) => {
    if (!(await confirm({ title: `Delete scorer "${s.username ?? s.name}"?`, message: 'They will be signed out straight away and can no longer score your matches.', yes: 'Yes, delete', danger: true }))) return
    try { await api('DELETE', `/scorers/${s.id}`); toast.success('Scorer deleted'); await reload() } catch (e) { toast.error(errorText(e)) }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Scorers</h1><div className="muted small">Scorers can score your matches. Only you can create or delete teams, players, tournaments and matches.</div></div>
        <button className="btn primary" onClick={() => setOpen(true)}><UserPlus size={16} />New scorer</button>
      </div>
      <Status loading={loading} error={error} />
      {data && !data.length && <div className="card empty">No scorers yet. Create one and give them the username and password so they can sign in and score.</div>}
      {data && data.length > 0 && (
        <div className="card flush">
          <div className="table-scroll"><table className="table">
            <thead><tr><th className="left">Username</th><th className="left">Email</th><th /></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td className="left"><span className="row"><span className="avatar">{initials(s.username ?? s.name)}</span><span className="strong">{s.username ?? s.name}</span></span></td>
                  <td className="left muted">{s.email}</td>
                  <td><span className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn sm" onClick={() => setResetFor(s)}>Reset password</button>
                    <button className="btn sm danger" onClick={() => remove(s)}>Delete</button>
                  </span></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
      {open && <NewScorer onClose={() => setOpen(false)} onDone={async (u) => { setOpen(false); toast.success(`Scorer "${u}" created. They can sign in with that username or email.`); await reload() }} />}
      {resetFor && <ResetPassword s={resetFor} onClose={() => setResetFor(null)} onDone={() => { setResetFor(null); toast.success('Password changed') }} />}
    </div>
  )
}

function NewScorer({ onClose, onDone }: { onClose: () => void; onDone: (username: string) => void }) {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try { const u = await api<ScorerAccount>('POST', '/scorers', { email, username, password }); onDone(u.username ?? username) }
    catch (x) { toast.error(errorText(x)) } finally { setBusy(false) }
  }
  return (
    <Modal title="New scorer" onClose={onClose}>
      <form className="col" onSubmit={submit}>
        <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></Field>
        <Field label="Username (letters, numbers, . _ -)">
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={30} pattern="[A-Za-z0-9._\-]+" autoComplete="off" />
        </Field>
        <Field label="Password (8 characters or more)">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        </Field>
        <button className="btn primary" disabled={busy}>Create scorer</button>
      </form>
    </Modal>
  )
}

function ResetPassword({ s, onClose, onDone }: { s: ScorerAccount; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try { await api('PUT', `/scorers/${s.id}/password`, { password }); onDone() } catch (x) { toast.error(errorText(x)) }
  }
  return (
    <Modal title={`New password for ${s.username ?? s.name}`} onClose={onClose}>
      <form className="col" onSubmit={submit}>
        <Field label="New password (8 characters or more)">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" autoFocus />
        </Field>
        <button className="btn primary">Change password</button>
      </form>
    </Modal>
  )
}
