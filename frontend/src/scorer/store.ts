import { api, ApiError, store, uuid } from '../api'
import { replay } from '../engine'
import type { Ball, BallInput, InningsView, MatchView, Rules } from '../types'

type Op = { method: string; path: string; body?: unknown }
export type Lock = 'unknown' | 'mine' | 'other'

/**
 * Local-first scoring. Every action changes the local copy at once, is saved to the device, and joins an
 * ordered queue that is sent when there is a connection. Server operations are idempotent, so a retry
 * after a dropped connection can never record a ball twice (NFR-REL-02).
 */
export class ScorerStore {
  doc: MatchView | null = null
  queue: Op[] = []
  online = true
  loading = true
  error: string | null = null
  lock: Lock = 'unknown'

  private version = 0
  private listeners = new Set<() => void>()
  private flushing = false
  private reloadWhenDrained = false
  private timer: number | undefined
  private readonly matchId: string

  constructor(matchId: string) {
    this.matchId = matchId
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => { this.listeners.delete(l) }
  }
  snapshot = () => this.version

  private emit() {
    this.version++
    if (this.doc) store.set(`wk:doc:${this.matchId}`, JSON.stringify(this.doc))
    store.set(`wk:queue:${this.matchId}`, this.queue.length ? JSON.stringify(this.queue) : null)
    this.listeners.forEach((l) => l())
  }

  // ---------- lifecycle ----------

  async init() {
    try {
      this.queue = JSON.parse(store.get(`wk:queue:${this.matchId}`) ?? '[]')
      const saved = store.get(`wk:doc:${this.matchId}`)
      if (saved) this.doc = JSON.parse(saved)
    } catch { this.queue = [] }
    // Unsent balls on this device win over the server copy until they have synced.
    if (!(this.queue.length && this.doc)) {
      this.queue = []
      try {
        await this.reload()
      } catch (e) {
        if (e instanceof ApiError) this.error = e.message
        else if (!this.doc) this.error = 'No connection, and this match has not been opened on this device before.'
        this.online = e instanceof ApiError
      }
    }
    this.loading = false
    this.emit()
    window.addEventListener('online', this.wake)
    this.timer = window.setInterval(this.wake, 5000)
    void this.claim(false)
    void this.flush()
  }

  dispose() {
    window.removeEventListener('online', this.wake)
    window.clearInterval(this.timer)
  }

  private wake = () => { if (this.queue.length) void this.flush() }

  async reload() {
    const doc = await api<MatchView>('GET', `/matches/${this.matchId}/scoring`)
    if (this.queue.length) return // a ball was recorded while this was in flight; the local copy is newer
    this.doc = doc
    this.recompute()
  }

  async claim(force: boolean) {
    try {
      const r = await api<{ mine: boolean }>('POST', `/matches/${this.matchId}/claim?force=${force}`)
      this.lock = r.mine ? 'mine' : 'other'
      if (force) { this.error = null; await this.reload() }
    } catch (e) {
      if (e instanceof ApiError) this.error = e.message
    }
    this.emit()
  }

  dismissError() { this.error = null; this.emit() }

  // ---------- sync ----------

  private push(op: Op) {
    const last = this.queue[this.queue.length - 1]
    // Repeated player changes before a ball collapse into one request.
    if (last && op.method === 'PUT' && op.path.endsWith('/players') && last.method === 'PUT' && last.path === op.path) last.body = op.body
    else this.queue.push(op)
    this.emit()
    void this.flush()
  }

  async flush() {
    if (this.flushing) return
    this.flushing = true
    try {
      while (this.queue.length) {
        const op = this.queue[0]
        try {
          await api(op.method, op.path, op.body)
        } catch (e) {
          if (e instanceof ApiError && [400, 403, 404, 409].includes(e.status)) {
            // The server refused this action; later queued actions depend on it. Fall back to the server's copy.
            if (e.status === 409 && /another device/i.test(e.message)) this.lock = 'other'
            this.error = `${e.message}. Reloaded the match from the server.`
            this.queue = []
            try { await this.reload() } catch { /* stay on local copy */ }
          } else {
            this.online = !(e instanceof ApiError) ? false : this.online
            if (e instanceof ApiError) this.error = e.status === 401 ? 'Sign in again to sync your balls.' : 'Server error. Will keep retrying.'
          }
          return
        }
        this.online = true
        this.queue.shift()
        this.emit()
      }
      if (this.reloadWhenDrained) {
        this.reloadWhenDrained = false
        try { await this.reload() } catch { /* keep local */ }
      }
    } finally {
      this.flushing = false
      this.emit()
    }
  }

