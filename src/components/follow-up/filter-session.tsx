'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
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
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!contactListPaths.has(pathname)) {
      return
    }

    let cancelled = false
    async function initialize() {
      const key = `follow-up-area-session-${userId}`
      let existing = completed.has(userId)
      try { existing ||= sessionStorage.getItem(key) === '1' } catch { /* Storage may be disabled. */ }
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
            setReady(true)
          })
        } finally {
          if (!cancelled) launches.delete(userId)
        }
      }
      if (existing && !cancelled) setReady(true)
    }
    initialize().catch(() => {
      if (!cancelled) setFailed(true)
    })
    return () => { cancelled = true }
  }, [userId, pathname, router, attempt, startTransition])

  if (!contactListPaths.has(pathname) || ready) return children
  return (
    <div className="p-6 text-sm text-[#667085]" role="status">
      {failed ? (
        <>
          Couldn’t load your assigned area.{' '}
          <button className="font-bold text-[#175cd3]" onClick={() => { setFailed(false); setAttempt((value) => value + 1) }}>
            Retry
          </button>
        </>
      ) : 'Loading Follow Up…'}
    </div>
  )
}
