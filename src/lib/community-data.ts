import type { SupabaseClient } from '@supabase/supabase-js'
import type { CommunityAttendance, CommunityContact, CommunityGroup, CommunityMeeting, CommunityMember } from './community'

export type GroupDataOptions = {
  studentId?: string
  members?: boolean
  meetings?: boolean
  attendance?: boolean
  contacts?: boolean
  attention?: boolean
  attendanceDate?: (meetings: CommunityMeeting[]) => string
}

// Every history read remains paginated; options reduce scope, not completeness.
// The caller supplies its authenticated client, so all existing RLS still applies.
export async function loadGroupData(client: SupabaseClient, group: CommunityGroup, options: GroupDataOptions = {}) {
  async function loadMembers() {
    const rows: CommunityMember[] = []
    if (options.members === false) return rows
    for (let offset = 0; ; offset += 500) {
      let query = client.from('community_group_memberships').select('id,group_id,student_id,started_on,ended_on,students(display_name)').eq('group_id', group.id)
      if (options.studentId) query = query.eq('student_id', options.studentId)
      const { data, error } = await query.order('id').range(offset, offset + 499)
      if (error) throw new Error(error.message)
      rows.push(...data as unknown as CommunityMember[])
      if (data.length < 500) return rows
    }
  }
  async function loadMeetings() {
    const rows: CommunityMeeting[] = []
    if (options.meetings === false) return rows
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from('community_group_meetings').select('id,group_id,meeting_date,version,saved_at').eq('group_id', group.id).order('meeting_date', { ascending: false }).range(offset, offset + 499)
      if (error) throw new Error(error.message)
      rows.push(...data)
      if (data.length < 500) return rows
    }
  }
  async function loadAttendance(meetings: CommunityMeeting[]) {
    const rows: CommunityAttendance[] = []
    if (options.attendance === false) return rows
    const date = options.attendanceDate?.(meetings)
    const selected = date ? meetings.filter(m => m.meeting_date === date) : meetings
    for (let start = 0; start < selected.length; start += 100) {
      for (let offset = 0; ; offset += 500) {
        let query = client.from('community_group_attendance').select('meeting_id,student_id,is_present').in('meeting_id', selected.slice(start, start + 100).map(m => m.id))
        if (options.studentId) query = query.eq('student_id', options.studentId)
        const { data, error } = await query.order('meeting_id').order('student_id').range(offset, offset + 499)
        if (error) throw new Error(error.message)
        rows.push(...data)
        if (data.length < 500) break
      }
    }
    return rows
  }
  async function loadContacts(members: CommunityMember[]) {
    const rows: CommunityContact[] = []
    if (options.contacts === false) return rows
    const students = [...new Set(members.map(m => m.student_id))]
    for (let offset = 0; offset < students.length; offset += 100) {
      const { data, error } = await client.from('follow_up_contacts').select('id,student_id,status,gender_raw').eq('campaign_id', group.campaign_id).in('student_id', students.slice(offset, offset + 100))
      if (error) throw new Error(error.message)
      rows.push(...data)
    }
    return rows
  }
  async function loadAttention() {
    const ids: string[] = []
    if (options.attention === false) return ids
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.rpc('community_group_checkin_attention', { p_group: group.id }).order('student_id').range(offset, offset + 499)
      if (error) throw new Error(error.message)
      ids.push(...data.map((row: { student_id: string }) => row.student_id))
      if (data.length < 500) return ids
    }
  }

  const membersRead = loadMembers()
  const meetingsRead = loadMeetings()
  const [members, meetings, attendance, contacts, attentionIds] = await Promise.all([
    membersRead, meetingsRead, meetingsRead.then(loadAttendance),
    membersRead.then(loadContacts), loadAttention(),
  ])
  return { members, meetings, attendance, contacts, attentionIds }
}