  // ---------- derived ----------

  names(): Map<string, string> {
    const m = new Map<string, string>()
    for (const t of [this.doc?.teamA, this.doc?.teamB]) t?.players.forEach((p) => m.set(p.id, p.name))
    return m
  }

  rulesFor(inn: InningsView): Rules {
    return { ...this.doc!.rules, overs: inn.revisedOvers ?? this.doc!.rules.overs }
  }

  current(): InningsView | null {
    const list = this.doc?.innings ?? []
    return list.length ? list[list.length - 1] : null
  }

  private recompute() {
    if (!this.doc) return
    const names = this.names()
    for (const inn of this.doc.innings) inn.state = replay(this.rulesFor(inn), inn.target, inn.balls ?? [], names)
  }

  private path(inn: InningsView, rest: string) {
    return `/matches/${this.matchId}/innings/${inn.no}${rest}`
  }

  private close(inn: InningsView) {
    const doc = this.doc!
    inn.closed = true
    if (inn.no === 1) { doc.summary.state = 'INNINGS_BREAK'; return }
    // Provisional wording until the server's result arrives.
    const first = doc.innings[0], target = inn.target ?? first.state.runs + 1
    const team = (id: string) => (doc.teamA?.id === id ? doc.teamA.name : doc.teamB?.name) ?? 'Team'
    const r = this.rulesFor(inn)
    const left = (r.lastManStands ? r.playersPerSide : r.playersPerSide - 1) - inn.state.wickets
    doc.summary.state = 'COMPLETED'
    doc.summary.resultText = inn.state.runs >= target ? `${team(inn.battingTeamId)} won by ${left} wicket${left === 1 ? '' : 's'}`
      : inn.state.runs === target - 1 ? 'Match tied'
      : `${team(first.battingTeamId)} won by ${target - 1 - inn.state.runs} run${target - 1 - inn.state.runs === 1 ? '' : 's'}`
    this.reloadWhenDrained = true
  }

  // ---------- actions ----------

  start(tossWinnerId: string, decision: 'BAT' | 'BOWL') {
    const doc = this.doc!
    if (doc.summary.state !== 'SCHEDULED' || !doc.teamA || !doc.teamB) return
    const other = doc.teamA.id === tossWinnerId ? doc.teamB.id : doc.teamA.id
    doc.tossWinnerId = tossWinnerId
    doc.tossDecision = decision
    doc.innings = [this.blank(1, decision === 'BAT' ? tossWinnerId : other, decision === 'BAT' ? other : tossWinnerId, null, null)]
    doc.summary.state = 'LIVE'
    this.recompute()
    this.push({ method: 'POST', path: `/matches/${this.matchId}/start`, body: { tossWinnerId, decision } })
  }

  private blank(no: number, battingTeamId: string, bowlingTeamId: string, target: number | null, revisedOvers: number | null): InningsView {
    return { no, battingTeamId, bowlingTeamId, target, revisedOvers, closed: false, strikerId: null, nonStrikerId: null, bowlerId: null,
      balls: [], state: replay(this.doc!.rules, target, []) }
  }

  startSecondInnings() {
    const doc = this.doc!, first = doc.innings[0]
    if (!first?.closed || doc.innings.length > 1) return
    doc.innings.push(this.blank(2, first.bowlingTeamId, first.battingTeamId, first.state.runs + 1, first.revisedOvers))
    doc.summary.state = 'LIVE'
    this.recompute()
    this.push({ method: 'POST', path: `/matches/${this.matchId}/innings/2/start` })
  }

  setPlayers(p: Partial<Pick<InningsView, 'strikerId' | 'nonStrikerId' | 'bowlerId'>>) {
    const inn = this.current()
    if (!inn || inn.closed) return
    Object.assign(inn, p)
    this.push({ method: 'PUT', path: this.path(inn, '/players'), body: { strikerId: inn.strikerId, nonStrikerId: inn.nonStrikerId, bowlerId: inn.bowlerId } })
  }

