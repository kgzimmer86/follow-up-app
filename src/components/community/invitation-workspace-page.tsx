import { SectionTabs } from './section-tabs'
import { redirect } from 'next/navigation'
import { getAppAccess } from '@/lib/supabase/access'
import { createClient } from '@/lib/supabase/server'
import { campaignEvents } from '@/lib/community-events-server'
import { LoadRecovery } from '@/components/follow-up/load-recovery'
import { InvitationWorkspace } from './invitation-workspace'

export async function InvitationWorkspacePage({ mine }: { mine: boolean }) {
  const access = await getAppAccess()
  if (access.status === 'unavailable') return <LoadRecovery/>
  if (!access.user || !access.profile?.is_active || access.profile.role === 'pending') redirect('/')
  const client = await createClient()
  const campaign = await client.from('follow_up_campaigns').select('id').eq('status', 'active').maybeSingle()
  if (campaign.error) throw new Error(campaign.error.message)
  const [areas, people, assignment, events] = await Promise.all([
    client.from('ministry_areas').select('id,name,parent_id,area_type').eq('is_active', true).order('name'),
    campaign.data ? client.rpc('community_invitation_recipients', { p_campaign: campaign.data.id }) : Promise.resolve({ data: [], error: null }),
    campaign.data ? client.from('profile_ministry_area_assignments').select('ministry_area_id').eq('profile_id', access.user.id).eq('campaign_id', campaign.data.id).eq('is_default', true).maybeSingle() : Promise.resolve({ data: null, error: null }),
    campaign.data ? campaignEvents(campaign.data.id) : Promise.resolve([]),
  ])
  for (const result of [areas, people, assignment]) if (result.error) throw new Error(result.error.message)
  const groups: { id: string; name: string }[] = []
  if (!mine && campaign.data) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from('community_groups').select('id,name').eq('campaign_id', campaign.data.id)
        .eq('is_active', true).order('name').order('id').range(offset, offset + 499)
      if (error) throw new Error(error.message)
      groups.push(...data)
      if (data.length < 500) break
    }
  }
  return <main className={`mx-auto ${!mine && ['staff', 'admin'].includes(access.profile.role) ? 'max-w-[1200px]' : 'max-w-[800px]'} px-[18px] py-6 md:px-7`}>
    <h2 className="text-2xl font-extrabold text-[#15223a]">Invitations</h2>
    <SectionTabs label="Invitation sections" tabs={[
      { href: '/community/invites', label: 'My Invitations', active: mine },
      { href: '/community/invites/assign', label: access.profile.role === 'student_leader' ? 'Claim Invitations' : 'Assign Invitations', active: !mine },
    ]}/>
    {!mine && <p className="mt-2 text-sm text-[#667085]">Invite students from anywhere in the campaign, including people outside group rosters.</p>}
    <InvitationWorkspace key={`${mine}:${campaign.data?.id ?? 'none'}`} mine={mine} userId={access.user.id} role={access.profile.role} events={events} people={people.data ?? []} areas={areas.data ?? []} defaultArea={assignment.data?.ministry_area_id ?? null} groups={groups}/>
  </main>
}
