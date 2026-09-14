import assert from 'node:assert/strict'
import test from 'node:test'
import { communityAttention } from './community-attention.ts'

const member = { student_id: 'a', started_on: '2026-09-01', ended_on: null, students: { display_name: 'Alex' } }
const meetings = Array.from({ length: 5 }, (_, i) => ({ id: String(i), meeting_date: `2026-09-0${i + 1}` }))
const entries = (values) => values.flatMap((value, i) => value === null ? [] : [{ meeting_id: String(i), student_id: 'a', is_present: value }])
test('two consecutive recorded absences trigger; rolling absence patterns alone do not', () => {
  const [result] = communityAttention([member], meetings, entries([true, true, true, false, false]))
  assert.equal(result.attended, 3)
  assert.equal(result.recorded, 5)
  assert.equal(result.lastAttended, '2026-09-03')
  assert.equal(communityAttention([member], meetings, entries([false, true, false, true, false])).length, 0)
  assert.equal(communityAttention([member], meetings, entries([false, false, false, false, true])).length, 0)
})
test('new, returned, former and duplicate memberships do not manufacture absence streaks', () => {
  const absent = entries([false, false, false, false, false])
  assert.equal(communityAttention([{ ...member, started_on: '2026-09-05' }], meetings, absent).length, 0)
  assert.equal(communityAttention([{ ...member, ended_on: '2026-09-04' }], meetings, absent).length, 0)
  assert.equal(communityAttention([{ ...member, ended_on: '2026-09-03' }, { ...member, started_on: '2026-09-05' }], meetings, absent).length, 0)
  assert.equal(communityAttention([member, member], meetings, absent).length, 1)
  assert.equal(communityAttention([{ ...member, started_on: '2026-09-04' }], meetings, absent)[0].recorded, 2)
})
test('unknown attendance is not absence; deleted meetings no longer count', () => {
  assert.equal(communityAttention([member], meetings, entries([true, true, false, null, false])).length, 0)
  const [result] = communityAttention([member], meetings, entries([true, null, true, false, false]))
  assert.equal(result.recorded, 4)
  assert.equal(result.missing, 1)
  assert.equal(communityAttention([member], meetings.slice(0, 4), entries([true, true, true, false, false])).length, 0)
})
