import { redirect } from 'next/navigation'
import { getAppAccess } from '@/lib/supabase/access'
import { createClient } from '@/lib/supabase/server'
import { selectCommunityCampaign } from '@/lib/campaign-state'
import { campaignEvents } from '@/lib/community-events-server'
import { groupData } from '@/lib/community-server'
import type { CommunityGroup } from '@/lib/community'
import { EventEditor } from '@/components/community/event-editor'
import { GroupEvents } from '@/components/community/group-events'
import { SectionTabs } from '@/components/community/section-tabs'
import { EventViewSelect } from '@/components/community/event-view-select'
import { LoadRecovery } from '@/components/follow-up/load-recovery'

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ campaign?: string; group?: string; event?: string; tab?: string }> }) {
  const access = await getAppAccess()
  if (access.status === 'unavailable') return <LoadRecovery/>
  if (!access.user || !access.profile?.is_active || access.profile.role === 'pending') redirect('/')
  const query = await searchParams
  const client = await createClient()
  const { data, error } = await client.from('follow_up_campaigns').select('id,label,status,starts_on,ends_on')
    .in('status', ['active', 'archived']).order('starts_on', { ascending: false })
  if (error) throw new Error(error.message)
  let campaignId = query.campaign
  if (!campaignId && query.group && /^[\da-f-]{36}$/i.test(query.group)) {
    const requested = await client.from('community_groups').select('campaign_id').eq('id', query.group).maybeSingle()
    if (requested.error) throw new Error(requested.error.message)
    campaignId = requested.data?.campaign_id
  }
  const campaign = selectCommunityCampaign(data ?? [], campaignId)
  const staff = ['staff', 'admin'].includes(access.profile.role)
  const manage = staff && query.tab === 'manage'
  const params = new URLSearchParams(campaign ? { campaign: campaign.id } : {})
  if (query.group) params.set('group', query.group)
  const groupHref = `/community/events?${params}`
  const groups: CommunityGroup[] = []
  if (campaign && !manage) {
    // Existing RLS keeps leaders within designated groups and current area scope.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from('community_groups').select('*').eq('campaign_id', campaign.id)
        .eq('is_active', true).order('name').order('id').range(offset, offset + 499)
      if (error) throw new Error(error.message)
      groups.push(...data as CommunityGroup[])
      if (data.length < 500) break
    }
  }
  const selected = query.group ? groups.find(g => g.id === query.group) : groups.length === 1 ? groups[0] : undefined
  const roster = selected ? await groupData(selected, false) : null
  const events = manage && campaign ? await campaignEvents(campaign.id) : []
  return <main className="mx-auto max-w-[800px] px-[18px] py-6 md:px-7">
    <h2 className="text-2xl font-extrabold text-[#15223a]">Events</h2>
    <p className="mt-2 text-sm text-[#667085]">{campaign?.label ?? 'There is no active campaign.'}{campaign?.status === 'archived' ? ' · Read-only history' : ''}</p>
    {staff && <SectionTabs label="Event sections" tabs={[
      { href: groupHref, label: 'Group Events', active: !manage },
      ...(staff ? [{ href: `${groupHref}&tab=manage`, label: 'Create / Manage Events', active: manage }] : []),
    ]}/>}
    {!manage && <div className={staff ? '' : 'mt-5'}>
      {groups.length > 1 && <div className="mb-5">
        <EventViewSelect label="Community group" value={selected?.id ?? ''} placeholder="Choose a group" options={groups.map(g => ({
          value: g.id, label: g.name,
          href: `/community/events?${new URLSearchParams({ campaign: g.campaign_id, group: g.id, ...(query.event ? { event: query.event } : {}) })}`,
        }))}/>
      </div>}
      {query.group && !selected && <p role="alert" className="mb-4 rounded-xl bg-[#fff8eb] p-3 text-sm text-[#b54708]">This group is unavailable in your current campaign or area. Choose an available group.</p>}
      {!groups.length && <p className="rounded-2xl border border-[#e4e7ec] bg-white p-5 text-sm text-[#667085]">No groups are available for your current assignment and area. You can still view and act on your invitations using Invitations in the navigation.</p>}
      {groups.length > 1 && !selected && !query.group && <p className="text-sm text-[#667085]">Choose a group to view its campaign events and student responses.</p>}
      {selected && roster && campaign && <GroupEvents groupId={selected.id} campaignId={campaign.id} members={roster.members} contacts={roster.contacts} editable={campaign.status === 'active'} eventId={query.event}/>}
    </div>}
    {manage && <>
      {campaign?.status === 'active' && <EventEditor campaignId={campaign.id} starts={campaign.starts_on} ends={campaign.ends_on}/>}
      <div className="mt-5 space-y-4">{events.map(event => <article key={event.id} className="rounded-[22px] border border-[#dbe8f8] bg-white p-5">
        <h3 className="text-xl font-extrabold text-[#15223a]">{event.name}</h3>
        <p className="mt-2 text-sm text-[#667085]">{event.event_date}{event.location ? ` · ${event.location}` : ''}</p>
        <p className="mt-2 text-xs font-bold text-[#475467]">{event.is_open ? 'Open for invitations' : 'Invitation updates closed'}</p>
        {event.details && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-[#475467]">{event.details}</p>}
        {campaign?.status === 'active' && <EventEditor key={event.revision} campaignId={campaign.id} starts={campaign.starts_on} ends={campaign.ends_on} event={event}/>}
      </article>)}</div>
      {!events.length && <p className="mt-5 text-sm text-[#667085]">No campaign events have been created yet.</p>}
    </>}
  </main>
}
