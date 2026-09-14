'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ministryToday } from '@/lib/community'
import { invitationStatuses } from '@/lib/community-events'
import { inputClass } from './group-controls'

export type OutreachSelection = { id: string; name: string; response: string | null }
type Choice = { id: string; name: string; event_date: string; invited: boolean; response: string }
export function OutreachFields({ contactId, value, onChange }: {
  contactId: string; value: OutreachSelection | null; onChange: (value: OutreachSelection | null) => void
}) {
  const [choices, setChoices] = useState<Choice[] | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const client = createClient()
        const contact = await client.from('follow_up_contacts').select('campaign_id,student_id').eq('id', contactId).single()
        if (contact.error) throw contact.error
        const events = await client.from('community_events').select('id,name,event_date')
          .eq('campaign_id', contact.data.campaign_id).eq('is_open', true).gte('event_date', ministryToday()).order('event_date').limit(500)
        if (events.error) throw events.error
        const responses = events.data.length ? await client.from('community_event_invitations').select('event_id,status,first_invited_at')
          .eq('student_id', contact.data.student_id).in('event_id', events.data.map(e => e.id)) : { data: [], error: null }
        if (responses.error) throw responses.error
        if (!cancelled) {
          setChoices(events.data.map(e => ({ ...e, invited: Boolean(responses.data?.find(r => r.event_id === e.id)?.first_invited_at), response: responses.data?.find(r => r.event_id === e.id)?.status ?? 'not_asked' })))
          setError(false)
        }
      } catch { if (!cancelled) setError(true) }
    }
    void load()
    return () => { cancelled = true }
  }, [contactId, retry])
  const selected = choices?.find(e => e.id === value?.id)
  return <div className="space-y-3 rounded-xl border border-[#dbe8f8] bg-[#f9fafb] p-3">
    {error ? <p role="alert" className="text-sm text-[#b54708]">Events could not load. <button type="button" className="underline" onClick={() => setRetry(x => x + 1)}>Try again</button></p> : !choices ? <p className="text-sm">Loading events…</p> : <>
      <label className="block text-sm font-bold">Campaign event<select required className={inputClass} value={value?.id ?? ''} onChange={e => {
        const choice = choices.find(c => c.id === e.target.value)
        onChange(choice ? { id: choice.id, name: choice.name, response: null } : null)
      }}><option value="">Choose an event</option>{choices.map(e => <option key={e.id} value={e.id}>{e.name} · {e.event_date}</option>)}</select></label>
      {!choices.length && <p className="text-sm text-[#667085]">No upcoming open campaign events.</p>}
      {selected && <>
        <p className="text-xs text-[#667085]">{selected.invited ? 'This records a reminder. The shared reminder clock restarts when you save.' : 'Saving records this invitation and completes any assigned invitation task.'}</p>
        <label className="block text-sm font-bold">Their response<select className={inputClass} value={value?.response ?? ''} onChange={e => { if (value) onChange({ ...value, response: e.target.value || null }) }}>
          <option value="">{selected.invited ? `Keep current — ${invitationStatuses.find(s => s.value === selected.response)?.label ?? 'Invited'}` : 'No response yet — Invited'}</option>
          {invitationStatuses.filter(s => s.value !== 'not_asked').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select></label>
      </>}
    </>}
  </div>
}
