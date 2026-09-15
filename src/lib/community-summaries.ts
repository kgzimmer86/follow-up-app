import type { SupabaseClient } from '@supabase/supabase-js'
import type { CommunityGroup } from './community'

export type GroupSummary = {
  group_id: string
  latest_meeting_date: string | null
  involved: number
  attended: number
  ever_attended: number
  needs_attention: number
}

export async function loadGroupSummaries(client: SupabaseClient, groups: CommunityGroup[], campaignActive: boolean) {
  const summaries = new Map<string, GroupSummary>()
  for (let offset = 0; offset < groups.length; offset += 100) {
    const batch = groups.slice(offset, offset + 100)
    const { data, error } = await client.rpc('get_community_group_summaries', { p_group_ids: batch.map(g => g.id) })
    if (error?.code === 'PGRST202') {
      // The product owner installs SQL manually. Preserve the original reads
      // until the new reader exists; do not mask permission or network errors.
      const legacy = await Promise.all(batch.map(g => legacyGroupSummary(client, g.id, g.campaign_id, campaignActive && g.is_active)))
      for (const summary of legacy) summaries.set(summary.group_id, summary)
    } else {
      if (error) throw new Error(error.message)
      for (const summary of data as GroupSummary[]) summaries.set(summary.group_id, summary)
      if (batch.some(g => !summaries.has(g.id))) throw new Error('Could not load all Community Group summaries. Please retry.')
    }
  }
  return summaries
}

async function legacyGroupSummary(client: SupabaseClient, groupId: string, campaignId: string, active: boolean): Promise<GroupSummary> {
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
  return { group_id: groupId, latest_meeting_date: meeting?.meeting_date ?? null,
    involved, attended, ever_attended: everAttended.size, needs_attention: needsAttention }
}
