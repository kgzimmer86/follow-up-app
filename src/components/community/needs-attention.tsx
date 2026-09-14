import Link from 'next/link'
import { communityAttention } from '@/lib/community-attention'
import type { CommunityAttendance, CommunityContact, CommunityMeeting, CommunityMember } from '@/lib/community'
import { cardClass, stripeClass } from './student-card-style'

export function NeedsAttention({ groupId, members, meetings, attendance, contacts }: {
  groupId: string; members: CommunityMember[]; meetings: CommunityMeeting[]; attendance: CommunityAttendance[]; contacts: CommunityContact[]
}) {
  const people = communityAttention(members, meetings, attendance)
  return <section className="space-y-3">
    <h3 className="text-xl font-extrabold text-[#15223a]">Needs Attention</h3>
    <p className="text-sm text-[#667085]">A prompt to check in after two consecutive missed meetings. Only saved attendance since joining or returning to the roster counts.</p>
    {!people.length && <p className="rounded-2xl border border-[#e4e7ec] bg-white p-5 text-sm text-[#667085]">No one on the current roster has two consecutive recorded absences.</p>}
    {people.map((person) => {
      const contact = contacts.find((c) => c.student_id === person.studentId)
      return <article key={person.studentId} className={`${cardClass(contact?.gender_raw ?? null, contact?.status ?? '')} p-4 pl-5`}>
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[6px] ${stripeClass(contact?.gender_raw ?? null, contact?.status ?? '')}`}/>
        {contact ? <Link className="block break-words text-lg font-extrabold leading-snug text-[#15223a] hover:text-[#175cd3]" href={`/contacts/${contact.id}?tab=community&from=${encodeURIComponent(`/community/groups/${groupId}?tab=attention`)}`}>{person.name}</Link> : <p className="break-words text-lg font-extrabold leading-snug">{person.name}</p>}
        <div className="mt-2"><p className="inline-block rounded-full border border-[#fedf89] bg-[#fff8eb] px-3 py-1 text-xs font-bold leading-5 text-[#b54708]">Missed the last 2 meetings</p></div>
        <div className="mt-3 space-y-1 text-sm leading-6 text-[#667085]">
          <p>Attended {person.attended} of the last {person.recorded} recorded meetings</p>
          <p>{person.lastAttended ? `Last attended: ${person.lastAttended}` : 'No attendance recorded yet'}</p>
        </div>
        {person.missing > 0 && <p className="mt-1 text-xs text-[#667085]">{person.missing} recent meeting(s) have no attendance record for this student.</p>}
      </article>
    })}
  </section>
}
