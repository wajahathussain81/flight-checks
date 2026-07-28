export function Sparkline({ values, width = 640, height = 120 }: {
  values: number[]; width?: number; height?: number
}) {
  if (values.length === 0) return <p>No history yet.</p>
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const pad = 10
  const pts = values.map((v, i) => {
    const x = pad + (i * (width - 2 * pad)) / Math.max(values.length - 1, 1)
    const y = height - pad - ((v - min) * (height - 2 * pad)) / span
    return `${x},${y}`
  })
  return (
    <svg width={width} height={height} role="img" aria-label="value history">
      <polyline points={pts.join(' ')} fill="none" stroke="#4462ee" strokeWidth="2" />
      <text x={pad} y={12} fontSize="11" fill="#888">{max.toFixed(2)}</text>
      <text x={pad} y={height - 2} fontSize="11" fill="#888">{min.toFixed(2)}</text>
    </svg>
  )
}
