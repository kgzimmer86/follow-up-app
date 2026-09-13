import type { CommunityAttendance, CommunityContact, CommunityMember } from './community'

export function communityContactIds(segment: string, members: CommunityMember[], attendance: CommunityAttendance[], contacts: CommunityContact[], latestMeetingId?: string) {
  const active = new Set(members.filter((m) => !m.ended_on).map((m) => m.student_id))
  const present = new Set(attendance.filter((a) => a.is_present && (segment !== 'attended' || a.meeting_id === latestMeetingId)).map((a) => a.student_id))
  if (!['involved', 'roster', 'attended', 'ever'].includes(segment)) return []
  return [...new Set(contacts.filter((c) => segment === 'involved' ? active.has(c.student_id) && c.status === 'involved' : segment === 'roster' ? active.has(c.student_id) : present.has(c.student_id)).map((c) => c.id))]
}

type ResultPage<T> = { campaign_id: string; total_count: number; rows: T[] }

// Apply the group scope only to rows returned by the existing authorized RPC.
export async function scopedContactRows<T extends { id: string }>(first: ResultPage<T>, campaignId: string, contactIds: string[], pageSize: number, loadPage: (page: number) => Promise<ResultPage<T>>) {
  const allowed = new Set(contactIds)
  const matches = new Map<string, T>()
  const collect = (batch: ResultPage<T>) => {
    if (batch.campaign_id !== campaignId) throw new Error('The active campaign changed. Return to Community and reopen this list.')
    for (const row of batch.rows) if (allowed.has(row.id)) matches.set(row.id, row)
  }
  collect(first)
  // Empty group scopes never need to scan unrelated contact pages.
  for (let page = 2; matches.size < allowed.size && page <= Math.ceil(first.total_count / pageSize); page++) collect(await loadPage(page))
  return [...matches.values()]
}
