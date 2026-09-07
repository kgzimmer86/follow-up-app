'use client'

import { useEffect, useTransition, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { startFilterSession } from '@/app/filter-session-actions'
import { filterSessionUrl } from '@/lib/filter-session'

// Deduplicate initial mounts (including React's development remount check).
const launches = new Map<string, ReturnType<typeof startFilterSession>>()
const completed = new Set<string>()

const contactListPaths = new Set([
  '/contacts',
  '/contacts/area',
  '/opportunities/go-back',
  '/opportunities/share-the-gospel',
  '/opportunities/meet-someone-new',
  '/opportunities/community-group',
  '/opportunities/no-address',
])

export function FilterSession({ userId, children }: { userId: string; children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!contactListPaths.has(pathname)) {
      return
    }

    let cancelled = false
    async function initialize() {
      const key = `follow-up-area-session-${userId}`
      const navigation = window.performance.getEntriesByType('navigation')[0]
      const isReload = navigation?.entryType === 'navigation' &&
        (navigation as PerformanceNavigationTiming).type === 'reload'
      let existing = completed.has(userId)
      // Keep the area through a refresh, but reset it when a fresh document
      // starts after the app/browser was closed and reopened.
      if (isReload) {
        try { existing ||= sessionStorage.getItem(key) === '1' } catch { /* Storage may be disabled. */ }
      }
      if (!existing) {
        let launch = launches.get(userId)
        if (!launch) {
          launch = startFilterSession(userId)
          launches.set(userId, launch)
        }
        try {
          const defaults = await launch
          if (cancelled) return
          try { sessionStorage.setItem(key, '1') } catch { /* Keep the in-memory session. */ }
          completed.add(userId)
          const href = filterSessionUrl(window.location.href, defaults)
          startTransition(() => {
            if (href) router.replace(href, { scroll: false })
            else router.refresh()
          })
        } finally {
          if (!cancelled) launches.delete(userId)
        }
      }
    }
    initialize().catch((error) => {
      if (!cancelled) console.error('Follow Up session initialization failed.', error)
    })
    return () => { cancelled = true }
  }, [userId, pathname, router, startTransition])

  return children
}
