// Client copy of the scoring rules (backend: com.wicketly.engine.ScoringEngine). The scorer screen replays
// balls locally so it updates instantly and keeps working with no connection; the server replays the same
// balls with the Java engine and stays the source of truth for every public page. Keep the two in step.
import type { Ball, Batter, Bowler, Dismissal, ExtraType, InningsState, Over, Partnership, Rules } from './types'

const BOWLER_CREDIT: Dismissal[] = ['BOWLED', 'CAUGHT', 'CAUGHT_AND_BOWLED', 'LBW', 'STUMPED', 'HIT_WICKET']
const BETWEEN_BALLS: Dismissal[] = ['RETIRED_OUT', 'RETIRED_HURT', 'TIMED_OUT']

export const DISMISSAL_LABEL: Record<Dismissal, string> = {
  BOWLED: 'Bowled', CAUGHT: 'Caught', CAUGHT_AND_BOWLED: 'Caught & bowled', LBW: 'LBW', RUN_OUT: 'Run out',
  STUMPED: 'Stumped', HIT_WICKET: 'Hit wicket', RETIRED_OUT: 'Retired out', OBSTRUCTING_FIELD: 'Obstructing the field',
  TIMED_OUT: 'Timed out', HIT_BALL_TWICE: 'Hit the ball twice', RETIRED_HURT: 'Retired hurt (not out)',
}

export const isWicket = (d: Dismissal | null) => d !== null && d !== 'RETIRED_HURT'
const offDelivery = (d: Dismissal) => !BETWEEN_BALLS.includes(d)
export const isDelivery = (b: Pick<Ball, 'extraType' | 'dismissal'>) =>
  b.extraType !== 'PENALTY' && (b.dismissal === null || offDelivery(b.dismissal))
export const isLegal = (b: Pick<Ball, 'extraType' | 'dismissal'>) => isDelivery(b) && b.extraType !== 'WIDE' && b.extraType !== 'NO_BALL'

/** Only dismissals that can happen on this kind of delivery (FR-SCR-09). */
export function allowedDismissals(extra: ExtraType, freeHit: boolean): Dismissal[] {
  switch (extra) {
    case 'WIDE': return ['RUN_OUT', 'STUMPED', 'HIT_WICKET', 'OBSTRUCTING_FIELD']
    case 'NO_BALL': return ['RUN_OUT', 'OBSTRUCTING_FIELD', 'HIT_BALL_TWICE']
    case 'BYE': case 'LEG_BYE': return ['RUN_OUT', 'OBSTRUCTING_FIELD']
    case 'PENALTY': return []
    case 'NONE': return [
      ...(freeHit ? (['RUN_OUT', 'OBSTRUCTING_FIELD', 'HIT_BALL_TWICE'] as Dismissal[])
        : (['BOWLED', 'CAUGHT', 'CAUGHT_AND_BOWLED', 'LBW', 'RUN_OUT', 'STUMPED', 'HIT_WICKET', 'OBSTRUCTING_FIELD', 'HIT_BALL_TWICE'] as Dismissal[])),
      ...BETWEEN_BALLS,
    ]
  }
}

function label(b: Ball, wicket: boolean): string {
  let l: string
  switch (b.extraType) {
    case 'WIDE': l = (b.extraRuns > 0 ? b.extraRuns : '') + 'wd'; break
    case 'NO_BALL': l = (b.runsBat + b.extraRuns > 0 ? b.runsBat + b.extraRuns : '') + 'nb'; break
    case 'BYE': l = b.extraRuns + 'b'; break
    case 'LEG_BYE': l = b.extraRuns + 'lb'; break
    case 'PENALTY': l = '+' + b.extraRuns; break
    default: l = b.dismissal !== null && !offDelivery(b.dismissal) ? 'ret' : String(b.runsBat)
  }
  if (!wicket) return l
  return l === '0' || l === 'ret' ? 'W' : l + 'W'
}

function howOut(b: Batter, n: (id: string | null) => string): string {
  const bw = n(b.bowlerId), f = n(b.fielderId)
  switch (b.dismissal) {
    case null: return 'not out'
    case 'BOWLED': return `b ${bw}`
    case 'CAUGHT': return `c ${f || 'sub'} b ${bw}`
    case 'CAUGHT_AND_BOWLED': return `c & b ${bw}`
    case 'LBW': return `lbw b ${bw}`
    case 'RUN_OUT': return 'run out' + (f ? ` (${f})` : '')
    case 'STUMPED': return `st ${f} b ${bw}`
    case 'HIT_WICKET': return `hit wicket b ${bw}`
    case 'RETIRED_OUT': return 'retired out'
    case 'RETIRED_HURT': return 'retired hurt'
    case 'OBSTRUCTING_FIELD': return 'obstructing the field'
    case 'TIMED_OUT': return 'timed out'
    case 'HIT_BALL_TWICE': return 'hit the ball twice'
  }
}

