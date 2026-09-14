import type { CommunityAttendance, CommunityMeeting, CommunityMember } from './community'

export function communityAttention(members: CommunityMember[], meetings: CommunityMeeting[], attendance: CommunityAttendance[]) {
  const active = new Map<string, CommunityMember>()
  for (const member of members) {
    if (member.ended_on === null && (!active.has(member.student_id) || member.started_on < active.get(member.student_id)!.started_on)) active.set(member.student_id, member)
  }
  const sorted = [...meetings].sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))
  const records = new Map(attendance.map((a) => [`${a.meeting_id}:${a.student_id}`, a.is_present]))
  return [...active.values()].flatMap((member) => {
    const eligible = sorted.filter((m) => m.meeting_date >= member.started_on)
    const recent = eligible.slice(0, 5)
    if (recent.length < 2 || !recent.slice(0, 2).every((m) => records.get(`${m.id}:${member.student_id}`) === false)) return []
    const recorded = recent.filter((m) => records.has(`${m.id}:${member.student_id}`))
    const lastAttended = sorted.find((m) => records.get(`${m.id}:${member.student_id}`) === true)?.meeting_date ?? null
    return [{ studentId: member.student_id, name: member.students.display_name,
      attended: recorded.filter((m) => records.get(`${m.id}:${member.student_id}`)).length,
      recorded: recorded.length, missing: recent.length - recorded.length, lastAttended }]
  }).sort((a, b) => a.name.localeCompare(b.name))
}