  swapStrike() {
    const inn = this.current()
    if (inn?.strikerId && inn.nonStrikerId) this.setPlayers({ strikerId: inn.nonStrikerId, nonStrikerId: inn.strikerId })
  }

  addPlayer(teamId: string, name: string): string {
    const doc = this.doc!, id = uuid()
    const team = doc.teamA?.id === teamId ? doc.teamA : doc.teamB
    team?.players.push({ id, name })
    this.push({ method: 'POST', path: `/teams/${teamId}/players`, body: { id, name } })
    return id
  }

  addBall(input: BallInput) {
    const inn = this.current()
    if (!inn || inn.closed || !inn.strikerId || !inn.bowlerId) return
    const ball: Ball = {
      id: uuid(), strikerId: inn.strikerId, nonStrikerId: inn.nonStrikerId, bowlerId: inn.bowlerId,
      runsBat: 0, extraType: 'NONE', extraRuns: 0, subExtra: null, dismissal: null, dismissedId: null, fielderId: null, ...input,
    }
    inn.balls!.push(ball)
    this.recompute()
    inn.strikerId = inn.state.nextStriker
    inn.nonStrikerId = inn.state.nextNonStriker
    if (inn.state.overComplete) inn.bowlerId = null
    if (inn.state.complete) this.close(inn)
    this.push({ method: 'POST', path: this.path(inn, '/balls'), body: ball })
  }

  canUndo(): boolean {
    const list = this.doc?.innings ?? []
    return list.some((i) => (i.balls?.length ?? 0) > 0) && !(list.length > 1 && list[1].balls!.length === 0 && list[0].balls!.length === 0)
  }

  /** Removes the last ball and restores exactly who was batting and bowling (FR-SCR-14). */
  undo() {
    const doc = this.doc!
    let inn = this.current()
    if (!inn) return
    if (inn.no === 2 && inn.balls!.length === 0) { doc.innings.pop(); inn = this.current()! } // server drops the empty innings too
    const ball = inn.balls!.pop()
    if (!ball) return
    inn.strikerId = ball.strikerId
    inn.nonStrikerId = ball.nonStrikerId
    inn.bowlerId = ball.bowlerId
    inn.closed = false
    doc.summary.state = 'LIVE'
    doc.summary.resultText = null
    this.recompute()
    this.push({ method: 'DELETE', path: this.path(inn, `/balls/${ball.id}`) })
  }

  editBall(inningsNo: number, ballId: string, patch: BallInput) {
    const doc = this.doc!, inn = doc.innings.find((i) => i.no === inningsNo)
    const ball = inn?.balls?.find((b) => b.id === ballId)
    if (!inn || !ball) return
    Object.assign(ball, patch)
    if (inn.no === 1 && doc.innings[1]) doc.innings[1].target = replay(this.rulesFor(inn), null, inn.balls!).runs + 1
    this.recompute()
    if (!inn.closed) {
      if (inn.balls![inn.balls!.length - 1].id === ballId) { inn.strikerId = inn.state.nextStriker; inn.nonStrikerId = inn.state.nextNonStriker }
      if (inn.state.complete) this.close(inn)
    }
    this.reloadWhenDrained = true
    this.push({ method: 'PUT', path: this.path(inn, `/balls/${ballId}`), body: ball })
  }

  endInnings() {
    const inn = this.current()
    if (!inn || inn.closed) return
    this.close(inn)
    this.push({ method: 'POST', path: this.path(inn, '/end') })
  }

  revise(overs: number | null, target: number | null) {
    const inn = this.current()
    if (!inn || inn.closed) return
    if (overs !== null) inn.revisedOvers = overs
    if (target !== null && inn.no === 2) inn.target = target
    this.recompute()
    if (inn.state.complete) this.close(inn)
    this.push({ method: 'PUT', path: this.path(inn, '/revise'), body: { overs, target: inn.no === 2 ? target : null } })
  }

  /** Abandon, award or otherwise override the result. Needs a connection: it is an organiser decision, not a ball. */
  async setResult(resultType: string, winnerId: string | null, reason: string) {
    await this.flush()
    if (this.queue.length) throw new Error('Balls are still waiting to sync. Try again when you are back online.')
    await api('POST', `/matches/${this.matchId}/result`, { resultType, winnerId, reason })
    await this.reload()
    this.emit()
  }
}
