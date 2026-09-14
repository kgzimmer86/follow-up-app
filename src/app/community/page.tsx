import Link from 'next/link'
import { selectCommunityCampaign } from '@/lib/campaign-state'
import { redirect } from 'next/navigation'
import { getAppAccess } from '@/lib/supabase/access'
import { createClient } from '@/lib/supabase/server'
import { LoadRecovery } from '@/components/follow-up/load-recovery'
import { GroupSettings } from '@/components/community/group-settings'
import type { CommunityGroup } from '@/lib/community'

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const access = await getAppAccess()
  if (access.status === 'unavailable') return <LoadRecovery/>
  if (!access.user || !access.profile?.is_active || access.profile.role === 'pending') redirect('/')
  const client = await createClient()
  const { data: campaigns, error: campaignError } = await client.from('follow_up_campaigns').select('id,label,status').in('status', ['active', 'archived']).order('starts_on', { ascending: false })
  if (campaignError) throw new Error(campaignError.message)
  const query = await searchParams
  const campaign = selectCommunityCampaign(campaigns ?? [], query.campaign)
  if (!campaign) return <main className="p-6"><p>There is no active campaign. An admin can activate one in Manage.</p>{['staff', 'admin'].includes(access.profile.role) && <Link href="/community/history" className="mt-3 inline-flex min-h-11 items-center font-bold text-[#175cd3]">Previous years</Link>}</main>
  const { data, error } = await client.from('community_groups').select('id,campaign_id,name,ministry_area_id,meeting_day,is_active,revision,ministry_areas(name),community_group_leaders(profiles(display_name))').eq('campaign_id', campaign.id).order('name')
  if (error?.code === '42P01' || error?.code === 'PGRST205') return <main className="p-6">Community is being prepared. It is not available yet.</main>
  if (error) throw new Error(error.message)
  const groups = data as unknown as (CommunityGroup & { ministry_areas: { name: string }; community_group_leaders: { profiles: { display_name: string } }[] })[]
  return <main className="mx-auto max-w-[980px] px-[18px] py-6 md:px-7">
    <section aria-labelledby="community-welcome" className="mb-5 rounded-[28px] border border-[#f4e8a6] bg-[linear-gradient(135deg,#fff9d8,#ffffff_62%)] p-5 shadow-[0_8px_28px_rgba(19,33,68,0.08)] md:p-6">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#175cd3]">Growing together in Christ</p>
      <h2 id="community-welcome" className="mt-1.5 max-w-[680px] text-[28px] font-extrabold leading-[1.1] tracking-[-0.04em] text-[#15223a] md:text-[30px]">Help your community take its next step.</h2>
      <p className="mt-2 max-w-[680px] text-sm leading-[1.45] text-[#667085] md:text-base">Gather together, encourage one another, and help each person grow in Christ.</p>
      <blockquote className="mt-4 max-w-[680px] font-serif text-[15px] italic leading-relaxed text-[#6f5f1e]">
        <p>“And let us consider how to stir up one another to love and good works…”</p>
        <cite className="mt-1 block font-sans text-[11px] font-semibold not-italic"><a href="https://www.esv.org/Hebrews+10:24-25/" target="_blank" rel="noreferrer" className="rounded hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175cd3]">Hebrews 10:24 · ESV</a></cite>
      </blockquote>
    </section>
    <section aria-labelledby="community-groups-heading">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="community-groups-heading" className="text-2xl font-extrabold tracking-tight text-[#15223a] md:text-3xl">Community Groups</h2>
        {['staff', 'admin'].includes(access.profile.role) && <Link href="/community/history" className="inline-flex min-h-11 items-center rounded text-sm font-bold text-[#175cd3] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175cd3]">Previous years</Link>}
      </div>
      {campaign.status === 'archived' && <p className="mt-2 text-sm font-semibold text-[#667085]">Archived — attendance history is read-only.</p>}
      <p className="mt-1 text-sm text-[#667085]">{campaign.label}</p>
      {campaign.status === 'active' && ['staff', 'admin'].includes(access.profile.role) && <div className="mt-3 [&>div]:my-0"><GroupSettings campaignId={campaign.id} userId={access.user.id}/></div>}
    </section>
    <div className="mt-5 grid gap-4 md:grid-cols-2">{groups.map((g) => <article data-feedback-card key={g.id} className="relative min-w-0 rounded-[22px] border border-[#dbe8f8] bg-white p-5 shadow-sm transition hover:border-[#b2ccff] hover:bg-[#fbfdff]">
      <p className="text-xs font-bold text-[#175cd3]">{g.ministry_areas?.name}</p><h3 className="mt-1 break-words text-xl font-extrabold"><Link href={`/community/groups/${g.id}`} className="after:absolute after:inset-0 after:rounded-[22px] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[#175cd3]">{g.name}</Link></h3>
      <p className="mt-2 text-sm text-[#667085]">Leaders: {g.community_group_leaders.map((l) => l.profiles?.display_name).filter(Boolean).join(' + ') || 'Not assigned'}</p>
      <GroupCounts groupId={g.id} campaignId={campaign.id} active={campaign.status === 'active' && g.is_active}/>
    </article>)}</div>
    {!groups.length && <p className="mt-6 rounded-2xl border border-dashed border-[#d0d5dd] bg-white p-8 text-center text-sm text-[#667085]">No groups are available for your area and leader assignments in this campaign.</p>}
  </main>
}

