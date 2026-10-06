/** One row of /context's breakdown that takes room in the window. */
export type Segment = {
  name: string
  tokens: number
  /** Theme key, as /context draws the row. */
  color: string
  kind: 'used' | 'free' | 'buffer'
}

/** What the band draws, taken from `$.session.usage({ breakdown })`. */
export type Snapshot = {
  segments: Segment[]
  used: number
  window: number
  percent: number
  /** Token count where auto-compact runs; null when it is off. */
  autoCompactAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { snapshot: Snapshot | null; isHidden: boolean }
  }
}
