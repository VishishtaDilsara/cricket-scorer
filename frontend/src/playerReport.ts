// Printable player profile: career batting, bowling and fielding figures, charts of runs per innings and
// wickets per match, how the runs came, how they got out, and a match-by-match log.
// jsPDF loads only when someone downloads a report.
import { DISMISSAL_LABEL } from './engine'
import type { PlayerView } from './pages/Teams'

type RGB = [number, number, number]

export async function downloadPlayerReport(data: PlayerView) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40
  const green: RGB = [30, 77, 58], slate: RGB = [79, 111, 143], ink: RGB = [23, 38, 30], muted: RGB = [93, 104, 95], line: RGB = [227, 217, 196]
  const p = data.player, s = data.stats
  if (!data.profile) throw new Error('Restart the backend to enable player reports')
  const { form, scoring, dismissals } = data.profile
  const f2 = (v: number | null) => (v === null ? '-' : v.toFixed(2))
  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  const ov = (balls: number, bpo: number) => `${Math.floor(balls / bpo)}.${balls % bpo}`
  let y = M

  const room = (need: number) => { if (y + need > H - M) { doc.addPage(); y = M } }
  const text = (t: string, size: number, color: RGB, bold = false, gap = 4) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color)
    const lines = doc.splitTextToSize(t, W - 2 * M) as string[]
    room(lines.length * size * 1.25)
    doc.text(lines, M, y + size)
    y += lines.length * size * 1.25 + gap
  }
  const table = (head: string[], body: (string | number)[][], leftCols = 1) => {
    autoTable(doc, {
      startY: y, head: [head], body, margin: { left: M, right: M }, theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 4, textColor: ink, lineColor: line, lineWidth: 0.5, halign: 'right' },
      headStyles: { fillColor: [248, 243, 231], textColor: ink, fontStyle: 'bold' },
      didParseCell: (d) => { if (d.column.index < leftCols) d.cell.styles.halign = 'left' },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14
  }
  /** Label/value grid like the profile's stat cards. */
  const figures = (title: string, rows: [string, string | number][]) => {
    text(title, 11, ink, true, 6)
    const cols = 6, cw = (W - 2 * M) / cols, rh = 30
    room(Math.ceil(rows.length / cols) * rh + 6)
    rows.forEach(([k, v], i) => {
      const x = M + (i % cols) * cw, yy = y + Math.floor(i / cols) * rh
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...muted); doc.text(k.toUpperCase(), x, yy + 8)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...ink); doc.text(String(v), x, yy + 23)
    })
    y += Math.ceil(rows.length / cols) * rh + 10
  }
  /** Columns from one baseline with a clean axis, value on the tallest column. */
  const columns = (title: string, sub: string, items: { v: number; label: string; mark?: string }[], color: RGB, ref?: { v: number; label: string }) => {
    const ch = 130
    room(ch + 50)
    text(title, 11, ink, true, 1)
    text(sub, 8.5, muted, false, 6)
    const x0 = M + 24, x1 = W - M, y0 = y + ch, plotH = ch - 14
    const max = Math.max(1, ref?.v ?? 0, ...items.map((i) => i.v))
    const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw))
    const step = Math.max(1, Math.ceil([1, 2, 2.5, 5, 10].map((f) => f * mag).find((v) => v >= raw) ?? 10 * mag))
    const top = Math.ceil(max / step) * step
    const yy = (v: number) => y0 - (v / top) * plotH
    doc.setFontSize(7); doc.setFont('helvetica', 'normal')
    for (let t = 0; t <= top; t += step) {
      doc.setDrawColor(...line); doc.setLineWidth(0.5); doc.line(x0, yy(t), x1, yy(t))
      doc.setTextColor(...muted); doc.text(String(t), x0 - 5, yy(t) + 2.5, { align: 'right' })
    }
    const band = (x1 - x0) / Math.max(items.length, 1), bw = Math.min(16, band * 0.62)
    const every = Math.max(1, Math.ceil(34 / band))
    const peak = items.reduce((b, it, i) => (it.v > (items[b]?.v ?? -1) ? i : b), 0)
    items.forEach((it, i) => {
      const cx = x0 + band * i + band / 2, h = (it.v / top) * plotH
      doc.setFillColor(...color)
      if (h > 0) doc.rect(cx - bw / 2, y0 - h, bw, h, 'F')
      if (i === peak && it.v > 0) { doc.setFont('helvetica', 'bold'); doc.setTextColor(...ink); doc.text(`${it.v}${it.mark ?? ''}`, cx, y0 - h - 3, { align: 'center' }); doc.setFont('helvetica', 'normal') }
      if (i % every === 0) { doc.setTextColor(...muted); doc.text(it.label, cx, y0 + 10, { align: 'center' }) }
    })
    if (ref && ref.v > 0) {
      doc.setDrawColor(...muted); doc.setLineWidth(0.7); doc.line(x0, yy(ref.v), x1, yy(ref.v))
      doc.setTextColor(...muted); doc.text(ref.label, x1, yy(ref.v) - 3, { align: 'right' })
    }
    y = y0 + 24
  }
  /** Horizontal bars with the value at the tip. */
  const bars = (title: string, rows: { label: string; v: number; shown: string }[], color: RGB, x: number, w: number, startY: number) => {
    let yy = startY
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...ink); doc.text(title, x, yy + 11); yy += 22
    const max = Math.max(...rows.map((r) => r.v), 0)
    doc.setFontSize(8.5)
    if (!max) { doc.setFont('helvetica', 'normal'); doc.setTextColor(...muted); doc.text('Nothing yet.', x, yy + 8); return yy + 20 }
    for (const r of rows) {
      const lw = 62, track = w - lw - 70, bw = Math.max(1.5, (r.v / max) * track)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...muted); doc.text(r.label, x, yy + 7)
      doc.setFillColor(...color); doc.rect(x + lw, yy, bw, 8, 'F')
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...ink); doc.text(r.shown, x + lw + bw + 5, yy + 7)
      yy += 16
    }
    return yy + 6
  }

  // ---------- header ----------
  doc.setFillColor(...green); doc.rect(0, 0, W, 6, 'F')
  text('PLAYER REPORT', 9, green, true, 2)
  text(p.name, 22, ink, true, 3)
  const bio = [p.playerRole, p.battingHand && `${p.battingHand}-hand bat`, p.bowlingStyle].filter(Boolean).join('  ·  ')
  text([bio, data.teams.length ? `Teams: ${data.teams.map((t) => t.name).join(', ')}` : ''].filter(Boolean).join('  ·  ') || 'Player', 9.5, muted, false, 14)

  figures('Batting', [['Matches', s.matches], ['Innings', s.innings], ['Not outs', s.notOuts], ['Runs', s.runs], ['Highest', s.highestScore ?? '-'], ['Average', f2(s.average)],
    ['Strike rate', f2(s.strikeRate)], ['30s', s.thirties], ['50s', s.fifties], ['100s', s.hundreds], ['4s', s.fours], ['6s', s.sixes]])
  figures('Bowling', [['Overs', ov(s.bowlBalls, 6)], ['Maidens', s.maidens], ['Runs', s.conceded], ['Wickets', s.wickets], ['Best', s.best ?? '-'], ['Average', f2(s.bowlingAverage)],
    ['Economy', f2(s.economy)], ['Strike rate', f2(s.bowlingStrikeRate)]])
  figures('Fielding', [['Catches', s.catches], ['Run outs', s.runOuts], ['Stumpings', s.stumpings]])

  // ---------- charts ----------
  const short = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const bat = form.filter((f) => f.batted).slice(-30), bowl = form.filter((f) => f.bowlBalls > 0).slice(-30)
  if (bat.length) columns('Runs per innings', `${bat.length} innings, oldest first. * not out. Line shows the batting average.`,
    bat.map((f) => ({ v: f.runs, label: short(f.date), mark: f.out ? '' : '*' })), green, s.average !== null ? { v: s.average, label: `Avg ${s.average.toFixed(1)}` } : undefined)
  if (bowl.length) columns('Wickets per match', `${bowl.length} matches bowled, oldest first. Economy ${f2(s.economy)}.`,
    bowl.map((f) => ({ v: f.wickets, label: short(f.date) })), slate)

  const pct = (n: number, of: number) => (of ? `${Math.round((n * 100) / of)}%` : '0%')
  const runRows = ([['Singles', scoring.ones], ['Twos', scoring.twos * 2], ['Threes', scoring.threes * 3], ['Fours', scoring.fours * 4], ['Sixes', scoring.sixes * 6]] as const)
    .map(([label, v]) => ({ label, v, shown: `${v} (${pct(v, s.runs)})` }))
  const outs = Object.entries(dismissals).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([k, n]) => ({ label: DISMISSAL_LABEL[k as keyof typeof DISMISSAL_LABEL] ?? k, v: n ?? 0, shown: String(n) }))
  room(30 + Math.max(runRows.length, outs.length, 1) * 16 + 20)
  const half = (W - 2 * M - 20) / 2, top = y
  const a = bars('How the runs came', runRows, green, M, half, top)
  const b = bars('How they got out', outs, slate, M + half + 20, half, top)
  y = Math.max(a, b) + 4
  const faced = scoring.dots + scoring.ones + scoring.twos + scoring.threes + scoring.fours + scoring.sixes + scoring.other
  text(`Balls faced ${faced}  ·  dot balls ${pct(scoring.dots, faced)}  ·  runs in boundaries ${pct(scoring.fours * 4 + scoring.sixes * 6, s.runs)}`, 9, muted, false, 14)

  // ---------- match log ----------
  if (form.length) {
    text('Match by match', 11, ink, true, 6)
    table(['Date', 'Opponent', 'Runs', 'Balls', 'SR', 'How out', 'Overs', 'Wkts', 'Conc.', 'Econ'], [...form].reverse().map((f) => [
      date(f.date), f.opponent ?? '-', f.batted ? `${f.runs}${f.out ? '' : '*'}` : '-', f.batted ? f.balls : '-',
      f.batted && f.balls ? ((f.runs * 100) / f.balls).toFixed(1) : '-', f.batted ? (f.dismissal ? DISMISSAL_LABEL[f.dismissal] : 'not out') : 'did not bat',
      f.bowlBalls ? ov(f.bowlBalls, f.ballsPerOver) : '-', f.bowlBalls ? f.wickets : '-', f.bowlBalls ? f.conceded : '-',
      f.bowlBalls ? ((f.conceded * f.ballsPerOver) / f.bowlBalls).toFixed(2) : '-',
    ]), 2)
  } else text('No matches played yet.', 10, muted)

  // ---------- footer ----------
  const pages = doc.getNumberOfPages(), made = new Date().toLocaleString()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted)
    doc.text(`Cricket Scorer  ·  ${p.name}  ·  generated ${made}`, M, H - 20)
    doc.text(`Page ${i} of ${pages}`, W - M, H - 20, { align: 'right' })
  }
  const slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  doc.save(`${slug || 'player'}-profile-report.pdf`)
}
