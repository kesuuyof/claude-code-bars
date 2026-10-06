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
 * The one glyph every cell of every bar is drawn with; full and empty cells differ
 * by color alone. A font that draws ░ or ▒ at another width than █ would otherwise
 * make bars of the same cell count differ in length.
 */
export const CELL = '█'

/**
 * Every bar in the band sits on one grid, so bars stacked from different plugins
 * line up: it starts BAR_INDENT cells in (after a label such as usage-bar's "5h "),
 * and TAIL cells are kept right of it (for a tail such as " 60% · resets in 3h30m")
 * plus one, so a row never reaches the band's last column.
 */
export const BAR_INDENT = 3
const TAIL = 24

/** Cells for a bar: at most `cap` (the plugin's barWidth option), the same for every plugin on a band. */
export function barWidth(cap: number, bodyColumns: number): number {
  return Math.max(0, Math.min(cap, bodyColumns - BAR_INDENT - TAIL - 1))
}
