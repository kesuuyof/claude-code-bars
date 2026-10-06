import { describe, expect, test } from 'claude-code/testing'

import { elapsedPercent, fmtDuration, label, toRow, windowMs } from '../hooks/limits'

const NOW = Date.parse('2026-10-06T12:00:00Z')
const H = 3_600_000
const at = (ms: number) => new Date(NOW + ms).toISOString()

test('label', () => {
  expect(label('five_hour')).toBe('5h')
  expect(label('seven_day')).toBe('7d')
  expect(label('seven_day_opus')).toBe('7d opus')
  expect(label('spend_limit')).toBe('spend limit')
})

test('windowMs reads the length from the name', () => {
  expect(windowMs('five_hour')).toBe(5 * H)
  expect(windowMs('seven_day_opus')).toBe(7 * 24 * H)
  expect(windowMs('spend_limit')).toBeUndefined()
})

describe('elapsedPercent', () => {
  test('from the reset time and the window length', () => {
    expect(elapsedPercent({ kind: 'five_hour', percentUsed: 0, resetsAt: at(3.5 * H) }, NOW)).toBe(30)
    expect(elapsedPercent({ kind: 'seven_day', percentUsed: 0, resetsAt: at(7 * 24 * H) }, NOW)).toBe(0)
  })

  test('clamped once the reset time has passed', () => {
    expect(elapsedPercent({ kind: 'five_hour', percentUsed: 0, resetsAt: at(-H) }, NOW)).toBe(100)
  })

  test('unknown without a length or a reset time', () => {
    expect(elapsedPercent({ kind: 'spend_limit', percentUsed: 0, resetsAt: at(H) }, NOW)).toBeUndefined()
    expect(elapsedPercent({ kind: 'five_hour', percentUsed: 0 }, NOW)).toBeUndefined()
  })
})

test('fmtDuration', () => {
  expect(fmtDuration(45_000)).toBe('<1m')
  expect(fmtDuration(-5_000)).toBe('<1m')
  expect(fmtDuration(13 * 60_000)).toBe('13m')
  expect(fmtDuration(2 * H + 5 * 60_000)).toBe('2h05m')
  expect(fmtDuration(4 * 24 * H + 6 * H + 59 * 60_000)).toBe('4d6h')
})

describe('toRow', () => {
  test('percent and time to reset', () => {
    expect(toRow({ kind: 'five_hour', percentUsed: 42, resetsAt: at(2 * H + 13 * 60_000) }, NOW)).toEqual({
      label: '5h',
      used: 42,
      tail: ' 42% · resets in 2h13m',
    })
    expect(toRow({ kind: 'spend_limit', percentUsed: 7.5 }, NOW).tail).toBe(' 7.5%')
  })

  test('warns when use runs 20 points or more ahead of the time elapsed', () => {
    // 30% of the window elapsed
    const row = (used: number) => toRow({ kind: 'five_hour', percentUsed: used, resetsAt: at(3.5 * H) }, NOW)
    expect(row(60).warning).toBe('⚠ ahead of pace: 60% used, 30% of the window elapsed')
    expect(row(50).warning).toBeDefined()
    expect(row(49).warning).toBeUndefined()
    expect(row(30).warning).toBeUndefined()
  })

  test('no pace warning where the elapsed time is unknown', () => {
    expect(toRow({ kind: 'spend_limit', percentUsed: 95, resetsAt: at(H) }, NOW).warning).toBeUndefined()
  })
})
