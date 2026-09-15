import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGroupData } from './community-data.ts'
import { attendanceRoster, attendanceSummary } from './community.ts'

const group = { id: 'group', campaign_id: 'campaign' }
const members = Array.from({ length: 125 }, (_, i) => ({ id: `member-${i}`, group_id: group.id, student_id: `student-${i}`, started_on: '2026-01-01', ended_on: i === 0 ? '2026-01-10' : null, students: { display_name: `Person ${i}` } }))
members.push({ ...members[0], id: 'rejoined', started_on: '2026-01-15', ended_on: null })
const meetings = Array.from({ length: 20 }, (_, i) => ({ id: `meeting-${i}`, group_id: group.id, meeting_date: `2026-01-${String(20 - i).padStart(2, '0')}`, version: i + 1 }))
const attendance = meetings.flatMap((m, i) => members.slice(0, 125).filter((_, j) => (i + j) % 7 !== 0).map((person, j) => ({ meeting_id: m.id, student_id: person.student_id, is_present: (i + j) % 3 !== 0 })))
const contacts = members.slice(0, 125).map(m => ({ id: m.student_id, student_id: m.student_id, campaign_id: 'campaign', status: 'involved' }))
const tables = { community_group_memberships: members, community_group_meetings: meetings, community_group_attendance: attendance, follow_up_contacts: contacts, community_group_checkin_attention: [{ student_id: 'student-2' }] }

function clientMock({ gate, fail } = {}) {
  const calls = []
  function query(table) {
    let rows = tables[table], start = 0, end = 499
    const builder = {
      select() { return this }, order() { return this },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return this },
      in(key, values) { rows = rows.filter(row => values.includes(row[key])); return this },
      range(a, b) { start = a; end = b; return this },
      then(resolve, reject) {
        const data = rows.slice(start, end + 1)
        calls.push({ table, rows: data.length })
        return Promise.resolve(gate).then(() => table === fail ? { data: null, error: { message: 'read failed' } } : { data, error: null }).then(resolve, reject)
      },
    }
    return builder
  }
  return { calls, client: { from: query, rpc: query } }
}

test('full group history remains complete beyond the row cap and preserves roster/summary results', async () => {
  const { client, calls } = clientMock()
  const result = await loadGroupData(client, group)
  assert.deepEqual(result.members, members)
  assert.deepEqual(result.meetings, meetings)
  assert.deepEqual(result.attendance, attendance)
  assert.deepEqual(result.contacts, contacts)
  assert.deepEqual(result.attentionIds, ['student-2'])
  assert(calls.filter(c => c.table === 'community_group_attendance').length > 1)
  for (const date of ['2026-01-05', '2026-01-12', '2026-01-19', '2026-02-01']) {
    assert.deepEqual(attendanceRoster(result.members, result.meetings, result.attendance, date), attendanceRoster(members, meetings, attendance, date))
  }
})

test('single-student reads preserve rejoining periods, absence records and full personal history', async t => {
  const { client, calls } = clientMock()
  const result = await loadGroupData(client, group, { studentId: 'student-0', contacts: false, attention: false })
  assert.deepEqual(result.members, members.filter(m => m.student_id === 'student-0'))
  assert.deepEqual(result.attendance, attendance.filter(a => a.student_id === 'student-0'))
  assert.deepEqual(attendanceSummary('student-0', result.meetings, result.attendance), attendanceSummary('student-0', meetings, attendance))
  assert(!calls.some(c => ['follow_up_contacts', 'community_group_checkin_attention'].includes(c.table)))
  t.diagnostic(`Attendance records returned: ${result.attendance.length} instead of ${attendance.length}; synthetic fixture, not a production timing.`)
})

test('selected meeting preserves every checkbox and version; unsaved dates remain empty', async () => {
  for (const date of ['2026-01-12', '2026-01-19', '2026-02-01']) {
    const { client } = clientMock()
    const result = await loadGroupData(client, group, { attendanceDate: () => date })
    assert.deepEqual(attendanceRoster(result.members, result.meetings, result.attendance, date), attendanceRoster(members, meetings, attendance, date))
    assert(result.attendance.every(a => a.meeting_id === meetings.find(m => m.meeting_date === date)?.id))
    assert.deepEqual(result.meetings.find(m => m.meeting_date === date), meetings.find(m => m.meeting_date === date))
  }
  const { client } = clientMock()
  const archived = await loadGroupData(client, group, { attention: false, attendanceDate: rows => rows[0].meeting_date })
  assert.deepEqual(attendanceRoster(archived.members, archived.meetings, archived.attendance, meetings[0].meeting_date), attendanceRoster(members, meetings, attendance, meetings[0].meeting_date))
})

test('settings keep meeting dates and attention badge without fetching roster or attendance', async () => {
  const { client, calls } = clientMock()
  const result = await loadGroupData(client, group, { members: false, contacts: false, attendance: false })
  assert.deepEqual(result.meetings, meetings)
  assert.deepEqual(result.attentionIds, ['student-2'])
  assert.deepEqual(calls.map(c => c.table).sort(), ['community_group_checkin_attention', 'community_group_meetings'])
})

test('independent reads start together; failures still reject the page data', async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const { client, calls } = clientMock({ gate })
  const pending = loadGroupData(client, group)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(calls.map(c => c.table).sort(), ['community_group_checkin_attention', 'community_group_meetings', 'community_group_memberships'])
  release()
  await pending
  const failed = clientMock({ fail: 'community_group_attendance' })
  await assert.rejects(loadGroupData(failed.client, group), /read failed/)
})
