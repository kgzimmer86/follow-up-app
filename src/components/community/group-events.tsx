import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { campaignEvents } from '@/lib/community-events-server'
import { invitationStatuses } from '@/lib/community-events'
import { ministryToday, type CommunityContact, type CommunityMember } from '@/lib/community'
import { InvitationResponse } from './invitation-response'
import { EventViewSelect } from './event-view-select'
import { cardClass, stripeClass } from './student-card-style'

export async function GroupEvents({ groupId, campaignId, members, contacts, editable, eventId }: {
  groupId: string; campaignId: string; members: CommunityMember[]; contacts: CommunityContact[]; editable: boolean; eventId?: string
}) {
  const events = await campaignEvents(campaignId)
  const upcoming = events.filter((e) => e.is_open && e.event_date >= ministryToday()).sort((a, b) => a.event_date.localeCompare(b.event_date))
  const selected = eventId ? events.find((e) => e.id === eventId) : upcoming[0] ?? events.find((e) => e.is_open) ?? events[0]
  const canUpdate = editable && Boolean(selected?.is_open && selected.event_date >= ministryToday())
  const roster = [...new Map(members.filter((m) => !m.ended_on).map((m) => [m.student_id, m])).values()]
    .sort((a, b) => a.students.display_name.localeCompare(b.students.display_name))
  const responses: { student_id: string; status: string; version: number }[] = []
  if (selected) {
    const client = await createClient()
    for (let i = 0; i < roster.length; i += 100) {
      const { data, error } = await client.from('community_event_invitations').select('student_id,status,version')
        .eq('event_id', selected.id).in('student_id', roster.slice(i, i + 100).map((m) => m.student_id))
      if (error) throw new Error(error.message)
      responses.push(...data)
    }
  }
  return <section className="space-y-4">
    {!events.length ? <p className="rounded-2xl border border-[#e4e7ec] bg-white p-5 text-sm text-[#667085]">Staff haven’t created any campaign events yet.</p> : <>
      <EventViewSelect label="Event" value={selected?.id ?? ''} placeholder={!selected ? 'Choose an event' : undefined} options={events.map(e => ({
        value: e.id, label: `${e.name} · ${e.event_date}${!e.is_open ? ' · Closed' : ''}`,
        href: `/community/events?${new URLSearchParams({ campaign: campaignId, group: groupId, event: e.id })}`,
      }))}/>
      {!selected && <p role="alert" className="text-sm text-[#b54708]">Choose an event from this campaign.</p>}
      {selected && <>
        {(selected.location || selected.details) && <details key={selected.id} className="text-sm text-[#475467]">
          <summary className="cursor-pointer font-bold">Event details</summary>
          {selected.location && <p className="mt-2">{selected.location}</p>}
          {selected.details && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#475467]">{selected.details}</p>}
        </details>}
        {!canUpdate && <p className="text-sm font-bold text-[#667085]">Read-only — invitation updates are closed.</p>}
        <p className="text-xs text-[#667085]">Responses are shared across groups.</p>
        <div className="flex flex-wrap gap-2">{invitationStatuses.map((s) => <span key={s.value} className="rounded-full border border-[#e4e7ec] bg-white px-3 py-2 text-xs font-bold text-[#475467]">{s.label}: {roster.filter((m) => (responses.find((r) => r.student_id === m.student_id)?.status ?? 'not_asked') === s.value).length}</span>)}</div>
        {!roster.length && <p className="text-sm text-[#667085]">No students are on this group’s current roster.</p>}
        {roster.map((member) => {
          const contact = contacts.find((c) => c.student_id === member.student_id)
          const response = responses.find((r) => r.student_id === member.student_id)
          return <article key={member.student_id} className={`${cardClass(contact?.gender_raw ?? null, contact?.status ?? '')} p-4 pl-5`}>
            <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[6px] ${stripeClass(contact?.gender_raw ?? null, contact?.status ?? '')}`}/>
            {editable && contact ? <Link className="text-lg font-extrabold text-[#15223a]" href={`/contacts/${contact.id}?tab=community&from=${encodeURIComponent(`/community/events?campaign=${campaignId}&group=${groupId}&event=${selected.id}`)}`}>{member.students.display_name}</Link> : <p className="text-lg font-extrabold">{member.students.display_name}</p>}
            {canUpdate ? <InvitationResponse key={`${selected.id}:${response?.version ?? 0}`} groupId={groupId} eventId={selected.id} studentId={member.student_id} name={member.students.display_name} status={response?.status ?? 'not_asked'} version={response?.version ?? 0}/> : <p className="mt-2 text-sm">{invitationStatuses.find((s) => s.value === response?.status)?.label ?? 'Not asked'}</p>}
          </article>
        })}
      </>}
    </>}
  </section>
}
