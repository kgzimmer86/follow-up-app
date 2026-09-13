import assert from 'node:assert/strict'
import test from 'node:test'
import { communityContactIds, scopedContactRows } from './community-contact-scope.ts'

const members = [
  { student_id: 'a', ended_on: null },
  { student_id: 'b', ended_on: '2026-09-01' },
  { student_id: 'c', ended_on: null },
  { student_id: 'a', ended_on: '2026-08-01' },
]
const contacts = [
  { id: 'ca', student_id: 'a', status: 'involved' },
  { id: 'cb', student_id: 'b', status: 'involved' },
  { id: 'cc', student_id: 'c', status: 'go_back' },
]
const attendance = [
  { meeting_id: 'old', student_id: 'a', is_present: true },
  { meeting_id: 'old', student_id: 'b', is_present: true },
  { meeting_id: 'latest', student_id: 'a', is_present: true },
  { meeting_id: 'latest', student_id: 'c', is_present: false },
]
test('group shortcuts distinguish current, involved, latest and lifetime people', () => {
  const scope = segment => communityContactIds(segment, members, attendance, contacts, 'latest')
  assert.deepEqual(scope('involved'), ['ca'])
  assert.deepEqual(scope('roster'), ['ca', 'cc'])
  assert.deepEqual(scope('attended'), ['ca'])
  assert.deepEqual(scope('ever'), ['ca', 'cb'])
  assert.deepEqual(scope('invalid'), [])
  assert.deepEqual(communityContactIds('attended', members, attendance, contacts), [])
})
test('group lists retain only authorized RPC rows across every page, deduplicated', async () => {
  const first = { campaign_id: 'year', total_count: 6, rows: [{ id: 'unrelated' }, { id: 'ca' }] }
  const calls = []
  const rows = await scopedContactRows(first, 'year', ['ca', 'cb', 'not-authorized'], 2, async page => {
    calls.push(page)
    return { ...first, rows: page === 2 ? [{ id: 'ca' }, { id: 'another' }] : [{ id: 'cb' }] }
  })
  assert.deepEqual(calls, [2, 3])
  assert.deepEqual(rows, [{ id: 'ca' }, { id: 'cb' }])
})
test('empty groups do not scan the rest of the contact database', async () => {
  assert.deepEqual(await scopedContactRows({ campaign_id: 'year', total_count: 1000, rows: [{ id: 'other' }] }, 'year', [], 50, async () => { throw new Error('Unexpected fetch') }), [])
})
test('campaign changes and failed pages never return a partial contact list', async () => {
  const first = { campaign_id: 'year', total_count: 2, rows: [{ id: 'ca' }] }
  await assert.rejects(scopedContactRows(first, 'different', ['ca'], 1, async () => first), /campaign changed/)
  await assert.rejects(scopedContactRows(first, 'year', ['ca', 'cb'], 1, async () => ({ ...first, campaign_id: 'different' })), /campaign changed/)
  await assert.rejects(scopedContactRows(first, 'year', ['ca', 'cb'], 1, async () => { throw new Error('Network failed') }), /Network failed/)
})
test('stop scanning once all requested contacts have been found', async () => {
  const first = { campaign_id: 'year', total_count: 1000, rows: [{ id: 'ca' }] }
  assert.deepEqual(await scopedContactRows(first, 'year', ['ca'], 50, async () => { throw new Error('Unexpected fetch') }), [{ id: 'ca' }])
})
