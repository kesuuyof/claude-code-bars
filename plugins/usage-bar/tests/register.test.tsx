import { expect, mock, test } from 'claude-code/testing'
import type { ElementQuery, Engine, FoundElement, Plugin, PluginTier } from 'claude-code/testing'
import type { On, RenderPropsOf, SessionRateLimit } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const
const WIDTH = 60
const NOW = Date.parse('2026-10-06T12:00:00Z')
const H = 3_600_000
const BAND: RenderPropsOf['AbovePrompt'] = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: WIDTH,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

const at = (ms: number) => new Date(NOW + ms).toISOString()
/** 5h window 30% elapsed, 7d window a day in. */
const windows = (fiveHour: number, sevenDay = 18): SessionRateLimit[] => [
  { kind: 'five_hour', percentUsed: fiveHour, resetsAt: at(3.5 * H) },
  { kind: 'seven_day', percentUsed: sevenDay, resetsAt: at(6 * 24 * H) },
]

/** Stands in for the engine: no reading until a measure brings one, as on a fresh session. */
function engine(on: On, store: Record<string, unknown> = {}) {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on, store)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('classic.SessionStart', () => ({}))
  on('ui.render', () => ({ type: 'engine', ref: 0 }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  return clock
}

const start = ($: Engine) => $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
const measure = ($: Engine, rateLimits: SessionRateLimit[]) =>
  $.session.measure({ context: { window: 200_000 }, rateLimits, changed: ['rateLimits'] })
const toggle = ($: Engine) =>
  $.command.run({
    command: 'usage-bar',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })
const mount = ($: Engine, surface: (typeof SURFACES)[number], props = BAND) =>
  $.ui.mount({ plugin: 'usage-bar', surface, component: 'AbovePrompt', props })

const WARNING = { type: 'Text', text: /ahead of pace/ }
/** The band's bar rows: the width of the box a bar starts after, and what the row shows. */
const rowsOf = async (ui: { findAll: (q: ElementQuery) => Promise<FoundElement[]> }) =>
  (await ui.findAll({ type: 'Box' }))
    .filter(b => b.props.flexDirection === 'row')
    .map(b => ({ indent: (b.children[0] as { props: { width?: number } }).props.width, text: b.text }))
/** The row of one window, by its label: "5h", then the bar. */
const rowFor = async (ui: Parameters<typeof rowsOf>[0], label: string) =>
  (await rowsOf(ui)).find(r => r.text.startsWith(`${label}█`))
// full and empty cells are the same glyph, so the bar is one run of it
const bar = (row = '') => row.match(/█+/)?.[0].length

test('nothing until a response reports the windows', async ($, on) => {
  engine(on)
  await start($)
  const ui = await mount($, 'terminal')
  expect(await rowFor(ui, '5h')).toBeUndefined()
})

test('one bar per window, with percent and time to reset', async ($, on) => {
  engine(on)
  await start($)
  await measure($, windows(25))

  for (const surface of SURFACES) {
    const ui = await mount($, surface)
    const fiveHourRow = await rowFor(ui, '5h')
    const sevenDayRow = await rowFor(ui, '7d')
    const fiveHour = fiveHourRow?.text ?? ''
    const sevenDay = sevenDayRow?.text ?? ''
    expect(fiveHour).toEndWith(' 25% · resets in 3h30m')
    expect(sevenDay).toEndWith(' 18% · resets in 6d0h')
    // context-bar's test pins the same numbers: a 60-column band puts both bars at 3, 32 cells long
    for (const row of [fiveHourRow, sevenDayRow]) {
      expect(row?.indent).toBe(3)
      expect(bar(row?.text)).toBe(32)
    }
    expect(await ui.find(WARNING)).toBeUndefined()
    await ui.unmount()
  }
})

test('bars are 40 cells by default on a wide band', async ($, on) => {
  engine(on)
  await start($)
  await measure($, windows(25))
  const ui = await mount($, 'terminal', { ...BAND, bodyColumns: 200 })
  expect(bar((await rowFor(ui, '5h'))?.text)).toBe(40)
})

test('the barWidth option sets the bar length', { options: { barWidth: 20 } }, async ($, on) => {
  engine(on)
  await start($)
  await measure($, windows(25))
  const ui = await mount($, 'terminal', { ...BAND, bodyColumns: 200 })
  expect(bar((await rowFor(ui, '5h'))?.text)).toBe(20)
})

test('empty cells are the same glyph as full ones, dimmed', async ($, on) => {
  engine(on)
  await start($)
  await measure($, windows(25))
  const ui = await mount($, 'terminal', { ...BAND, bodyColumns: 200 })
  const [full, empty] = await ui.findAll({ type: 'Text', text: /^█+$/ })
  expect([full?.text.length, full?.props.dimColor]).toEqual([10, undefined])
  expect([empty?.text.length, empty?.props.dimColor]).toEqual([30, true])
})

test('bar and percent turn yellow at 50% and red at 80%', async ($, on) => {
  engine(on)
  await start($)
  const ui = await mount($, 'terminal')
  // the first row's percent and countdown
  const tone = async () => (await ui.find({ type: 'Text', text: /^ \d+% · / }))?.props.color

  await measure($, windows(10))
  expect(await tone()).toBeUndefined()
  await measure($, windows(55))
  expect(await tone()).toBe('warning')
  await measure($, windows(85))
  expect(await tone()).toBe('error')
})

test('warns under the row when use runs well ahead of the time elapsed', async ($, on) => {
  engine(on)
  await start($)
  await measure($, windows(60))
  const ui = await mount($, 'terminal')
  const warning = await ui.find(WARNING)
  expect(warning?.text).toContain('60% used, 30% of the window elapsed')
  expect(warning?.props.color).toBe('warning')

  await measure($, windows(35))
  expect(await ui.find(WARNING)).toBeUndefined()
})

test('the countdown moves with the clock', async ($, on) => {
  const clock = engine(on)
  await start($)
  await measure($, windows(25))
  const ui = await mount($, 'terminal')

  await clock.advance(60_000)
  expect((await rowFor(ui, '5h'))?.text).toEndWith('resets in 3h29m')
  await clock.advance(30 * 60_000)
  expect((await rowFor(ui, '5h'))?.text).toEndWith('resets in 2h59m')
})

test('/usage-bar toggles and the choice survives a /clear', async ($, on) => {
  engine(on)
  await start($)
  await measure($, windows(25))
  const ui = await mount($, 'terminal')

  expect((await toggle($)).text).toBe('Usage bars hidden.')
  expect(await rowFor(ui, '5h')).toBeUndefined()
  await $.classic.SessionStart({ source: 'clear' })
  expect(await rowFor(ui, '5h')).toBeUndefined()

  expect((await toggle($)).text).toBe('Usage bars shown.')
  await measure($, windows(25))
  expect(await rowFor(ui, '5h')).toBeDefined()
})

test('a stored hide holds in the next session', async ($, on) => {
  engine(on, { isHidden: true })
  await start($)
  await measure($, windows(25))
  const ui = await mount($, 'terminal')
  expect(await rowFor(ui, '5h')).toBeUndefined()
})

test('yields the band to a survey', async ($, on) => {
  engine(on)
  await start($)
  await measure($, windows(25))
  const ui = await mount($, 'terminal', { ...BAND, hasSurvey: true })
  expect(await rowFor(ui, '5h')).toBeUndefined()
})

/** Draws itself above the bands beneath it, as context-bar does. */
const contextLike = (tier: PluginTier): Plugin => ({
  name: 'context-like',
  tier,
  register(on) {
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      const below = await next(e)
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text>Context 45k / 200k (23%)</Text>
          {below}
        </Box>
      )
    })
  },
})

for (const tier of ['prepend', 'append'] as const) {
  test(`stacks under context-bar whichever loads first (context-bar in ${tier})`, { plugins: [contextLike(tier)] }, async ($, on) => {
    engine(on)
    await start($)
    await measure($, windows(25))
    for (const surface of SURFACES) {
      const ui = await mount($, surface)
      const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
      const context = texts.findIndex(t => t.startsWith('Context'))
      const fiveHour = texts.findIndex(t => t === '5h')
      expect(context).toBeGreaterThanOrEqual(0)
      expect(fiveHour).toBeGreaterThan(context)
      await ui.unmount()
    }
  })
}
