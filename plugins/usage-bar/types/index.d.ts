/** One plan usage window, as `$.session.usage().rateLimits` reports it. */
export type Limit = {
  /** `five_hour`, `seven_day`, a gateway's `spend_limit`, ... */
  kind: string
  /** 0 to 100, past 100 on an exceeded spend limit. */
  percentUsed: number
  /** ISO 8601. */
  resetsAt?: string
}

declare module 'claude-code' {
  interface PluginState {
    'usage-bar': { limits: Limit[]; now: number; isHidden: boolean }
  }
}
