import { useEffect, useRef, useSyncExternalStore } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'

/** Options for the yes/no pop-up. `danger` styles it for deleting things. */
export type ConfirmOptions = { title: string; message?: string; yes?: string; no?: string; danger?: boolean }

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void }
let pending: Pending | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Shows the app's own yes/no pop-up and resolves to true for yes, false for no. Use instead of window.confirm. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  pending?.resolve(false)
  return new Promise((resolve) => { pending = { ...opts, resolve }; emit() })
}

function answer(ok: boolean) {
  const p = pending
  pending = null
  emit()
  p?.resolve(ok)
}

/** Mounted once at the root; renders whichever confirmation is waiting. */
export function ConfirmHost() {
  const p = useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => pending)
  const noRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!p) return
    noRef.current?.focus() // the safe choice has focus, so a stray Enter never deletes anything
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') answer(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p])
  if (!p) return null
  const Icon = p.danger ? AlertTriangle : HelpCircle
  return (
    <div className="modal-back confirm-back" onClick={() => answer(false)}>
      <div className={`modal confirm ${p.danger ? 'danger' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"
        aria-describedby={p.message ? 'confirm-msg' : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon"><Icon size={22} /></div>
        <h2 id="confirm-title">{p.title}</h2>
        {p.message && <p id="confirm-msg" className="muted">{p.message}</p>}
        <div className="confirm-actions">
          <button ref={noRef} className="btn" onClick={() => answer(false)}>{p.no ?? 'No, keep it'}</button>
          <button className={`btn ${p.danger ? 'destroy' : 'primary'}`} onClick={() => answer(true)}>{p.yes ?? 'Yes'}</button>
        </div>
      </div>
    </div>
  )
}
