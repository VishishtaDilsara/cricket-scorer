// Builds a printable PDF of a whole match: header, result, player of the match, and for each innings the
// batting and bowling cards, extras, fall of wickets, partnerships and an over-by-over log.
// jsPDF is loaded only when someone downloads a report, so it stays out of the main bundle.
import type { InningsView, MatchView } from './types'

export type ReportPom = { name: string; team: string | null; line: string; auto: boolean } | null

const oversOf = (balls: number, bpo: number) => `${Math.floor(balls / bpo)}.${balls % bpo}`
const rate = (runs: number, balls: number, per: number) => (balls ? ((runs * per) / balls).toFixed(2) : '-')
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null

export async function downloadMatchReport(v: MatchView, pom: ReportPom) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40
  const brand: [number, number, number] = [30, 77, 58], ink: [number, number, number] = [17, 24, 39], muted: [number, number, number] = [100, 116, 139]
  const m = v.summary, bpo = v.rules.ballsPerOver
  const teamName = (id: string | null) => (id && v.teamA?.id === id ? v.teamA.name : id && v.teamB?.id === id ? v.teamB.name : '') || 'TBD'
  const title = `${m.teamA?.name ?? 'TBD'} v ${m.teamB?.name ?? 'TBD'}`
  let y = M

  const tag = (id: string) => {
    const r = (v.roles ?? []).find((x) => x.captainId === id || x.viceCaptainId === id || x.keeperId === id)
    if (!r) return ''
    return ` (${[r.captainId === id && 'c', r.viceCaptainId === id && 'vc', r.keeperId === id && 'wk'].filter(Boolean).join(', ')})`
  }
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const room = (need: number) => { if (y + need > H - M) { doc.addPage(); y = M } }
  const text = (s: string, size: number, color: [number, number, number], bold = false, gap = 4) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color)
    const lines = doc.splitTextToSize(s, W - 2 * M) as string[]
    room(lines.length * size * 1.25)
    doc.text(lines, M, y + size)
    y += lines.length * size * 1.25 + gap
  }
  const table = (head: string[], body: (string | number)[][], opts: { foot?: (string | number)[][]; leftCols?: number } = {}) => {
    const left = opts.leftCols ?? 1
    autoTable(doc, {
      startY: y, head: [head], body, foot: opts.foot, margin: { left: M, right: M }, theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 4, textColor: ink, lineColor: [226, 232, 240], lineWidth: 0.5, halign: 'right' },
      headStyles: { fillColor: [241, 245, 249], textColor: ink, fontStyle: 'bold' },
      footStyles: { fillColor: [248, 250, 252], textColor: ink, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(Array.from({ length: left }, (_, i) => [i, { halign: 'left' as const }])),
      didParseCell: (d) => { if (d.column.index < left) d.cell.styles.halign = 'left' },
    })
    y = lastY() + 14
  }

  // ---------- header ----------
  doc.setFillColor(...brand); doc.rect(0, 0, W, 6, 'F')
  text('MATCH REPORT', 9, brand, true, 2)
  text(title, 20, ink, true, 4)
  text([m.tournamentName, m.label, m.format, m.ground, when(m.scheduledAt)].filter(Boolean).join('  ·  '), 9.5, muted, false, 10)

  table(['Team', 'Score', 'Overs'], [m.teamA, m.teamB].filter(Boolean).map((t) => {
    const s = m.scores.find((x) => x.teamId === t!.id)
    return [t!.name, s ? `${s.runs}/${s.wickets}` : '-', s ? s.overs : '-']
  }))

  if (m.resultText) text(m.resultText + (v.overrideReason ? ` (${v.overrideReason})` : ''), 12, brand, true, 4)
  else text(`Match status: ${m.state.toLowerCase().replace('_', ' ')}`, 11, muted, true, 4)
  if (v.tossWinnerId) text(`Toss: ${teamName(v.tossWinnerId)} won the toss and chose to ${v.tossDecision === 'BAT' ? 'bat' : 'bowl'}`, 10, ink)
  if (pom) text(`Player of the match: ${pom.name}${pom.team ? ` (${pom.team})` : ''}${pom.line ? `  ·  ${pom.line}` : ''}${pom.auto ? '  ·  picked from the scorecard' : ''}`, 10, ink)
  text(`Key: (c) captain, (vc) vice-captain, (wk) wicket-keeper.  Rules: ${v.rules.overs} overs a side, ${v.rules.playersPerSide} players, ${bpo} balls an over, up to ${v.rules.maxOversPerBowler} ${v.rules.maxOversPerBowler === 1 ? "over" : "overs"} per bowler`, 9, muted, false, 12)

  // ---------- squads ----------
  const squads = [v.teamA, v.teamB].filter((t): t is NonNullable<typeof t> => !!t && t.players.length > 0)
  if (squads.length) {
    text('Squads', 10.5, ink, true, 2)
    for (const t of squads) text(`${t.name}: ${t.players.map((p) => p.name + tag(p.id)).join(', ')}`, 9, ink, false, 4)
    y += 8
  }

  // ---------- innings ----------
  for (const inn of v.innings) innings(inn)

  function innings(inn: InningsView) {
    const st = inn.state
    room(120)
    doc.setDrawColor(...brand); doc.setLineWidth(1.2); doc.line(M, y, W - M, y); y += 8
    text(`Innings ${inn.no}: ${teamName(inn.battingTeamId)}  ${st.runs}/${st.wickets} (${st.oversText} ov)`, 14, ink, true, 2)
    const facts = [`Run rate ${rate(st.runs, st.legalBalls, bpo)}`]
    if (inn.target !== null) facts.push(`Target ${inn.target}`)
    if (inn.revisedOvers !== null) facts.push(`Revised to ${inn.revisedOvers} overs`)
    text(facts.join('  ·  '), 9.5, muted, false, 8)

    const extras = st.wides + st.noBalls + st.byes + st.legByes + st.penalties
    table(['Batter', 'How out', 'R', 'B', '4s', '6s', 'SR'],
      st.batters.map((b) => [b.name + tag(b.playerId), b.howOut, b.runs, b.balls, b.fours, b.sixes, rate(b.runs, b.balls, 100)]),
      { leftCols: 2, foot: [
        ['Extras', `b ${st.byes}, lb ${st.legByes}, w ${st.wides}, nb ${st.noBalls}${st.penalties ? `, pen ${st.penalties}` : ''}`, extras, '', '', '', ''],
        ['Total', `${st.wickets} wickets, ${st.oversText} overs`, st.runs, '', '', '', ''],
      ] })

    const squad = (v.teamA?.id === inn.battingTeamId ? v.teamA : v.teamB)?.players ?? []
    const dnb = squad.filter((p) => !st.batters.some((b) => b.playerId === p.id)).map((p) => p.name)
    if (dnb.length) text(`Did not bat: ${dnb.join(', ')}`, 9, muted, false, 10)

    table(['Bowler', 'O', 'M', 'R', 'W', 'Econ', 'Wd', 'Nb'],
      st.bowlers.map((b) => [b.name + tag(b.playerId), oversOf(b.balls, bpo), b.maidens, b.runs, b.wickets, rate(b.runs, b.balls, bpo), b.wides, b.noBalls]))

    if (st.fow.length) {
      text('Fall of wickets', 10.5, ink, true, 2)
      text(st.fow.map((f) => `${f.score}-${f.wicket} (${f.name}, ${f.over} ov)`).join(',  '), 9, ink, false, 10)
    }
    if (st.partnerships.length) {
      text('Partnerships', 10.5, ink, true, 4)
      table(['Wicket', 'Batters', 'Runs', 'Balls'],
        st.partnerships.map((p, i) => [ordinal(i + 1), p.nameB ? `${p.nameA} & ${p.nameB}` : p.nameA, p.runs, p.balls]), { leftCols: 2 })
    }
    if (st.overs.length) {
      text('Over by over', 10.5, ink, true, 4)
      let total = 0, wkts = 0
      table(['Over', 'Bowler', 'Balls', 'Runs', 'Wkts', 'Score'], st.overs.map((o) => {
        total += o.runs; wkts += o.wickets
        return [o.number, o.bowlerName, o.balls.join('  '), o.runs, o.wickets, `${total}/${wkts}`]
      }), { leftCols: 3 })
    }
  }

  // ---------- footer on every page ----------
  const pages = doc.getNumberOfPages()
  const made = new Date().toLocaleString()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted)
    doc.text(`Cricket Scorer  ·  ${title}  ·  generated ${made}`, M, H - 20)
    doc.text(`Page ${i} of ${pages}`, W - M, H - 20, { align: 'right' })
  }

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const day = m.scheduledAt ? m.scheduledAt.slice(0, 10) : new Date().toISOString().slice(0, 10)
  doc.save(`${slug || 'match'}-${day}-report.pdf`)
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
