import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { CommunityAttendance, CommunityContact, CommunityGroup, CommunityMeeting, CommunityMember } from '@/lib/community'

// Paginate history rather than silently truncating at Supabase's row cap.
export async function groupData(group: CommunityGroup) {
  const client = await createClient()
  const members: CommunityMember[] = []
  const meetings: CommunityMeeting[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('community_group_memberships').select('id,group_id,student_id,started_on,ended_on,students(display_name)').eq('group_id', group.id).order('id').range(offset, offset + 499)
    if (error) throw new Error(error.message)
    members.push(...data as unknown as CommunityMember[])
    if (data.length < 500) break
  }
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('community_group_meetings').select('id,group_id,meeting_date,version,saved_at').eq('group_id', group.id).order('meeting_date', { ascending: false }).range(offset, offset + 499)
    if (error) throw new Error(error.message)
    meetings.push(...data)
    if (data.length < 500) break
  }
  const attendance: CommunityAttendance[] = []
  for (let start = 0; start < meetings.length; start += 100) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from('community_group_attendance').select('meeting_id,student_id,is_present').in('meeting_id', meetings.slice(start, start + 100).map((m) => m.id)).order('meeting_id').order('student_id').range(offset, offset + 499)
      if (error) throw new Error(error.message)
      attendance.push(...data)
      if (data.length < 500) break
    }
  }
  const contacts: CommunityContact[] = []
  const students = [...new Set(members.map((m) => m.student_id))]
  for (let offset = 0; offset < students.length; offset += 100) {
    const { data, error } = await client.from('follow_up_contacts').select('id,student_id,status,gender_raw').eq('campaign_id', group.campaign_id).in('student_id', students.slice(offset, offset + 100))
    if (error) throw new Error(error.message)
    contacts.push(...data)
  }
  return { members, meetings, attendance, contacts }
}
