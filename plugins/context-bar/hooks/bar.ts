import type { SessionContextBreakdown } from 'claude-code'

import type { Snapshot } from '../types'

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

/** 950 → "950", 45231 → "45.2k", 200000 → "200k", 1000000 → "1M" */
export function fmt(n: number): string {
  if (n < 1000) return String(Math.round(n))
  const [v, unit] = n < 1e6 ? [n / 1e3, 'k'] : [n / 1e6, 'M']
  return `${Number(v.toFixed(1))}${unit}`
}
