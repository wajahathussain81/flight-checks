export function Sparkline({ values, width = 640, height = 140 }: {
  values: number[]; width?: number; height?: number
}) {
  if (values.length === 0) return <p className="content-sub">No history yet.</p>
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pad = 12
  const pt = (v: number, i: number): [number, number] => [
    pad + (i * (width - 2 * pad)) / Math.max(values.length - 1, 1),
    height - pad - ((v - min) * (height - 2 * pad)) / span,
  ]
  const pts = values.map((v, i) => pt(v, i))
  const line = pts.map(p => p.join(',')).join(' ')
  const area = `${pad},${height - pad} ${line} ${pts[pts.length - 1][0]},${height - pad}`
  const [ex, ey] = pts[pts.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label="value history" style={{ maxWidth: '100%', height: 'auto' }}>
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={pad} x2={width - pad} y1={pad + f * (height - 2 * pad)} y2={pad + f * (height - 2 * pad)}
          stroke="var(--separator-faint)" strokeWidth="1" />
      ))}
      <polygon points={area} fill="var(--accent-tint)" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r="4" fill="var(--accent)" />
      <text x={pad} y={12} fontSize="11" fill="var(--label-2)">{max.toFixed(2)}</text>
      <text x={pad} y={height - 2} fontSize="11" fill="var(--label-2)">{min.toFixed(2)}</text>
    </svg>
  )
}