export function replay(rules: Rules, target: number | null, balls: Ball[], names: Map<string, string> = new Map()): InningsState {
  const name = (id: string | null) => (id ? names.get(id) ?? 'Unknown' : '')
  const st: InningsState = {
    runs: 0, wickets: 0, legalBalls: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0, oversText: '0.0',
    batters: [], bowlers: [], fow: [], partnerships: [], overs: [],
    freeHitNext: false, complete: false, allOut: false, overComplete: false, nextStriker: null, nextNonStriker: null, lastOverBowler: null,
  }
  const batter = (id: string): Batter => {
    let b = st.batters.find((x) => x.playerId === id)
    if (!b) { b = { playerId: id, name: name(id), runs: 0, balls: 0, fours: 0, sixes: 0, dismissal: null, bowlerId: null, fielderId: null, howOut: 'not out' }; st.batters.push(b) }
    return b
  }
  const bowlerOf = (id: string): Bowler => {
    let b = st.bowlers.find((x) => x.playerId === id)
    if (!b) { b = { playerId: id, name: name(id), balls: 0, maidens: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 }; st.bowlers.push(b) }
    return b
  }
  const bpo = rules.ballsPerOver
  const maxWickets = rules.lastManStands ? rules.playersPerSide : rules.playersPerSide - 1
  let stand: Partnership | null = null
  let freeHit = false
  let overMeta: { conceded: number; bowledBy: Set<string> } = { conceded: 0, bowledBy: new Set() }

  for (const b of balls) {
    const delivery = isDelivery(b), legal = isLegal(b), x = b.extraType
    const penalty = x === 'WIDE' ? rules.wideRuns : x === 'NO_BALL' ? rules.noBallRuns : 0
    const total = b.runsBat + b.extraRuns + penalty
    st.runs += total
    if (x === 'WIDE') st.wides += penalty + b.extraRuns
    else if (x === 'NO_BALL') { st.noBalls += penalty; if (b.subExtra === 'LEG_BYE') st.legByes += b.extraRuns; else st.byes += b.extraRuns }
    else if (x === 'BYE') st.byes += b.extraRuns
    else if (x === 'LEG_BYE') st.legByes += b.extraRuns
    else if (x === 'PENALTY') st.penalties += b.extraRuns

    const striker = batter(b.strikerId)
    if (b.nonStrikerId) batter(b.nonStrikerId)
    const faced = delivery && x !== 'WIDE'
    if (faced) {
      striker.balls++
      striker.runs += b.runsBat
      if (b.runsBat === 4) striker.fours++
      if (b.runsBat === 6) striker.sixes++
    }

    const bw = bowlerOf(b.bowlerId)
    let conceded = 0
    if (delivery) {
      conceded = b.runsBat + (x === 'WIDE' ? penalty + b.extraRuns : x === 'NO_BALL' ? penalty : 0)
      bw.runs += conceded
      if (legal) bw.balls++
      if (x === 'WIDE') bw.wides += penalty + b.extraRuns
      if (x === 'NO_BALL') bw.noBalls++
    }

    if (!stand) {
      stand = { batterA: b.strikerId, batterB: b.nonStrikerId, nameA: name(b.strikerId), nameB: name(b.nonStrikerId), runs: 0, balls: 0 }
      st.partnerships.push(stand)
    }
    stand.runs += total
    if (faced) stand.balls++

    const overNo = Math.floor(st.legalBalls / bpo) + 1
    let over: Over | undefined = st.overs[st.overs.length - 1]
    if (!over || over.number !== overNo) {
      over = { number: overNo, bowlerId: b.bowlerId, bowlerName: name(b.bowlerId), runs: 0, wickets: 0, balls: [] }
      st.overs.push(over)
      overMeta = { conceded: 0, bowledBy: new Set() }
    }
    over.runs += total
    overMeta.conceded += conceded
    if (delivery) overMeta.bowledBy.add(b.bowlerId)

    let s: string | null = b.strikerId, n: string | null = b.nonStrikerId
    const ran = x === 'NONE' ? b.runsBat : x === 'NO_BALL' ? b.runsBat + b.extraRuns : x === 'PENALTY' ? 0 : b.extraRuns
    if (ran % 2 === 1) [s, n] = [n, s]

    let wicket = false
    if (b.dismissal !== null) {
      const outId = b.dismissedId ?? b.strikerId
      const out = batter(outId)
      out.dismissal = b.dismissal
      out.fielderId = b.fielderId
      out.bowlerId = BOWLER_CREDIT.includes(b.dismissal) ? b.bowlerId : null
      if (isWicket(b.dismissal)) {
        wicket = true
        st.wickets++
        over.wickets++
        if (BOWLER_CREDIT.includes(b.dismissal)) bw.wickets++
        const lb = st.legalBalls + (legal ? 1 : 0)
        st.fow.push({ wicket: st.wickets, score: st.runs, playerId: outId, name: name(outId), over: `${Math.floor(lb / bpo)}.${lb % bpo}` })
      }
      stand = null
      if (outId === s) s = null
      else if (outId === n) n = null
    }
    over.balls.push(label(b, wicket))

    if (legal) {
      st.legalBalls++
      st.overComplete = st.legalBalls % bpo === 0
      if (st.overComplete) {
        ;[s, n] = [n, s]
        if (overMeta.conceded === 0 && overMeta.bowledBy.size === 1) bw.maidens++
        st.lastOverBowler = b.bowlerId
      }
    } else if (delivery) {
      st.overComplete = false
    }

    if (s === null && n !== null && rules.lastManStands && st.wickets >= rules.playersPerSide - 1) { s = n; n = null }
    st.nextStriker = s
    st.nextNonStriker = n
    if (delivery) freeHit = rules.freeHit && (x === 'NO_BALL' || (freeHit && x === 'WIDE'))
  }

  for (const bt of st.batters) {
    if (bt.dismissal === 'RETIRED_HURT' && (bt.playerId === st.nextStriker || bt.playerId === st.nextNonStriker)) bt.dismissal = null
    bt.howOut = howOut(bt, name)
  }
  st.freeHitNext = freeHit
  st.oversText = `${Math.floor(st.legalBalls / bpo)}.${st.legalBalls % bpo}`
  st.allOut = st.wickets >= maxWickets
  st.complete = st.allOut || st.legalBalls >= rules.overs * bpo || (target !== null && st.runs >= target)
  return st
}
