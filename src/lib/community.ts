export type CommunityArea = { id: string; name: string; parent_id: string | null }
export type CommunityGroup = { id: string; campaign_id: string; ministry_area_id: string; name: string; meeting_day: string | null; is_active: boolean; revision: number }
export type CommunityMember = { id: string; group_id: string; student_id: string; started_on: string; ended_on: string | null; students: { display_name: string } }
export type CommunityMeeting = { id: string; group_id: string; meeting_date: string; version: number; saved_at: string }
export type CommunityAttendance = { meeting_id: string; student_id: string; is_present: boolean }
export type CommunityContact = { id: string; student_id: string; status: string; gender_raw?: string | null }
export type CommunityCampaign = { id: string; label: string; status: string; starts_on: string; ends_on: string }
export function ministryToday() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function validMeetingDate(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : fallback
}
export function withinArea(area: string, assigned: string | null, areas: CommunityArea[]) {
  if (!assigned) return true
  const visited = new Set<string>()
  let current: string | null = area
  while (current && !visited.has(current)) {
    if (current === assigned) return true
    visited.add(current)
    current = areas.find((a) => a.id === current)?.parent_id ?? null
  }
  return false
}
export function attendanceRoster(members: CommunityMember[], meetings: CommunityMeeting[], attendance: CommunityAttendance[], date: string) {
  const meeting = meetings.find((m) => m.meeting_date === date)
  const entries = attendance.filter((a) => a.meeting_id === meeting?.id)
  const ids = new Set([...members.filter((m) => m.started_on <= date && (!m.ended_on || m.ended_on >= date)).map((m) => m.student_id), ...entries.map((a) => a.student_id)])
  return [...ids].map((id) => ({ student_id: id, display_name: members.find((m) => m.student_id === id)?.students.display_name ?? 'Student', present: entries.some((a) => a.student_id === id && a.is_present) })).sort((a, b) => a.display_name.localeCompare(b.display_name))
}
export function attendanceSummary(studentId: string, meetings: CommunityMeeting[], attendance: CommunityAttendance[]) {
  const dates = meetings.filter((m) => attendance.some((a) => a.meeting_id === m.id && a.student_id === studentId && a.is_present)).map((m) => m.meeting_date).sort()
  return { count: dates.length, first: dates[0] ?? null, last: dates.at(-1) ?? null }
}
