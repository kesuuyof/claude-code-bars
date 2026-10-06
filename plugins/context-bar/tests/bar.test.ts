import { expect, test } from 'claude-code/testing'

import { fmt } from '../hooks/bar'

test('fmt', () => {
  expect(fmt(950)).toBe('950')
  expect(fmt(45_231)).toBe('45.2k')
  expect(fmt(200_000)).toBe('200k')
  expect(fmt(1_000_000)).toBe('1M')
  expect(fmt(1_250_000)).toBe('1.3M')
})
