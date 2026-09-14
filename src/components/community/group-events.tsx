import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { campaignEvents } from '@/lib/community-events-server'
import { invitationStatuses } from '@/lib/community-events'
import { ministryToday, type CommunityContact, type CommunityMember } from '@/lib/community'
import { InvitationResponse } from './invitation-response'
import { cardClass, stripeClass } from './student-card-style'

export async function GroupEvents({ groupId, campaignId, members, contacts, editable, eventId }: {
  groupId: string; campaignId: string; members: CommunityMember[]; contacts: CommunityContact[]; editable: boolean; eventId?: string
}) {
  const events = await campaignEvents(campaignId)
  const upcoming = events.filter((e) => e.is_open && e.event_date >= ministryToday()).sort((a, b) => a.event_date.localeCompare(b.event_date))
  const selected = eventId ? events.find((e) => e.id === eventId) : upcoming[0] ?? events.find((e) => e.is_open) ?? events[0]
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
    <div><h3 className="text-xl font-extrabold text-[#15223a]">Event invitations</h3>
      <p className="mt-2 text-sm text-[#667085]">Responses are shared across groups. Updating a student here updates their response everywhere in this campaign.</p>
      <Link href={`/community/events?campaign=${campaignId}`} className="inline-flex min-h-11 items-center text-sm font-bold text-[#175cd3]">View campaign events →</Link>
    </div>
    {!events.length ? <p className="rounded-2xl border border-[#e4e7ec] bg-white p-5 text-sm text-[#667085]">Staff haven’t created any campaign events yet.</p> : <>
      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="events"/>
        <label className="min-w-0 flex-1 text-sm font-bold">Event<select name="event" defaultValue={selected?.id ?? ''} className="mt-1 min-h-11 w-full rounded-xl border border-[#d0d5dd] bg-white px-3 text-base">
          {!selected && <option value="">Choose an event</option>}
          {events.map((e) => <option key={e.id} value={e.id}>{e.name} · {e.event_date}{!e.is_open ? ' · Closed' : ''}</option>)}
        </select></label>
        <button className="min-h-11 rounded-xl border border-[#d0d5dd] bg-white px-4 text-sm font-bold text-[#475467]">Open</button>
      </form>
      {!selected && <p role="alert" className="text-sm text-[#b54708]">Choose an event from this campaign.</p>}
      {selected && <>
        <div className="rounded-2xl border border-[#dbe8f8] bg-white p-4"><h4 className="text-lg font-extrabold">{selected.name}</h4>
          <p className="mt-1 text-sm text-[#667085]">{selected.event_date}{selected.location ? ` · ${selected.location}` : ''}</p>
          {selected.details && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#475467]">{selected.details}</p>}
          {(!editable || !selected.is_open) && <p className="mt-2 text-sm font-bold text-[#667085]">Read-only — invitation updates are closed.</p>}
        </div>
        <div className="flex flex-wrap gap-2">{invitationStatuses.map((s) => <span key={s.value} className="rounded-full border border-[#e4e7ec] bg-white px-3 py-2 text-xs font-bold text-[#475467]">{s.label}: {roster.filter((m) => (responses.find((r) => r.student_id === m.student_id)?.status ?? 'not_asked') === s.value).length}</span>)}</div>
        {!roster.length && <p className="text-sm text-[#667085]">No students are on this group’s current roster.</p>}
        {roster.map((member) => {
          const contact = contacts.find((c) => c.student_id === member.student_id)
          const response = responses.find((r) => r.student_id === member.student_id)
          return <article key={member.student_id} className={`${cardClass(contact?.gender_raw ?? null, contact?.status ?? '')} p-4 pl-5`}>
            <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[6px] ${stripeClass(contact?.gender_raw ?? null, contact?.status ?? '')}`}/>
            {editable && contact ? <Link className="text-lg font-extrabold text-[#15223a]" href={`/contacts/${contact.id}?tab=community&from=${encodeURIComponent(`/community/groups/${groupId}?tab=events&event=${selected.id}`)}`}>{member.students.display_name}</Link> : <p className="text-lg font-extrabold">{member.students.display_name}</p>}
            {editable && selected.is_open ? <InvitationResponse key={`${selected.id}:${response?.version ?? 0}`} groupId={groupId} eventId={selected.id} studentId={member.student_id} name={member.students.display_name} status={response?.status ?? 'not_asked'} version={response?.version ?? 0}/> : <p className="mt-2 text-sm">{invitationStatuses.find((s) => s.value === response?.status)?.label ?? 'Not asked'}</p>}
          </article>
        })}
      </>}
    </>}
  </section>
}
