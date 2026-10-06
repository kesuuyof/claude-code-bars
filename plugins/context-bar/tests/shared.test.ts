import { describe, expect, test } from 'claude-code/testing'

import { allocate, levelColor } from '../hooks/shared'

describe('allocate', () => {
  test('fills the width exactly', () => {
    for (const width of [1, 7, 60, 80, 213]) {
      const cells = allocate([3_000, 12_000, 30_000, 122_000, 33_000], width)
      expect(cells.reduce((a, b) => a + b, 0)).toBe(width)
    }
  })

  test('splits by share, remainders to the largest fractions', () => {
    expect(allocate([1, 1, 2], 4)).toEqual([1, 1, 2])
    expect(allocate([1, 1, 1], 10)).toEqual([4, 3, 3])
    expect(allocate([50, 50], 3)).toEqual([2, 1])
  })

  test('nothing to split gives zero cells', () => {
    expect(allocate([0, 0], 10)).toEqual([0, 0])
    expect(allocate([5, 5], 0)).toEqual([0, 0])
  })
})

test('levelColor: yellow from 50%, red from 80%', () => {
  expect(levelColor(0)).toBeUndefined()
  expect(levelColor(49)).toBeUndefined()
  expect(levelColor(50)).toBe('warning')
  expect(levelColor(79)).toBe('warning')
  expect(levelColor(80)).toBe('error')
  expect(levelColor(130)).toBe('error')
})
