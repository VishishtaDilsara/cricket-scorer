// Small, dependency-free charts for the player profile. Thin rounded columns from one baseline, hairline grid,
// one hover tooltip per mark, values only where they help (the tallest column, the tip of each bar).
import { useEffect, useRef, useState, type ReactNode } from 'react'

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** Clean axis maximum and step: 0 / 5 / 10 / 15, 0 / 20 / 40 … */
export function niceScale(max: number, ticks = 4) {
  if (max <= 0) return { top: ticks, step: 1 }
  const raw = max / ticks
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw && (s >= 1 || mag < 1)) ?? 10 * mag
  const s = Math.max(1, Math.ceil(step))
  return { top: Math.ceil(max / s) * s, step: s }
}

export type Column = { key: string; value: number; label: string; tip: ReactNode; mark?: string }

/** Vertical columns, one series. `refLine` draws a thin labelled guide such as the career average. */
export function ColumnChart({ data, color, height = 200, refLine, unit }: {
  data: Column[]; color: string; height?: number; refLine?: { value: number; label: string } | null; unit: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const padL = 34, padR = 8, padT = 18, padB = 26
  const plotW = Math.max(0, width - padL - padR), plotH = height - padT - padB
  const max = Math.max(...data.map((d) => d.value), refLine?.value ?? 0, 1)
  const { top, step } = niceScale(max)
  const y = (v: number) => padT + plotH - (v / top) * plotH
  const band = data.length ? plotW / data.length : 0
  const barW = Math.min(24, Math.max(4, band * 0.62))
  const every = Math.max(1, Math.ceil(44 / Math.max(band, 1))) // keep x labels from colliding
  const peak = data.reduce((best, d, i) => (d.value > (data[best]?.value ?? -1) ? i : best), 0)
  const ticks: number[] = []
  for (let v = 0; v <= top; v += step) ticks.push(v)

  return (
    <div ref={ref} className="chart" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Column chart of ${unit}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className="chart-grid" />
              <text x={padL - 6} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">{t}</text>
            </g>
          ))}
          {refLine && refLine.value > 0 && (
            <g>
              <line x1={padL} x2={width - padR} y1={y(refLine.value)} y2={y(refLine.value)} className="chart-ref" />
              <text x={width - padR} y={y(refLine.value) - 5} className="chart-ref-label" textAnchor="end">{refLine.label}</text>
            </g>
          )}
          {data.map((d, i) => {
            const cx = padL + band * i + band / 2, h = (d.value / top) * plotH, x = cx - barW / 2, yb = padT + plotH
            const r = Math.min(4, barW / 2, h)
            const path = h <= 0 ? '' : `M${x},${yb} V${yb - h + r} Q${x},${yb - h} ${x + r},${yb - h} H${x + barW - r} Q${x + barW},${yb - h} ${x + barW},${yb - h + r} V${yb} Z`
            return (
              <g key={d.key}>
                {path && <path d={path} fill={color} opacity={hover === null || hover === i ? 1 : 0.4} />}
                {h <= 0 && <line x1={x} x2={x + barW} y1={yb - 1} y2={yb - 1} stroke={color} strokeWidth={2} opacity={0.5} />}
                {i === peak && d.value > 0 && <text x={cx} y={yb - h - 5} className="chart-value" textAnchor="middle">{d.value}{d.mark ?? ''}</text>}
                {i % every === 0 && <text x={cx} y={height - 8} className="chart-axis" textAnchor="middle">{d.label}</text>}
                <rect x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent"
                  onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              </g>
            )
          })}
          <line x1={padL} x2={width - padR} y1={padT + plotH} y2={padT + plotH} className="chart-base" />
        </svg>
      )}
      {hover !== null && data[hover] && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(padL + band * hover + band / 2, 80), width - 80), top: Math.max(0, y(data[hover].value) - 8) }}>
          {data[hover].tip}
        </div>
      )}
    </div>
  )
}

export type BarRow = { key: string; label: string; value: number; shown?: string; detail?: string }

/** Horizontal bars for parts of a whole (how runs came, how they got out). Value at the tip of each bar. */
export function BarList({ rows, color, empty }: { rows: BarRow[]; color: string; empty: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0)
  if (!max) return <div className="muted small">{empty}</div>
  return (
    <div className="bar-list">
      {rows.map((r) => (
        <div key={r.key} className="bar-row" title={r.detail ? `${r.label}: ${r.shown ?? r.value} · ${r.detail}` : undefined}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `calc((100% - 120px) * ${r.value / max})`, background: color }} />
            <span className="bar-value num">{r.shown ?? r.value}{r.detail && <span className="dim"> · {r.detail}</span>}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
