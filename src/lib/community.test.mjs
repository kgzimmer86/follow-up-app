import assert from 'node:assert/strict'
import test from 'node:test'
import { attendanceRoster, attendanceSummary, validMeetingDate, withinArea } from './community.ts'

test('historical rosters include past members without counting duplicate identities twice', () => {
  const members = [
    { student_id: 'a', started_on: '2026-09-01', ended_on: '2026-09-15', students: { display_name: 'Alex' } },
    { student_id: 'a', started_on: '2026-09-10', ended_on: null, students: { display_name: 'Alex' } },
    { student_id: 'b', started_on: '2026-09-20', ended_on: null, students: { display_name: 'Blair' } },
  ]
  const meetings = [{ id: 'm', meeting_date: '2026-09-12' }]
  const attendance = [{ meeting_id: 'm', student_id: 'a', is_present: true }]
  assert.equal(attendanceRoster(members, meetings, attendance, '2026-09-12').length, 1)
  assert.equal(attendanceSummary('a', meetings, attendance).count, 1)
  assert.equal(attendanceRoster(members, meetings, attendance, '2026-09-21').length, 2)
})
test('dates and area ancestry are validated', () => {
  assert.equal(validMeetingDate('2026-02-30', '2026-09-11'), '2026-09-11')
  assert.equal(validMeetingDate('2026-09-15', '2026-09-11'), '2026-09-15')
  const areas = [{ id: 'north', parent_id: null }, { id: 'dorm', parent_id: 'north' }, { id: 'central', parent_id: null }]
  assert.equal(withinArea('dorm', 'north', areas), true)
  assert.equal(withinArea('central', 'north', areas), false)
  assert.equal(withinArea('dorm', null, areas), true)
})
