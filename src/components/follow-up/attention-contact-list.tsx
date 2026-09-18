'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { nextStepsEnabled, nextStepsChangedEvent } from '@/lib/next-steps'
import { NextStepWorkspace } from './next-step-workspace'

type Contact = { id: string; display_name: string; status: string; location_name: string | null; house_name: string | null; room_or_address: string | null }

export function AttentionContactList({ category, target }: { category: string; target?: string }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState<string | null>(target ?? null)
  const located = useRef(false)
  const section = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') setAttempt(a => a + 1) }
    window.addEventListener(nextStepsChangedEvent, refresh)
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener(nextStepsChangedEvent, refresh); window.removeEventListener('focus', refresh) }
  }, [])
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true); setError(false)
      try {
        const db = createClient()
        const { data, error } = await db.rpc('get_my_contact_attention_list', { p_category: category, p_offset: page * 50 })
        if (error || !data) throw new Error('Unavailable')
        if (cancelled) return
        // Follow the same authorized paginated reader until the notification's
        // contact is found. Never substitute a broad contact lookup.
        if (target && page === 0 && !located.current) {
          let result = data as { contacts: Contact[]; total: number }
          let offset = 0
          while (!result.contacts.some(c => c.id === target) && offset + 50 < result.total) {
            offset += 50
            const next = await db.rpc('get_my_contact_attention_list', { p_category: category, p_offset: offset })
            if (cancelled) return
            if (next.error || !next.data) throw new Error('Unavailable')
            result = next.data
          }
          located.current = true
          if (result.contacts.some(c => c.id === target) && offset > 0) { setPage(offset / 50); return }
        }
        setContacts(data.contacts); setTotal(data.total)
      } catch { if (!cancelled) setError(true) }
      finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [category, page, target, attempt])
  useEffect(() => {
    if (!loading && target) section.current?.querySelector(`[data-contact="${CSS.escape(target)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [contacts, loading, target])
  return <div ref={section} className="mt-3 space-y-3" aria-busy={loading}>
    {loading ? <p role="status" className="text-sm text-[#667085]">Loading contacts…</p> : error ? <p role="alert" className="text-sm text-red-800">Couldn’t load contacts. <button className="min-h-11 underline" onClick={() => setAttempt(a => a + 1)}>Try again</button></p> : <>
      {target && !contacts.some(c => c.id === target) && <p className="text-sm text-[#667085]">That contact may no longer need attention in this category.</p>}
      {contacts.map(contact => <article key={contact.id} data-contact={contact.id} className={`rounded-2xl border bg-white p-4 ${target === contact.id ? 'border-[#2f80ed]' : 'border-[#e4e7ec]'}`}>
        <Link href={`/contacts/${contact.id}?from=${encodeURIComponent(`/contacts?context=1&attention=${category}`)}`} className="text-base font-extrabold text-[#00274c] underline">{contact.display_name}</Link>
        <p className="mt-1 text-xs text-[#667085]">{[contact.location_name, contact.house_name, contact.room_or_address].filter(Boolean).join(' • ')}</p>
        {nextStepsEnabled && <><button type="button" aria-expanded={open === contact.id} onClick={() => setOpen(open === contact.id ? null : contact.id)} className="mt-3 min-h-11 rounded-xl border border-[#d0d5dd] px-4 py-2 text-sm font-bold text-[#344054]">My Next Step {open === contact.id ? '▴' : '▾'}</button>
          {open === contact.id && <NextStepWorkspace contact={{ id: contact.id, name: contact.display_name }} />}</>}
      </article>)}
      {!contacts.length && <p className="text-sm text-[#667085]">No contacts need attention in this category.</p>}
      {(page > 0 || total > (page + 1) * 50) && <nav aria-label="Attention list pages" className="flex justify-between text-sm font-bold text-[#175cd3]">
        <button className="min-h-11 disabled:opacity-40" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Previous</button>
        <button className="min-h-11 disabled:opacity-40" disabled={total <= (page + 1) * 50} onClick={() => setPage(p => p + 1)}>Next →</button>
      </nav>}
    </>}
  </div>
}
