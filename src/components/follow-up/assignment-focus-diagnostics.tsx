'use client'

import { useEffect, useRef, useState } from 'react'
import { eventDeliveryDelay, focusTimingSummary, type FocusTimingEvent } from '@/lib/focus-timing'

// Render only with ?focusDiagnostics=1. No network, storage, or telemetry.
export function AssignmentFocusDiagnostics() {
  const output = useRef<HTMLPreElement>(null)
  const status = useRef<HTMLParagraphElement>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>('#assignment-search input')
    if (!input) return
    const counts = {
      contacts: document.querySelectorAll('article').length,
      selects: document.querySelectorAll('select').length,
      options: document.querySelectorAll('option').length,
      inputs: document.querySelectorAll('input').length,
    }
    const events: FocusTimingEvent[] = []
    let started = false, finished = false, startedAt = 0
    let frame = 0, previousFrame = performance.now(), maxFrameGap = 0
    let finishTimer: ReturnType<typeof setTimeout> | undefined
    let focusTimer: ReturnType<typeof setTimeout> | undefined
    const viewportStart = window.visualViewport?.height ?? null
    function finish() {
      if (finished) return
      finished = true
      cancelAnimationFrame(frame)
      if (output.current) output.current.textContent = JSON.stringify({
        version: 1, ...counts, ...focusTimingSummary(events, maxFrameGap),
        focused: document.activeElement === input,
        viewportHeightBefore: viewportStart,
        viewportHeightAfter: window.visualViewport?.height ?? null,
      }, null, 2)
    }
    function tick(now: number) {
      if (finished) return
      // Keep the prior frame so a stall BEFORE the first event handler is visible.
      if (started) maxFrameGap = Math.max(maxFrameGap, now - previousFrame)
      previousFrame = now
      frame = requestAnimationFrame(tick)
    }
    function record(event: Event) {
      if (event.target !== input || finished) return
      const now = performance.now()
      if (!started) {
        started = true; startedAt = now
        maxFrameGap = Math.max(0, now - previousFrame)
        finishTimer = setTimeout(finish, 10000)
      }
      if (events.length < 20) events.push({ event: event.type, atMs: Math.round(now - startedAt),
        deliveryDelayMs: eventDeliveryDelay(event.timeStamp, now, performance.timeOrigin) })
      if (event.type === 'focusin' && !focusTimer) focusTimer = setTimeout(finish, 1000)
    }
    const types = ['pointerdown', 'touchstart', 'mousedown', 'focusin', 'click']
    types.forEach(type => document.addEventListener(type, record, { capture: true, passive: true }))
    frame = requestAnimationFrame(tick)
    if (status.current) status.current.textContent = 'Ready. Tap the usual search field once, wait for it to respond, then scroll here to copy the report.'
    return () => {
      finished = true; cancelAnimationFrame(frame); clearTimeout(finishTimer); clearTimeout(focusTimer)
      types.forEach(type => document.removeEventListener(type, record, true))
    }
  }, [])
  return <section className="mb-4 rounded-xl border border-[#b2ccff] bg-[#eef4ff] p-4 text-sm text-[#15223a]">
    <h2 className="font-bold">First-tap timing check</h2>
    <p ref={status} className="mt-1">Preparing timing check…</p>
    <p className="mt-1 text-xs">No names or typed text are collected. Reload this link to test again. Normal app links do not enable this check.</p>
    <pre ref={output} className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs" aria-label="Focus timing report">Waiting for first tap…</pre>
    <button type="button" className="mt-2 rounded-lg bg-[#00274c] px-3 py-2 font-bold text-white" onClick={async () => {
      try { await navigator.clipboard.writeText(output.current?.textContent || ''); setCopied(true) }
      catch { setCopied(false) }
    }}>{copied ? 'Copied' : 'Copy timing report'}</button>
  </section>
}
