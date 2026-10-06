import { expect, mock, test } from 'claude-code/testing'
import type { ElementQuery, Engine, FoundElement } from 'claude-code/testing'
import type { On, RenderPropsOf, SessionContextBreakdown } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const
const WIDTH = 60
const BAND: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: WIDTH,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

/** A 200k window as /context breaks it down, with `messages` tokens of conversation. */
function breakdown(messages: number): SessionContextBreakdown {
  const used = 3_000 + 12_000 + messages
  return {
    categories: [
      { name: 'System prompt', tokens: 3_000, color: 'inactive', isDeferred: false, kind: 'used' },
      { name: 'System tools', tokens: 12_000, color: 'permission', isDeferred: false, kind: 'used' },
      { name: 'MCP tools', tokens: 5_000, color: 'warning', isDeferred: true, kind: 'deferred' },
      { name: 'Messages', tokens: messages, color: 'promptBorder', isDeferred: false, kind: 'used' },
      { name: 'Free space', tokens: 200_000 - used - 33_000, color: 'inactive', isDeferred: false, kind: 'free' },
      { name: 'Autocompact buffer', tokens: 33_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
    ],
    totalTokens: used,
    maxTokens: 200_000,
    rawMaxTokens: 200_000,
    autocompactSource: 'auto',
    percentage: Math.round(used / 2_000),
    gridRows: [],
    model: 'claude-opus-5-5',
    memoryFiles: [],
    mcpTools: [],
    agents: [],
    autoCompactThreshold: 167_000,
    isAutoCompactEnabled: true,
    apiUsage: null,
  }
}

/** Stands in for the engine: the usage op answers whatever `live.now` holds. */
function engine(on: On, store: Record<string, unknown> = {}) {
  const live = { now: breakdown(30_000), asked: [] as unknown[], clock: mock.clock(on) }
  mock.store(on, store)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('ui.render', () => ({ type: 'engine', ref: 0 }))
  on('classic.SessionStart', () => ({}))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.usage', ($, e) => {
    live.asked.push(e.breakdown)
    return { value: { startedAt: 0, context: { window: 200_000, breakdown: live.now }, rateLimits: [] } }
  })
  return live
}

// Text takes no key, so rows are found by what they show.
const HEADER = { type: 'Text', text: /^Context / }
const USAGE = { type: 'Text', text: /^[\d.]+[kM]? \/ [\d.]+[kM]? \(\d+%\)$/ }
/** The band's bar rows: the width of the box a bar starts after, and what the row shows. */
const rowsOf = async (ui: { findAll: (q: ElementQuery) => Promise<FoundElement[]> }) =>
  (await ui.findAll({ type: 'Box' }))
    .filter(b => b.props.flexDirection === 'row')
    .map(b => ({ indent: (b.children[0] as { props: { width?: number } }).props.width, text: b.text }))
/** Where the bar starts (the width of the box before it) and how many cells it takes. */
const grid = async (ui: Parameters<typeof rowsOf>[0]) => {
  const row = (await rowsOf(ui)).find(r => /^█+$/.test(r.text))
  return { start: row?.indent, cells: row?.text.length }
}
const LEGEND = { type: 'Text', text: /Free space/ }

/**
 * One row the engine keeps, as a compaction appends its boundary and summary.
 * The kit has no stand-in for the store beneath session.append (an answer
 * without next is skipped, next has nothing beneath), so the call rejects
 * after the plugin's hook ran; what the test checks is the refresh it scheduled.
 */
const append = ($: Engine, uuid: string, agentId?: string) =>
  $.session
    .append({
      message: { type: 'system', name: 'compact_boundary', content: [{ type: 'text', text: 'Conversation compacted' }] },
      door: 'compaction',
      origin: { kind: 'engine' },
      uuid,
      ...(agentId && { agentId }),
    })
    .catch(() => {})

