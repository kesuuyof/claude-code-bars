import type { SessionContextBreakdown } from 'claude-code'

import type { Segment, Snapshot } from '../types'

export const GLYPH: Record<Segment['kind'], string> = { used: '█', free: '░', buffer: '▒' }

/** Keeps the rows that take room in the window, as /context's grid does. */
export function toSnapshot(b: SessionContextBreakdown): Snapshot {
  return {
    segments: b.categories.flatMap(c =>
      c.kind === 'deferred' ? [] : [{ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind }],
    ),
    used: b.totalTokens,
    window: b.rawMaxTokens,
    percent: b.percentage,
    autoCompactAt: b.isAutoCompactEnabled ? (b.autoCompactThreshold ?? null) : null,
  }
}

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

/** 950 → "950", 45231 → "45.2k", 200000 → "200k", 1000000 → "1M" */
export function fmt(n: number): string {
  if (n < 1000) return String(Math.round(n))
  const [v, unit] = n < 1e6 ? [n / 1e3, 'k'] : [n / 1e6, 'M']
  return `${Number(v.toFixed(1))}${unit}`
}
