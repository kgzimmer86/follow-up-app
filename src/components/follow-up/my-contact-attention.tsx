'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Counts = { unattempted: number; staleGoBacks: number; newBelievers: number; total: number }
const AttentionContext = createContext<{ counts: Counts | null; error: boolean; retry: () => void }>({ counts: null, error: false, retry: () => {} })

export function MyContactAttentionProvider({ refreshKey, children }: { refreshKey: Record<string, never>; children: ReactNode }) {
  const pathname = usePathname()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    let running = false
    async function refresh() {
      if (running || document.visibilityState === 'hidden') return
      running = true
      try {
        const { data, error } = await createClient().rpc('get_my_contact_attention')
        if (error || !data) throw new Error('Attention counts unavailable')
        if (!cancelled) { setCounts(data as Counts); setError(false) }
      } catch {
        if (!cancelled) setError(true)
      } finally { running = false }
    }
    void refresh()
    const interval = window.setInterval(refresh, 60000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [pathname, refreshKey, attempt])
  return <AttentionContext.Provider value={{ counts, error, retry: () => setAttempt((value) => value + 1) }}>{children}</AttentionContext.Provider>
}

export function MyContactAttentionBadge() {
  const { counts, error } = useContext(AttentionContext)
  if (error || !counts?.total) return null
  return <span aria-label={`${counts.total} of your contacts need attention`} className="absolute -right-3 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#d92d20] px-1 text-[9px] font-extrabold leading-none text-white">{counts.total}</span>
}

export function MyContactAttentionSection() {
  const { counts, error, retry } = useContext(AttentionContext)
  return (
    <details className="mt-4 rounded-[18px] border border-[#e4e7ec] bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-sm font-extrabold text-[#15223a]">
        <span>Needs attention</span>
        <span className="text-xs text-[#667085]">{error ? 'Unavailable' : counts ? `${counts.total} contacts` : 'Loading…'}</span>
      </summary>
      <div className="border-t border-[#e4e7ec] p-4">
        <p className="mb-3 text-xs text-[#667085]">All contacts assigned to you, regardless of your current filters. Each contact counts once in the total.</p>
        {error ? <p role="alert" className="text-sm text-[#b42318]">Couldn’t load attention counts. <button onClick={retry} type="button" className="font-bold underline">Try again</button></p> : counts ? (
          <dl className="grid gap-3 text-sm text-[#15223a]">
            {[
              ['Assigned but never attempted', counts.unattempted],
              ['Go Backs — no activity for 7+ days', counts.staleGoBacks],
              ['New believers — no later interaction after 24 hours', counts.newBelievers],
            ].map(([label, count]) => <div key={label} className="flex items-start justify-between gap-3"><dt>{label}</dt><dd className="shrink-0 font-extrabold">{count}</dd></div>)}
          </dl>
        ) : <p role="status" className="text-sm text-[#667085]">Loading attention counts…</p>}
      </div>
    </details>
  )
}
