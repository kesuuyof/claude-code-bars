import type { Limit } from '../types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** How many percentage points use may run ahead of the time elapsed before a row warns. */
export const PACE_MARGIN = 20

/** `five_hour` → "5h", `seven_day_opus` → "7d opus", `spend_limit` → "spend limit" */
export function label(kind: string): string {
  return kind.replace(/^five_hour/, '5h').replace(/^seven_day/, '7d').replace(/_/g, ' ')
}

/** The window's length as its name gives it; undefined where the name does not (a spend limit). */
export function windowMs(kind: string): number | undefined {
  return kind.startsWith('five_hour') ? 5 * HOUR : kind.startsWith('seven_day') ? 7 * DAY : undefined
}

/**
 * How much of the window has passed, 0–100 to one decimal as `percentUsed` is;
 * undefined when its length or reset time is unknown.
 */
export function elapsedPercent(limit: Limit, now: number): number | undefined {
  const span = windowMs(limit.kind)
  if (span === undefined || limit.resetsAt === undefined) return undefined
  const passed = span - (Date.parse(limit.resetsAt) - now)
  return Math.min(100, Math.max(0, Math.round((1000 * passed) / span) / 10))
}

/** 45s → "<1m", "13m", "2h05m", "4d6h" */
export function fmtDuration(ms: number): string {
  if (ms < MINUTE) return '<1m'
  const m = Math.floor(ms / MINUTE)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d${h % 24}h`
}

export type Row = { label: string; used: number; tail: string; warning?: string }

export function toRow(limit: Limit, now: number): Row {
  const elapsed = elapsedPercent(limit, now)
  const resets = limit.resetsAt === undefined ? '' : ` · resets in ${fmtDuration(Date.parse(limit.resetsAt) - now)}`
  const isAhead = elapsed !== undefined && limit.percentUsed - elapsed >= PACE_MARGIN
  return {
    label: label(limit.kind),
    used: limit.percentUsed,
    tail: ` ${limit.percentUsed}%${resets}`,
    ...(isAhead && {
      warning: `⚠ ahead of pace: ${limit.percentUsed}% used, ${Math.round(elapsed)}% of the window elapsed`,
    }),
  }
}
