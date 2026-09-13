import assert from 'node:assert/strict'
import test from 'node:test'
import { weakConfirmationToken as token } from './import-match-confirmation.ts'
const row = { name:'TEST Alex', uniqname:'', phone:'', location:'Bursley', room:'101' }
const candidate = { contact_id:'contact-a', student_id:'student-a', identity_conflict:false, phone_differs:false, phone:null, location_name:'Bursley', room_or_address:'101', match_reason:'name_location' }
const result = { candidate_count:1, status:'weak_match', candidates:[candidate] }
test('unchanged recheck preserves both merge and keep-separate decisions', () => {
  for (const choice of ['merge','keep_separate']) assert.equal(token('year',row,choice,result), token('year',{...row},choice,JSON.parse(JSON.stringify(result))))
})
test('only matching evidence and campaign determine confirmation validity', () => {
  const before = token('year',row,'merge',result)
  for (const key of Object.keys(row)) assert.notEqual(token('year',{...row,[key]:'changed'},'merge',result),before)
  assert.notEqual(token('other-year',row,'merge',result),before)
  assert.notEqual(token('year',row,'keep_separate',result),before)
  assert.notEqual(token('year',row,'merge',{...result,candidates:[{...candidate,contact_id:'different'}]}),before)
  assert.notEqual(token('year',row,'merge',{...result,candidates:[{...candidate,room_or_address:'102'}]}),before)
})
test('new conflicts, multiple candidates and vanished matches cannot preserve merge approval', () => {
  for (const flag of ['identity_conflict','phone_differs']) assert.equal(token('year',row,'merge',{...result,candidates:[{...candidate,[flag]:true}]}),null)
  assert.equal(token('year',row,'merge',{...result,candidate_count:2,candidates:[candidate,{...candidate,contact_id:'b'}]}),null)
  assert.equal(token('year',row,'merge',{...result,candidate_count:0,candidates:[]}),null)
})
test('keep-separate is stable across candidate ordering, but not a changed candidate set', () => {
  const b={...candidate,contact_id:'b'}
  const multiple={...result,status:'multiple_weak_matches',candidate_count:2,candidates:[candidate,b]}
  const before=token('year',row,'keep_separate',multiple)
  assert.equal(token('year',row,'keep_separate',{...multiple,candidates:[b,candidate]}),before)
  assert.notEqual(token('year',row,'keep_separate',result),before)
  assert.notEqual(token('year',row,'keep_separate',{...multiple,candidates:[candidate,{...b,phone_differs:true}]}),before)
})
