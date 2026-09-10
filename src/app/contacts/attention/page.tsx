import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getAppAccess } from '@/lib/supabase/access'
import { createClient } from '@/lib/supabase/server'
import { LoadRecovery } from '@/components/follow-up/load-recovery'

const categories = {
  awaiting: 'Assigned — awaiting your interaction',
  stale: 'Go Backs — no activity for 7+ days',
  'new-believers': 'New believers — no later interaction after 24 hours',
} as const

type Contact = {
  id: string
  display_name: string
  location_name: string | null
  house_name: string | null
  room_or_address: string | null
  status: string
  primary_assigned_at: string | null
}

export default async function AttentionPage({ searchParams }: {
  searchParams: Promise<{ category?: string; page?: string }>
}) {
  const params = await searchParams
  const category = params.category ?? 'awaiting'
  if (!Object.hasOwn(categories, category)) notFound()
  const parsedPage = Number(params.page ?? 1)
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 && parsedPage <= 100000 ? parsedPage : 1
  const access = await getAppAccess()
  if (access.status === 'unavailable') return <LoadRecovery />
  if (!access.user || !access.profile?.is_active || access.profile.role === 'pending') redirect('/')
  const client = await createClient()
  const { data, error } = await client.rpc('get_my_contact_attention_list', { p_category: category, p_offset: (page - 1) * 50 })
  if (error || !data) return <LoadRecovery />
  const { contacts, total } = data as { contacts: Contact[]; total: number }
  const returnTo = `/contacts/attention?category=${category}&page=${page}`
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
      <Link href="/contacts" className="text-sm font-bold text-[#175cd3]">← My Contacts</Link>
      <div className="mt-4 rounded-[18px] border border-[#fedf89] bg-[#fff8eb] p-4">
        <h1 className="text-lg font-extrabold text-[#b54708]">{categories[category as keyof typeof categories]}</h1>
        <p className="mt-2 text-sm text-[#667085]">{total} contacts assigned to you. This list includes all areas, regardless of your saved filters.</p>
        {category === 'awaiting' && <p className="mt-2 text-xs leading-5 text-[#667085]">These contacts are waiting for your interaction after assignment. Knocks and text attempts do not clear this reminder. For older assignments without a recorded assignment date, it clears if you have already logged an interaction.</p>}
      </div>
      <div className="mt-4 grid gap-3">
        {contacts.map((contact) => (
          <Link key={contact.id} href={`/contacts/${contact.id}?from=${encodeURIComponent(returnTo)}`}
            className="block min-w-0 rounded-[18px] border border-[#e4e7ec] bg-white p-4 hover:border-[#b2ccff]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="min-w-0 break-words text-lg font-extrabold text-[#15223a]">{contact.display_name}</h2>
              <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-xs font-bold capitalize text-[#667085]">{contact.status.replaceAll('_', ' ')}</span>
            </div>
            <p className="mt-1 break-words text-sm text-[#667085]">{[contact.location_name, contact.house_name, contact.room_or_address].filter(Boolean).join(' • ') || 'Location unknown'}</p>
            {contact.primary_assigned_at && <p className="mt-2 text-xs text-[#667085]">Assigned {new Date(contact.primary_assigned_at).toLocaleDateString('en-US', { timeZone: 'America/Detroit', month: 'short', day: 'numeric' })}</p>}
          </Link>
        ))}
        {!contacts.length && <p className="rounded-[18px] border border-[#e4e7ec] bg-white p-5 text-sm text-[#667085]">No contacts on this page.</p>}
      </div>
      {(page > 1 || total > page * 50) && <nav aria-label="Attention list pages" className="mt-4 flex justify-between gap-4 text-sm font-bold text-[#175cd3]">
        {page > 1 ? <Link href={`/contacts/attention?category=${category}&page=${page - 1}`}>← Previous</Link> : <span />}
        {total > page * 50 && <Link href={`/contacts/attention?category=${category}&page=${page + 1}`}>Next →</Link>}
      </nav>}
    </main>
  )
}
