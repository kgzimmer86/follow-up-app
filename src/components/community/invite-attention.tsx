'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

const changed = 'community-invitations-changed'
export function invitationsChanged() { window.dispatchEvent(new Event(changed)) }
const Context = createContext<{ initial: number; reminders: number; groups: number } | null>(null)

export function InviteAttentionProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<{ initial: number; reminders: number; groups: number } | null>(null)
  useEffect(() => {
    let disposed = false, running = false, dirty = false, last = 0
    let retry: ReturnType<typeof setTimeout> | undefined
    async function refresh(force = false) {
      if (disposed || document.visibilityState === 'hidden') return
      if (running) { dirty ||= force; return }
      if (!force && Date.now() - last < 30000) return
      running = true
      try {
        const { data, error } = await createClient().rpc('community_workspace_counts')
        if (!disposed) setCounts(error ? null : data)
      } catch { if (!disposed) setCounts(null) }
      finally {
        running = false; last = Date.now()
        if (dirty && !disposed) { dirty = false; retry = setTimeout(() => void refresh(true), 300) }
      }
    }
    const normal = () => { void refresh() }
    const mutation = () => { clearTimeout(retry); retry = setTimeout(() => void refresh(true), 200) }
    // An effect runs after render. No count query is awaited by the server layout.
    normal()
    const interval = setInterval(normal, 60000)
    window.addEventListener('focus', normal)
    document.addEventListener('visibilitychange', normal)
    window.addEventListener(changed, mutation)
    return () => {
      disposed = true; clearInterval(interval); clearTimeout(retry)
      window.removeEventListener('focus', normal)
      document.removeEventListener('visibilitychange', normal)
      window.removeEventListener(changed, mutation)
    }
  }, [])
  return <Context.Provider value={counts}>{children}</Context.Provider>
}

export function InviteBadge({ inline = false, kind = 'invitations' }: { inline?: boolean; kind?: 'invitations' | 'groups' | 'total' }) {
  const counts = useContext(Context)
  const count = !counts ? 0 : kind === 'groups' ? counts.groups : kind === 'total' ? counts.initial + counts.groups : counts.initial
  if (!count) return null
  return <span aria-label={`${count} ${kind === 'groups' ? 'group attendance follow-ups' : kind === 'total' ? 'Community items need attention' : 'invitations need an invitation'}`} className={`${inline ? 'inline-flex' : 'absolute -right-3 -top-1 flex'} h-4 min-w-4 items-center justify-center rounded-full bg-[#d92d20] px-1 text-[9px] font-extrabold leading-none text-white`}>{count}</span>
}
