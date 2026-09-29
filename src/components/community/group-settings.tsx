import { createClient } from '@/lib/supabase/server'
import { GroupEditor } from './group-controls'
import type { CommunityGroup } from '@/lib/community'
import { GroupLeaderManagement } from './group-leader-management'

export async function GroupManagement({ group, userId }: { group: CommunityGroup; userId: string }) {
  const client = await createClient()
  const [profiles, assignments, selected, areas] = await Promise.all([
    client.from('profiles').select('id,display_name,email').eq('is_active', true).in('role', ['student_leader', 'discipler', 'staff', 'admin']),
    client.from('profile_ministry_area_assignments').select('profile_id,ministry_area_id').eq('campaign_id', group.campaign_id).eq('is_default', true),
    client.from('community_group_leaders').select('profile_id').eq('group_id', group.id),
    client.from('ministry_areas').select('id,name,parent_id'),
  ])
  for (const result of [profiles, assignments, selected, areas]) if (result.error) throw new Error(result.error.message)
  const ownArea = assignments.data?.find((assignment) => assignment.profile_id === userId)?.ministry_area_id
  const areaMap = new Map((areas.data ?? []).map((area) => [area.id, area]))
  const campusOf = (id: string | undefined) => {
    let area = id ? areaMap.get(id) : undefined
    while (area?.parent_id) area = areaMap.get(area.parent_id)
    return area?.id ?? null
  }
  const ownCampus = campusOf(ownArea)
  const leaders = (profiles.data ?? []).flatMap((profile) => {
    const assignment = assignments.data?.find((entry) => entry.profile_id === profile.id)
    if (!assignment) return []
    return [{ id: profile.id, name: profile.display_name || profile.email || 'Leader', area: areaMap.get(assignment.ministry_area_id)?.name ?? 'Campus area', campus: campusOf(assignment.ministry_area_id), selected: Boolean(selected.data?.some((entry) => entry.profile_id === profile.id)) }]
  }).sort((a, b) => Number(b.campus === ownCampus) - Number(a.campus === ownCampus) || a.name.localeCompare(b.name))
  return <GroupLeaderManagement groupId={group.id} revision={group.revision} leaders={leaders}/>
}

export async function GroupSettings({ campaignId, userId, group }: { campaignId: string; userId: string; group?: CommunityGroup }) {
  const client = await createClient()
  const [areas, profiles, assignments, selected] = await Promise.all([
    client.from('ministry_areas').select('id,name,parent_id,area_type').eq('is_active', true).order('name'),
    client.from('profiles').select('id,display_name,email').eq('is_active', true).in('role', ['student_leader', 'discipler', 'staff', 'admin']).order('display_name'),
    client.from('profile_ministry_area_assignments').select('profile_id,ministry_area_id').eq('campaign_id', campaignId).eq('is_default', true),
    group ? client.from('community_group_leaders').select('profile_id').eq('group_id', group.id) : Promise.resolve({ data: [], error: null }),
  ])
  for (const result of [areas, profiles, assignments, selected]) if (result.error) throw new Error(result.error.message)
  return <GroupEditor group={group} areas={areas.data ?? []} assignedArea={assignments.data?.find((a) => a.profile_id === userId)?.ministry_area_id ?? null} leaders={(profiles.data ?? []).map((p) => ({ id: p.id, display_name: p.display_name || p.email || 'Leader', area: assignments.data?.find((a) => a.profile_id === p.id)?.ministry_area_id ?? null, selected: Boolean(selected.data?.some((s) => s.profile_id === p.id)) }))}/>
}
