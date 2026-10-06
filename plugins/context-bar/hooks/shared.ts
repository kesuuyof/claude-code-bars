// Kept identical in every plugin of claude-code-bars: a plugin installs on its
// own, so none can import another's files. Edit one, copy it to the others.

/** Splits `width` cells by share of tokens (largest remainder), summing to `width` exactly. */
export function allocate(tokens: readonly number[], width: number): number[] {
  const total = tokens.reduce((a, b) => a + b, 0)
  if (total <= 0 || width <= 0) return tokens.map(() => 0)
  const parts = tokens.map(t => {
    const exact = (t / total) * width
    return { cells: Math.floor(exact), rest: exact - Math.floor(exact) }
  })
  const left = width - parts.reduce((a, p) => a + p.cells, 0)
  for (const p of [...parts].sort((a, b) => b.rest - a.rest).slice(0, left)) p.cells += 1
  return parts.map(p => p.cells)
}

export function levelColor(percent: number): string | undefined {
  return percent >= 80 ? 'error' : percent >= 50 ? 'warning' : undefined
}

/**
 * Cells for a bar: at most `cap` (the plugin's barWidth option), and short of the
 * band by `beside` (what else its row holds) plus one cell, so a row never reaches
 * the band's last column.
 */
export function barWidth(cap: number, bodyColumns: number, beside = 0): number {
  return Math.max(0, Math.min(cap, bodyColumns - beside - 1))
}
