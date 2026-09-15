// Numeric diagnostics only. Never include input values, names, or record IDs.
export function eventDeliveryDelay(timestamp: number, now: number, timeOrigin: number) {
  const relative = timestamp > 1e12 ? timestamp - timeOrigin : timestamp
  if (!Number.isFinite(relative) || relative <= 0 || relative > now) return null
  return Math.round(now - relative)
}

export type FocusTimingEvent = { event: string; atMs: number; deliveryDelayMs: number | null }

export function focusTimingSummary(events: FocusTimingEvent[], maxFrameGapMs: number) {
  const first = events.find(event => event.event === 'pointerdown' || event.event === 'touchstart' || event.event === 'mousedown')
  const focus = events.find(event => event.event === 'focusin')
  return {
    tapToFocusMs: first && focus ? Math.max(0, focus.atMs - first.atMs) : null,
    maxEventDeliveryDelayMs: events.reduce((max, event) => Math.max(max, event.deliveryDelayMs ?? 0), 0),
    maxFrameGapMs: Math.round(maxFrameGapMs),
    events,
  }
}
