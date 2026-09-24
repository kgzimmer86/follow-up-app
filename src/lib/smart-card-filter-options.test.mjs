import assert from 'node:assert/strict'
import test from 'node:test'
import { hasExtendedFilters, locksNotInterested, selectedStatuses, statusFilterValue, affinityFilterValue } from './smart-card-filter-options.ts'

test('step-of-faith cards simplify controls; No Address and All Contacts retain options', () => {
  for (const view of ['goback','gospel','new','cg']) assert.equal(hasExtendedFilters(view), false)
  for (const view of ['noaddress','area','mine']) assert.equal(hasExtendedFilters(view), true)
})
test('Not Interested stays locked on existing excluding views, not All Contacts', () => {
  for (const view of ['mine','goback','gospel','new','cg','noaddress']) {
    assert.equal(locksNotInterested(view),true)
    assert.equal(selectedStatuses('',true).length,4)
    assert.equal(statusFilterValue(['not_interested'],true),'__no_matches')
  }
  assert.equal(locksNotInterested('area'),false)
  assert.equal(selectedStatuses('',false).length,5)
})
test('empty means no matches; full selection means no additional restriction', () => {
  assert.equal(statusFilterValue([],true),'__no_matches')
  assert.deepEqual(selectedStatuses('__no_matches',true),[])
  assert.equal(statusFilterValue(selectedStatuses('',true),true),'')
  assert.equal(statusFilterValue(['go_back','involved'],true),'go_back,involved')
})
test('affinities accept multiple unique IDs, empty means Any', () => {
  const a='00000000-0000-4000-8000-000000000001', b='00000000-0000-4000-8000-000000000002'
  assert.equal(affinityFilterValue([a,b,a]),`${a},${b}`)
  assert.equal(affinityFilterValue([]),'')
})
