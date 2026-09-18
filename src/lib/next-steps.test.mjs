import assert from 'node:assert/strict'
import test from 'node:test'
import { localDateTime, plannedInstant, nextStepInputError } from './next-steps.ts'
import { pushBody, pushDestination } from './push.ts'

test('local datetime round trips and rejects impossible dates',()=>{
  const value='2027-02-10T18:30'
  assert.equal(localDateTime(plannedInstant(value)),value)
  for(const invalid of ['','tomorrow','2027-02-30T18:30','2027-02-10','2027-02-10T25:00']) assert.equal(plannedInstant(invalid),null)
})
test('action and time validation reject blank/long plans and elapsed or far-future times',()=>{
  const due='2027-02-10T18:30', now=Date.parse(plannedInstant(due))-86400000
  assert.equal(nextStepInputError('Call to catch up',due,now),null)
  assert.match(nextStepInputError(' ',due,now),/Write/)
  assert.match(nextStepInputError('a'.repeat(501),due,now),/500/)
  assert.match(nextStepInputError('Call',due,now+2*86400000),/future/)
  assert.match(nextStepInputError('Call',due,now-370*86400000),/year/)
})
test('notifications distinguish stale contacts from planned steps and restrict destinations',()=>{
  assert.match(pushBody({contacts:0,invitations:0,groups:0,nextSteps:1,total:1}),/How did it go\?/)
  assert.match(pushBody({contacts:2,invitations:0,groups:0,nextSteps:2,total:4}),/2 planned steps are/)
  const stale={contacts:1,invitations:0,groups:0,total:1,staleContactName:'Invented Student',staleContactId:'00000000-0000-4000-8000-000000000001'}
  assert.equal(pushBody(stale),'What’s your next step with Invented Student?')
  assert.equal(pushDestination(stale),'/contacts?context=1&attention=stale&contact=00000000-0000-4000-8000-000000000001')
  assert.match(pushBody({...stale,nextSteps:1,nextStepContactName:'Invented Other'}),/^How did it go with Invented Other\?/)
  assert.equal(pushDestination({...stale,nextSteps:1}),'/contacts/next-steps')
  assert.equal(pushDestination({...stale,staleContactId:'https://evil.test'}),'/notifications')
})
