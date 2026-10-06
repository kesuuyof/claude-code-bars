import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Segment } from '../types'
import { fmt, toSnapshot } from './bar'
import { BAR_INDENT, CELL, allocate, barWidth, levelColor } from './shared'

const snapshot = atom({ plugin: 'context-bar', key: 'snapshot' } as const, null)
const isHidden = atom({ plugin: 'context-bar', key: 'isHidden' } as const, false)

// Free space and the compaction buffer share their colors with used rows
// (promptBorder, inactive), so they are told apart by being dimmed.
const tone = (s: Segment) => ({ color: s.color, ...(s.kind !== 'used' && { dimColor: true }) })

const SETTLE_MS = 300
let pending: Timer | undefined

// 'summary' is the engine's local count; 'full' would send token-count requests.
async function refresh($: EngineInterface) {
  const { breakdown } = (await $.session.usage({ breakdown: 'summary' })).context
  if (breakdown) await update($, snapshot, () => toSnapshot(breakdown))
}

// The store outlives sessions; $.state is what the drawing subscribes to.
async function sync($: EngineInterface) {
  const hidden = (await $.store.get('isHidden')) === true
  await update($, isHidden, () => hidden)
  await refresh($)
}

export const register: Register = (on, options) => {
  const cap = Number(options.barWidth)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-bar',
      description: 'Show or hide the context bar above the prompt',
    })
    await sync($)
    return next(e)
  })

  on('command.run', { command: 'context-bar' }, async $ => {
    const hidden = await update($, isHidden, h => !h)
    await $.store.set('isHidden', hidden)
    return { text: hidden ? 'Context bar hidden.' : 'Context bar shown.' }
  })

  // Every row the main conversation keeps: responses and tool results mid-turn, and
  // the rows a compaction rebuilds the conversation from. The compaction events
  // themselves still see the old conversation, so the refresh waits for the rows to settle.
  // Nothing runs after next, so the row is stored as the engine answers it.
  on('session.append', ($, e, next) => {
    if (e.agentId === undefined) {
      pending?.cancel()
      pending = $.clock.after(SETTLE_MS, () => void refresh($))
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })

  // /clear raises no session.start, only this, with the conversation already cleared.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') await sync($)
    return next(e)
  })

  // Draws above what the plugins beneath drew (usage-bar draws below), so the
  // two stack the same way whichever of them loads first.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const snap = await read($, snapshot)
    if (e.props.hasSurvey || snap === null || (await read($, isHidden))) return below

    const { Box, Text } = $.ui.resolve(e)
    const cells = allocate(
      snap.segments.map(s => s.tokens),
      barWidth(cap, e.props.bodyColumns),
    )
    const level = levelColor(snap.percent)
    const indent = ' '.repeat(BAR_INDENT)

    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text bold>Context </Text>
          <Text {...(level && { color: level })}>
            {fmt(snap.used)} / {fmt(snap.window)} ({snap.percent}%)
          </Text>
          {snap.autoCompactAt === null ? '' : ` · auto-compact at ${fmt(snap.autoCompactAt)}`}
        </Text>
        <Text wrap="truncate-end">
          {indent}
          {snap.segments.map((s, i) => {
            const n = cells[i] ?? 0
            return n > 0 ? <Text {...tone(s)}>{CELL.repeat(n)}</Text> : ''
          })}
        </Text>
        <Text wrap="truncate-end">
          {indent}
          {snap.segments
            .filter(s => s.tokens > 0)
            .map(s => (
              <Text>
                <Text {...tone(s)}>{CELL}</Text> {s.name} {fmt(s.tokens)}{'  '}
              </Text>
            ))}
        </Text>
        {below}
      </Box>
    )
  })
}
