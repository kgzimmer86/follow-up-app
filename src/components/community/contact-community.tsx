import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { groupData } from '@/lib/community-server'
import { attendanceSummary, ministryToday, type CommunityGroup } from '@/lib/community'
import { MemberActions } from './group-controls'

export async function ContactCommunity({ studentId, campaignId, status }: { studentId: string; campaignId: string; status: string }) {
  const client = await createClient()
  const { data: links, error } = await client.from('community_group_memberships').select('group_id').eq('student_id', studentId)
  if (error?.code === '42P01' || error?.code === 'PGRST205') return <p>Community is being prepared.</p>
  if (error) throw new Error(error.message)
  const ids = [...new Set(links.map((m) => m.group_id))]
  if (!ids.length) return <p className="rounded-2xl border border-[#e4e7ec] bg-white p-5">No Community Group memberships are visible to you for this student.</p>
  const { data: groups, error: groupError } = await client.from('community_groups').select('*').in('id', ids).eq('campaign_id', campaignId).order('name')
  if (groupError) throw new Error(groupError.message)
  const { data: campaign, error: campaignError } = await client.from('follow_up_campaigns').select('status').eq('id', campaignId).single()
  if (campaignError) throw new Error(campaignError.message)
  return <section className="space-y-4"><p className="text-sm font-bold">Ministry status: {status.replaceAll('_', ' ')}</p>
    {!groups.length && <p>No visible groups in this campaign.</p>}
    {await Promise.all((groups as CommunityGroup[]).map(async (g) => {
      const { members, meetings, attendance } = await groupData(g)
      const periods = members.filter((m) => m.student_id === studentId)
      const active = periods.some((p) => !p.ended_on)
      const stats = attendanceSummary(studentId, meetings, attendance)
      return <article key={g.id} className="rounded-2xl border border-[#e4e7ec] bg-white p-5"><Link href={`/community/groups/${g.id}?tab=people`} className="text-lg font-extrabold text-[#175cd3]">{g.name}</Link>
        <p className="mt-2 text-sm">{active ? 'On roster' : 'No longer attending'} · {stats.count} meetings attended</p>
        <p className="mt-1 text-xs text-[#667085]">First attended {stats.first ?? '—'} · Last attended {stats.last ?? '—'}</p>
        {campaign.status === 'active' && g.is_active && <MemberActions groupId={g.id} studentId={studentId} involved={status === 'involved'} active={active} date={ministryToday()}/>}
        <details className="mt-4 text-sm"><summary data-click-feedback className="cursor-pointer font-bold">Membership & attendance history</summary>
          {periods.sort((a,b) => a.started_on.localeCompare(b.started_on)).map((p) => <p key={p.id} className="mt-2 text-xs">On roster: {p.started_on} – {p.ended_on ?? 'present'}</p>)}
          {meetings.filter((m) => attendance.some((a) => a.meeting_id === m.id && a.student_id === studentId)).map((m) => <div key={m.id} className="mt-2 flex justify-between border-t pt-2"><span>{m.meeting_date}</span><span>{attendance.find((a) => a.meeting_id === m.id && a.student_id === studentId)?.is_present ? 'Present' : 'Absent'}</span></div>)}
        </details>
      </article>
    }))}
  </section>
}