async function GroupCounts({ groupId, campaignId, active }: { groupId: string; campaignId: string; active: boolean }) {
  const client = await createClient()
  const latest = await client.from('community_group_meetings').select('id,group_id,meeting_date,version,saved_at').eq('group_id', groupId).order('meeting_date', { ascending: false }).limit(5)
  if (latest.error) throw new Error(latest.error.message)
  // Count shared campaign status only for people currently on this group's roster.
  const studentIds = new Set<string>()
  for (let offset = 0; ; offset += 500) {
    const result = await client.from('community_group_memberships').select('id,group_id,student_id,started_on,ended_on').eq('group_id', groupId).is('ended_on', null).order('id').range(offset, offset + 499)
    if (result.error) throw new Error(result.error.message)
    result.data.forEach((member) => studentIds.add(member.student_id))
    if (result.data.length < 500) break
  }
  const ids = [...studentIds]
  let involved = 0
  for (let offset = 0; offset < ids.length; offset += 100) {
    const result = await client.from('follow_up_contacts').select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId).eq('status', 'involved').in('student_id', ids.slice(offset, offset + 100))
    if (result.error) throw new Error(result.error.message)
    involved += result.count ?? 0
  }
  const meeting = latest.data[0]
  const attention = active ? await client.rpc('community_group_checkin_attention', { p_group: groupId }, { count: 'exact', head: true }) : { count: 0, error: null }
  if (attention.error) throw new Error(attention.error.message)
  const needsAttention = attention.count ?? 0
  let attended = 0
  if (meeting) {
    const result = await client.from('community_group_attendance').select('student_id', { count: 'exact', head: true }).eq('meeting_id', meeting.id).eq('is_present', true)
    if (result.error) throw new Error(result.error.message)
    attended = result.count ?? 0
  }
  // Count each person once across all saved meetings, including former members.
  const everAttended = new Set<string>()
  for (let offset = 0; ; offset += 500) {
    const result = await client.from('community_group_attendance')
      .select('student_id,community_group_meetings!inner(group_id)')
      .eq('community_group_meetings.group_id', groupId)
      .eq('is_present', true)
      .order('meeting_id').order('student_id').range(offset, offset + 499)
    if (result.error) throw new Error(result.error.message)
    result.data.forEach((entry) => everAttended.add(entry.student_id))
    if (result.data.length < 500) break
  }
  const stats = [
    { key: 'involved', label: 'Involved', count: involved, tone: 'border-[#abefc6] bg-[#ecfdf3] text-[#027a48]' },
    { key: 'attended', label: 'Last attended', count: meeting ? attended : '—', tone: 'border-[#b2ccff] bg-[#eef4ff] text-[#3538cd]' },
    { key: 'ever', label: 'Ever attended', count: everAttended.size, tone: 'border-[#d0d5dd] bg-[#f2f4f7] text-[#475467]' },
    { key: 'attention', label: 'Needs Attention', count: active ? needsAttention : '—', tone: 'border-[#fedf89] bg-[#fff8eb] text-[#b54708]' },
  ]
  return <div className="mt-4">
    <div className="grid grid-cols-2 gap-2">{stats.map((stat) => {
      const content = <><span className="text-[11px] font-extrabold leading-4">{stat.label}</span><strong className="mt-1 text-2xl font-extrabold leading-8">{stat.count}</strong></>
      const style = `flex min-h-20 min-w-0 flex-col items-center justify-center rounded-2xl border px-3 py-3 text-center ${stat.tone}`
      return active && (stat.key !== 'attended' || meeting)
        ? <Link key={stat.key} href={stat.key === 'attention' ? `/community/groups/${groupId}?tab=attention` : `/community/groups/${groupId}/contacts/${stat.key}`} className={`relative z-10 ${style} transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#175cd3]`}>{content}</Link>
        : <div key={stat.key} className={style}>{content}</div>
    })}</div>
    <p className="mt-3 text-xs leading-5 text-[#667085]">{meeting ? `Last meeting: ${meeting.meeting_date}` : 'No attendance recorded yet'}</p>
  </div>
}