const start = ($: Engine) => $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
const toggle = ($: Engine) =>
  $.command.run({
    command: 'context-bar',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
const mount = ($: Engine, surface: (typeof SURFACES)[number], props = BAND) =>
  $.ui.mount({ plugin: 'context-bar', surface, component: 'AbovePrompt', props })

test('header: used / window (percent) and the auto-compact point', async ($, on) => {
  const live = engine(on)
  await start($)
  expect(live.asked).toEqual(['summary'])

  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    expect((await ui.find(HEADER))?.text).toBe('Context 45k / 200k (23%) · auto-compact at 167k')
    expect((await ui.find(USAGE))?.props.color).toBeUndefined()
    await ui.unmount()
  }
})

test('bar starts at column 3, 40 cells by default and less on a narrow band; legend skips deferred rows', async ($, on) => {
  engine(on)
  await start($)

  for (const surface of SURFACES) {
    // usage-bar's test pins the same numbers: a 60-column band puts both bars at 3, 32 cells long
    const narrow = await mount($, surface)
    expect(await grid(narrow)).toEqual({ start: 3, cells: 32 })
    await narrow.unmount()

    const ui = await mount($, surface, { ...BAND, bodyColumns: 200 })
    expect(await grid(ui)).toEqual({ start: 3, cells: 40 })
    const legend = (await ui.find(LEGEND))?.text
    expect(legend).toContain('Messages 30k')
    expect(legend).toContain('Autocompact buffer 33k')
    expect(legend).not.toContain('MCP tools')
    await ui.unmount()
  }
})

test('one glyph for every cell: free space and the buffer are dimmed, not drawn with ░ or ▒', async ($, on) => {
  engine(on)
  await start($)
  const ui = await mount($, 'terminal', { ...BAND, bodyColumns: 200 })
  // the bar's segments: the colored runs of cells (the legend's swatches come after)
  const cells = (await ui.findAll({ type: 'Text', text: /^█+$/ }))
    .filter(t => 'color' in t.props)
    .map(t => ({ n: t.text.length, dim: t.props.dimColor === true }))
  // System prompt, System tools, Messages; then Free space and Autocompact buffer
  expect(cells.slice(0, 5).map(c => c.dim)).toEqual([false, false, false, true, true])
  expect(cells.slice(0, 5).reduce((a, c) => a + c.n, 0)).toBe(40)
})

test('the barWidth option sets the bar length', { options: { barWidth: 20 } }, async ($, on) => {
  engine(on)
  await start($)
  const ui = await mount($, 'terminal')
  expect((await grid(ui)).cells).toBe(20)
})

test('usage turns yellow at 50% and red at 80%', async ($, on) => {
  const live = engine(on)
  await start($)
  const ui = await mount($, 'terminal')

  live.now = breakdown(95_000) // 110k, 55%
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] })
  expect((await ui.find(USAGE))?.props.color).toBe('warning')

  live.now = breakdown(150_000) // 165k, 83%
  await $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: ['context'] })
  expect((await ui.find(USAGE))?.props.color).toBe('error')
})

test('redraws once the rows a compaction appends have settled', async ($, on) => {
  const live = engine(on)
  await start($)
  const ui = await mount($, 'terminal')

  live.now = breakdown(5_000)
  await append($, 'boundary')
  await live.clock.advance(200)
  await append($, 'summary') // restarts the wait
  await live.clock.advance(200)
  expect((await ui.find(HEADER))?.text).toContain('45k / 200k (23%)')
  await live.clock.advance(100)
  expect((await ui.find(HEADER))?.text).toContain('20k / 200k (10%)')
})

test("a subagent's rows do not trigger a refresh", async ($, on) => {
  const live = engine(on)
  await start($)
  const ui = await mount($, 'terminal')

  live.now = breakdown(5_000)
  await append($, 'sub', 'agent-1')
  await live.clock.advance(1_000)
  expect((await ui.find(HEADER))?.text).toContain('45k / 200k (23%)')
})

test('redraws after /clear', async ($, on) => {
  const live = engine(on)
  await start($)
  const ui = await mount($, 'terminal')

  live.now = breakdown(0)
  await $.classic.SessionStart({ source: 'clear' })
  expect((await ui.find(HEADER))?.text).toContain('15k / 200k (8%)')
})

test('/context-bar toggles and the choice is stored', async ($, on) => {
  engine(on)
  await start($)
  const ui = await mount($, 'terminal')

  expect((await toggle($)).text).toBe('Context bar hidden.')
  expect(await ui.find(HEADER)).toBeUndefined()
  // /clear reloads the choice from the store
  await $.classic.SessionStart({ source: 'clear' })
  expect(await ui.find(HEADER)).toBeUndefined()

  expect((await toggle($)).text).toBe('Context bar shown.')
  expect(await ui.find(HEADER)).toBeDefined()
  await $.classic.SessionStart({ source: 'clear' })
  expect(await ui.find(HEADER)).toBeDefined()
})

test('a stored hide holds in the next session', async ($, on) => {
  engine(on, { isHidden: true })
  await start($)
  const ui = await mount($, 'terminal')
  expect(await ui.find(HEADER)).toBeUndefined()
})

test('yields the band to a survey', async ($, on) => {
  engine(on)
  await start($)
  const ui = await mount($, 'terminal', { ...BAND, hasSurvey: true })
  expect(await ui.find(HEADER)).toBeUndefined()
})

test(
  'stacks with another band',
  {
    plugins: [
      {
        name: 'other-band',
        register(on) {
          on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
            const below = await next(e)
            const { Box, Text } = $.ui.resolve(e)
            return (
              <Box flexDirection="column">
                <Text key="other">other band</Text>
                {below}
              </Box>
            )
          })
        },
      },
    ],
  },
  async ($, on) => {
    engine(on)
    await start($)
    for (const surface of SURFACES) {
      const ui = await mount($, surface)
      expect(await ui.find(HEADER)).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'other band' })).toBeDefined()
      await ui.unmount()
    }
  },
)
