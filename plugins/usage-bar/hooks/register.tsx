import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import { toRow } from './limits'
import { BAR_INDENT, CELL, allocate, barWidth, levelColor } from './shared'

const limits = atom({ plugin: 'usage-bar', key: 'limits' } as const, [])
const clock = atom({ plugin: 'usage-bar', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'usage-bar', key: 'isHidden' } as const, false)

/** The countdowns move a minute at a time. */
const TICK_MS = 60_000

async function save($: EngineInterface, rateLimits: readonly SessionRateLimit[]) {
  const now = await $.clock.now()
  await update($, limits, () => [...rateLimits])
  await update($, clock, () => now)
}

// The store outlives sessions; $.state is what the drawing subscribes to.
async function sync($: EngineInterface) {
  const hidden = (await $.store.get('isHidden')) === true
  await update($, isHidden, () => hidden)
  await save($, (await $.session.usage()).rateLimits)
}

export const register: Register = (on, options) => {
  const cap = Number(options.barWidth)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'usage-bar',
      description: 'Show or hide the plan usage bars above the prompt',
    })
    await sync($)
    $.clock.every(TICK_MS, async () => {
      const now = await $.clock.now()
      await update($, clock, () => now)
    })
    return next(e)
  })

  on('command.run', { command: 'usage-bar' }, async $ => {
    const hidden = await update($, isHidden, h => !h)
    await $.store.set('isHidden', hidden)
    return { text: hidden ? 'Usage bars hidden.' : 'Usage bars shown.' }
  })

  // The windows arrive with each response's headers: after a turn, and when one moves a point.
  on('session.measure', async ($, e, next) => {
    await save($, e.rateLimits)
    return next(e)
  })

  // /clear raises no session.start, only this.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') await sync($)
    return next(e)
  })

  // Draws below what the plugins beneath drew (context-bar draws above), so the
  // two stack the same way whichever of them loads first.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const above = await next(e)
    const list = await read($, limits)
    if (e.props.hasSurvey || list.length === 0 || (await read($, isHidden))) return above

    const { Box, Text } = $.ui.resolve(e)
    const now = await read($, clock)
    const rows = list.map(l => toRow(l, now))
    // A label longer than the grid's indent ("7d opus") pushes this band's bars right of it.
    const indent = Math.max(BAR_INDENT, ...rows.map(r => r.label.length + 1))
    const width = barWidth(cap, e.props.bodyColumns)

    return (
      <Box flexDirection="column">
        {above}
        {rows.flatMap(r => {
          const [filled = 0, empty = 0] = allocate([Math.min(r.used, 100), Math.max(0, 100 - r.used)], width)
          const level = levelColor(r.used)
          const tone = level ? { color: level } : {}
          const row = (
            <Text wrap="truncate-end">
              {r.label.padEnd(indent)}
              <Text {...tone}>{CELL.repeat(filled)}</Text>
              <Text dimColor>{CELL.repeat(empty)}</Text>
              <Text {...tone}>{r.tail}</Text>
            </Text>
          )
          if (r.warning === undefined) return [row]
          return [
            row,
            <Text color="warning" wrap="truncate-end">
              {' '.repeat(indent)}
              {r.warning}
            </Text>,
          ]
        })}
      </Box>
    )
  })
}
