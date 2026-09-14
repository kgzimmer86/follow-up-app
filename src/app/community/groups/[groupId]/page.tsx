import Link from 'next/link'
import { cardClass, stripeClass } from '@/components/community/student-card-style'
import { DiscipleBackButton } from '@/components/follow-up/disciple-back-button'
import { isMeetingDateAllowed } from '@/lib/campaign-state'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAppAccess } from '@/lib/supabase/access'
import { LoadRecovery } from '@/components/follow-up/load-recovery'
import { AttendanceChecklist } from '@/components/community/attendance-checklist'
import { DeleteMeeting } from '@/components/community/delete-meeting'
import { NeedsAttention } from '@/components/community/needs-attention'
import { AddAttender, MemberActions } from '@/components/community/group-controls'
import { GroupSettings } from '@/components/community/group-settings'
import { groupData } from '@/lib/community-server'
import { ministryToday, validMeetingDate, attendanceRoster, attendanceSummary, type CommunityGroup, type CommunityCampaign } from '@/lib/community'

export default async function GroupPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ date?: string; tab?: string; filter?: string; event?: string }> }) {
  const access = await getAppAccess()
  if (access.status === 'unavailable') return <LoadRecovery/>
  if (!access.user || !access.profile?.is_active || access.profile.role === 'pending') redirect('/')
  const { groupId } = await params
  if (!/^[\da-f-]{36}$/i.test(groupId)) notFound()
  const query = await searchParams
  const client = await createClient()
  const { data: row, error } = await client.from('community_groups').select('*').eq('id', groupId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!row) notFound()
  const group = row as CommunityGroup
  const { data: campaign, error: campaignError } = await client.from('follow_up_campaigns').select('id,label,status,starts_on,ends_on').eq('id', group.campaign_id).single()
  if (campaignError) throw new Error(campaignError.message)
  const year = campaign as CommunityCampaign
  if (query.tab === 'events') redirect(`/community/events?${new URLSearchParams({ campaign: year.id, group: groupId, ...(query.event ? { event: query.event } : {}) })}`)
  const editable = year.status === 'active' && group.is_active
  const { members, meetings, attendance, contacts } = await groupData(group)
  const date = validMeetingDate(query.date, editable ? ministryToday() : meetings[0]?.meeting_date ?? year.ends_on)
  const dateAllowed = isMeetingDateAllowed(query.date ?? date, year.starts_on, year.ends_on, ministryToday())
  const tab = ['people', 'history', 'settings', ...(editable ? ['attention'] : [])].includes(query.tab ?? '') ? query.tab : 'attendance'
  const people = attendanceRoster(members, meetings, attendance, date).map((person) => {
    const contact = contacts.find((c) => c.student_id === person.student_id)
    return { ...person, gender: contact?.gender_raw ?? null, status: contact?.status ?? '' }
  })
  const meeting = meetings.find((m) => m.meeting_date === date)
  const uniquePeople = [...new Map(members.map((m) => [m.student_id, m])).values()].sort((a, b) => a.students.display_name.localeCompare(b.students.display_name))
  const filter = ['involved', 'attended', 'ever', 'roster'].includes(query.filter ?? '') ? query.filter : undefined
  const filteredPeople = uniquePeople.filter((member) => {
    const id = member.student_id
    const active = members.some((m) => m.student_id === id && !m.ended_on)
    if (filter === 'roster') return active
    if (filter === 'involved') return active && contacts.some((c) => c.student_id === id && c.status === 'involved')
    if (filter === 'ever') return attendance.some((a) => a.student_id === id && a.is_present)
    if (filter === 'attended') return attendance.some((a) => a.student_id === id && a.is_present && a.meeting_id === meeting?.id)
    return true
  })
  const filterLabel = filter === 'involved' ? 'Involved members' : filter === 'attended' ? `Attended ${date}` : filter === 'ever' ? 'Ever attended' : 'Current roster'
  return <main className="mx-auto max-w-[800px] px-[18px] py-6 md:px-7">
    <DiscipleBackButton href={`/community?campaign=${year.id}`} />
    <h2 className="mt-3 break-words text-2xl font-extrabold tracking-tight text-[#15223a] md:text-3xl">{group.name}</h2><p className="mt-2 text-sm leading-6 text-[#667085]">{year.label}{!editable && ' · Read-only history'}</p>
    {editable && ['staff', 'admin'].includes(access.profile.role) && <Link href={`/community/groups/${groupId}?tab=settings`} className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-[#475467]">Group settings</Link>}
    <nav data-navigation-tabs aria-label="Group sections" className="my-5 flex gap-1 overflow-x-auto rounded-[14px] border border-[#e4e7ec] bg-[#f9fafb] p-1.5">{['attendance', 'people', ...(editable ? ['attention'] : []), 'history'].map((t) => <Link key={t} aria-current={t === tab ? 'page' : undefined} href={`/community/groups/${groupId}?tab=${t}&date=${date}`} className={`inline-flex min-h-11 shrink-0 items-center rounded-[10px] px-3.5 py-2.5 text-xs font-extrabold capitalize transition ${t === tab ? 'bg-[#00274c] text-white' : 'text-[#475467] hover:bg-white hover:text-[#15223a]'}`}>{t === 'attention' ? 'Needs Attention' : t}</Link>)}</nav>
    {tab === 'attention' && editable && <NeedsAttention groupId={groupId} members={members} meetings={meetings} attendance={attendance} contacts={contacts}/>}
    {tab === 'attendance' && <>
      <form className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-[#e4e7ec] bg-white p-4"><label htmlFor="meeting-date" className="w-full text-xs font-extrabold text-[#475467] sm:w-auto sm:mr-2">Meeting date</label><input id="meeting-date" type="date" name="date" defaultValue={date} min={year.starts_on} max={editable ? (ministryToday() < year.ends_on ? ministryToday() : year.ends_on) : year.ends_on} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#d0d5dd] bg-white px-3 py-2 text-base text-[#15223a] focus:outline-[#175cd3] sm:flex-none"/><button className="min-h-11 rounded-xl border border-[#d0d5dd] bg-white px-4 py-2 text-sm font-extrabold text-[#475467] hover:bg-[#f9fafb]">Open</button></form>
      {dateAllowed ? <AttendanceChecklist key={`${groupId}:${date}:${meeting?.version ?? 0}:${group.revision}`} groupId={groupId} meetingDate={date} people={people} version={meeting?.version ?? 0} revision={group.revision} editable={editable}/> : <p role="alert" className="rounded-full border border-[#fedf89] bg-[#fff8eb] px-4 py-3 text-sm font-bold text-[#b54708]">Choose a meeting date within the campaign, no later than today.</p>}
    </>}
    {tab === 'people' && <>
      {editable && <AddAttender groupId={groupId} date={ministryToday()}/>}
      {filter && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm"><p className="font-extrabold text-[#475467]">{filterLabel} · {filteredPeople.length}</p><Link className="inline-flex min-h-11 items-center font-bold text-[#175cd3]" href={`/community/groups/${groupId}?tab=people`}>Show all people</Link></div>}
      {!filteredPeople.length && <p className="rounded-xl border border-[#e4e7ec] bg-white p-6 text-sm text-[#667085]">{filter ? 'No people match this filter.' : 'Add your first attender to start a lasting roster.'}</p>}
      <div className="space-y-3">{filteredPeople.map((m) => {
        const active = members.some((p) => p.student_id === m.student_id && !p.ended_on)
        const contact = contacts.find((c) => c.student_id === m.student_id)
        const stats = attendanceSummary(m.student_id, meetings, attendance)
        return <article key={m.student_id} className={`${cardClass(contact?.gender_raw ?? null, contact?.status ?? '')} p-4 pl-5`}>
          <div aria-hidden="true" className={`absolute inset-y-0 left-0 w-[6px] ${stripeClass(contact?.gender_raw ?? null, contact?.status ?? '')}`} />
          <Link href={`/contacts/${contact?.id}?tab=community&from=${encodeURIComponent(`/community/groups/${groupId}?tab=people`)}`} className="break-words text-[19px] font-extrabold tracking-[-0.02em] text-[#15223a] hover:text-[#175cd3]">{m.students.display_name}</Link>
          <p className="mt-1 text-sm">{contact?.status === 'involved' ? 'Involved · ' : ''}{active ? (stats.count ? 'Attending' : 'New') : 'No longer attending'}</p>
          <p className="mt-1 text-xs text-[#667085]">{stats.count} meetings attended · Last attended {stats.last ?? '—'}</p>
          {editable && <MemberActions groupId={groupId} studentId={m.student_id} involved={contact?.status === 'involved'} active={active} date={ministryToday()}/>}
        </article>
      })}</div>
    </>}
    {tab === 'history' && <section className="space-y-3">{!meetings.length && <p>No attendance has been saved yet.</p>}{meetings.map((m) => {
      const entries = attendance.filter((a) => a.meeting_id === m.id)
      return <article key={m.id} className="overflow-hidden rounded-2xl border border-[#e4e7ec] bg-white">
        <Link href={`/community/groups/${groupId}?date=${m.meeting_date}`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm transition hover:bg-[#f9fafb]"><span className="font-extrabold text-[#15223a]">{m.meeting_date}</span><span className="text-[#667085]">{entries.filter((a) => a.is_present).length} of {entries.length} attended →</span></Link>
        {editable && <DeleteMeeting groupId={groupId} meetingId={m.id} meetingDate={m.meeting_date} version={m.version} revision={group.revision}/>}
      </article>
    })}</section>}
    {tab === 'settings' && editable && ['staff', 'admin'].includes(access.profile.role) && <GroupSettings campaignId={year.id} userId={access.user.id} group={group}/>}
  </main>
}
