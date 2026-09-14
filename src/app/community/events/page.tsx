import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAppAccess } from '@/lib/supabase/access'
import { createClient } from '@/lib/supabase/server'
import { selectCommunityCampaign } from '@/lib/campaign-state'
import { campaignEvents } from '@/lib/community-events-server'
import { EventEditor } from '@/components/community/event-editor'
import { LoadRecovery } from '@/components/follow-up/load-recovery'

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const access = await getAppAccess()
  if (access.status === 'unavailable') return <LoadRecovery/>
  if (!access.user || !access.profile?.is_active || access.profile.role === 'pending') redirect('/')
  const client = await createClient()
  const { data, error } = await client.from('follow_up_campaigns').select('id,label,status,starts_on,ends_on')
    .in('status', ['active', 'archived']).order('starts_on', { ascending: false })
  if (error) throw new Error(error.message)
  const campaign = selectCommunityCampaign(data ?? [], (await searchParams).campaign)
  if (['student_leader', 'discipler'].includes(access.profile.role)) {
    // RLS restricts this list to designated groups within the leader's current scope.
    const groups: { id: string; name: string }[] = []
    if (campaign) {
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client.from('community_groups').select('id,name')
          .eq('campaign_id', campaign.id).eq('is_active', true).order('name').order('id').range(offset, offset + 499)
        if (error) throw new Error(error.message)
        groups.push(...data)
        if (data.length < 500) break
      }
    }
    if (groups.length === 1) redirect(`/community/groups/${groups[0].id}?tab=events`)
    return <main className="mx-auto max-w-[800px] px-[18px] py-6 md:px-7">
      <h2 className="text-2xl font-extrabold text-[#15223a]">Event invitations</h2>
      <p className="mt-2 text-sm text-[#667085]">{groups.length ? 'Choose a group to track invitations for its students.' : 'No groups are available for your current leader assignment and area.'}</p>
      <div className="mt-5 space-y-3">{groups.map((group) => <Link key={group.id} href={`/community/groups/${group.id}?tab=events`} className="block rounded-2xl border border-[#dbe8f8] bg-white p-5 font-extrabold text-[#15223a] hover:bg-[#f9fafb]">{group.name} →</Link>)}</div>
      <Link href={campaign ? `/community?campaign=${campaign.id}` : '/community'} className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-[#475467]">← Back to groups</Link>
    </main>
  }
  const events = campaign ? await campaignEvents(campaign.id) : []
  const manage = campaign?.status === 'active' && ['staff', 'admin'].includes(access.profile.role)
  return <main className="mx-auto max-w-[800px] px-[18px] py-6 md:px-7">
    <Link href={campaign ? `/community?campaign=${campaign.id}` : '/community'} className="inline-flex min-h-11 items-center text-sm font-bold text-[#475467]">← Back to Community</Link>
    <h2 className="mt-3 text-2xl font-extrabold text-[#15223a]">Campaign events</h2>
    <p className="mt-2 text-sm text-[#667085]">{campaign?.label ?? 'There is no active campaign.'}{campaign?.status === 'archived' ? ' · Read-only history' : ''}</p>
    <p className="mt-2 text-sm text-[#667085]">Shared events for this academic year. Open a group’s Events tab to track invitations for its students.</p>
    {manage && campaign && <EventEditor campaignId={campaign.id} starts={campaign.starts_on} ends={campaign.ends_on}/>}
    {campaign?.status === 'active' && !manage && <p className="mt-3 rounded-2xl border border-[#e4e7ec] bg-white p-4 text-sm text-[#667085]">Staff and admins create campaign events. As a group leader, you can track students’ responses from your group’s Events tab once an event is created.</p>}
    <div className="mt-5 space-y-4">{events.map((event) => <article key={event.id} className="rounded-[22px] border border-[#dbe8f8] bg-white p-5">
      <h3 className="break-words text-xl font-extrabold text-[#15223a]">{event.name}</h3>
      <p className="mt-2 text-sm text-[#667085]">{event.event_date}{event.location ? ` · ${event.location}` : ''}</p>
      <p className="mt-2 text-xs font-bold text-[#475467]">{event.is_open ? 'Open for invitations' : 'Invitation updates closed'}</p>
      {event.details && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-[#475467]">{event.details}</p>}
      {manage && campaign && <EventEditor key={event.revision} campaignId={campaign.id} starts={campaign.starts_on} ends={campaign.ends_on} event={event}/>}
    </article>)}</div>
    {campaign && !events.length && <p className="mt-5 rounded-2xl border border-dashed border-[#d0d5dd] p-5 text-sm text-[#667085]">No campaign events have been created yet.</p>}
  </main>
}
