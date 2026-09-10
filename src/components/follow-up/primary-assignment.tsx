'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Person = { id: string; display_name: string; group: 'disciples' | 'staff' }

export function PrimaryAssignment({ contactId, userId, ownerId, ownerName }: {
  contactId: string; userId: string; ownerId: string | null; ownerName: string | null
}) {
  const router = useRouter()
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const client = createClient()
        const { data, error } = await client.rpc('get_contact_primary_choices', { p_contact_id: contactId })
        if (error) throw error
        if (!cancelled) setPeople((data ?? []) as Person[])
      } catch {
        if (!cancelled) setError('Couldn’t load assignment choices. Please retry.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [contactId, userId, attempt])

  function assign(id: string) {
    if (!id || id === ownerId) return
    setError('')
    startTransition(async () => {
      try {
        const client = createClient()
        // Preserve the existing self-claim rules; delegating uses assignment rules.
        const result = id === userId
          ? await client.rpc('claim_follow_up_contact', { p_contact_id: contactId })
          : await client.rpc('assign_contacts_to_follow_up_user', { p_contact_ids: [contactId], p_assignee_id: id })
        if (result.error) throw result.error
        router.refresh()
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Couldn’t change primary. Please try again.')
      }
    })
  }

  return (
    <div className="mt-1.5 min-w-0">
      <select aria-label="Primary contact owner" value={ownerId ?? ''} disabled={pending || loading}
        onChange={(event) => assign(event.target.value)}
        className="w-full min-w-0 rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm text-[#15223a] disabled:opacity-60">
        {!ownerId && <option value="" disabled>Unassigned</option>}
        {ownerId && ownerId !== userId && !people.some((person) => person.id === ownerId) && <option value={ownerId} disabled>{ownerName || 'Current primary'}</option>}
        <option value={userId}>You</option>
        {(['disciples', 'staff'] as const).map((group) => people.some((person) => person.group === group) && (
          <optgroup key={group} label={group === 'staff' ? 'Staff / Admin' : 'Your disciples'}>
            {people.filter((person) => person.group === group).map((person) => <option key={person.id} value={person.id}>{person.display_name}</option>)}
          </optgroup>
        ))}
      </select>
      <p role="status" className="mt-1 text-xs text-[#667085]">{loading ? 'Loading assignment choices…' : pending ? 'Saving…' : people.some((person) => person.group === 'staff') ? 'You, your eligible direct disciples, and staff handoffs.' : 'You and your eligible direct disciples.'}</p>
      {error && <div role="alert" className="mt-1 text-xs text-red-700">{error} <button type="button" disabled={pending || loading} className="underline" onClick={() => { setLoading(true); setError(''); setAttempt((value) => value + 1) }}>Retry</button></div>}
    </div>
  )
}
