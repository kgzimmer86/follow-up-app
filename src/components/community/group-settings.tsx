import { createClient } from '@/lib/supabase/server'
import { GroupEditor } from './group-controls'
import type { CommunityGroup } from '@/lib/community'

export async function GroupSettings({ campaignId, userId, group }: { campaignId: string; userId: string; group?: CommunityGroup }) {
  const client = await createClient()
  const [areas, profiles, assignments, selected] = await Promise.all([
    client.from('ministry_areas').select('id,name,parent_id').eq('is_active', true).order('sort_order'),
    client.from('profiles').select('id,display_name,email').eq('is_active', true).in('role', ['student_leader', 'discipler', 'staff', 'admin']).order('display_name'),
    client.from('profile_ministry_area_assignments').select('profile_id,ministry_area_id').eq('campaign_id', campaignId).eq('is_default', true),
    group ? client.from('community_group_leaders').select('profile_id').eq('group_id', group.id) : Promise.resolve({ data: [], error: null }),
  ])
  for (const result of [areas, profiles, assignments, selected]) if (result.error) throw new Error(result.error.message)
  return <GroupEditor group={group} areas={areas.data ?? []} assignedArea={assignments.data?.find((a) => a.profile_id === userId)?.ministry_area_id ?? null} leaders={(profiles.data ?? []).map((p) => ({ id: p.id, display_name: p.display_name || p.email || 'Leader', area: assignments.data?.find((a) => a.profile_id === p.id)?.ministry_area_id ?? null, selected: Boolean(selected.data?.some((s) => s.profile_id === p.id)) }))}/>
}
