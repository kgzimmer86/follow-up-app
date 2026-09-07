'use client'

import { useEffect, useState, useTransition } from 'react'
import { activateContactFilterView } from '@/app/filter-session-actions'

export function FilterViewSession({ userId, view, needsActivation }: {
  userId: string
  view: string
  needsActivation: boolean
}) {
  const [error, setError] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!needsActivation) return
    let cancelled = false
    // Record an actual visit, not a prefetched link. The server already renders
    // the destination's filters; this prevents old card-only choices returning
    // after visiting another card without changing any controls there.
    startTransition(async () => {
      try {
        await activateContactFilterView(userId, view)
        if (!cancelled) setError(false)
      } catch {
        if (!cancelled) setError(true)
      }
    })
    return () => { cancelled = true }
  }, [userId, view, needsActivation, startTransition])

  return error && needsActivation ? (
    <p role="alert" className="mb-3 text-sm text-red-700">
      Couldn’t save your filter preferences. Please reload and try again.
    </p>
  ) : null
}
