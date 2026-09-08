import assert from 'node:assert/strict'
import test from 'node:test'
import { createTextAttemptSession, readPendingTextAttempt, textPurposeSummary, validateTextAttempt, followUpActivityLabel } from './text-attempts.ts'

const contact = { id: '00000000-0000-4000-8000-000000000001', name: 'Example Student' }
function storage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
}

test('opening Messages does not confirm sending, and returning asks only once', () => {
  const session = createTextAttemptSession('leader', storage())
  session.resume()
  assert.equal(session.getSnapshot(), null)
  session.begin(contact, 'waiting')
  const id = session.getSnapshot().eventId
  session.resume()
  assert.equal(session.getSnapshot().stage, 'waiting')
  session.leave(); session.resume()
  assert.equal(session.getSnapshot().stage, 'confirm')
  session.confirm()
  session.leave(); session.resume()
  assert.equal(session.getSnapshot().stage, 'form')
  assert.equal(session.getSnapshot().eventId, id)
})

test('No or Cancel clears the reminder and later app switches do not bring it back', () => {
  const saved = storage()
  const session = createTextAttemptSession('leader', saved)
  session.begin(contact, 'waiting'); session.leave(); session.resume(); session.dismiss()
  session.leave(); session.resume()
  assert.equal(session.getSnapshot(), null)
  assert.equal(createTextAttemptSession('leader', saved).getSnapshot(), null)
})

test('manual logging opens the same form; reload preserves the submission identifier', () => {
  const saved = storage()
  const session = createTextAttemptSession('leader', saved)
  session.begin(contact, 'form')
  assert.equal(session.getSnapshot().stage, 'form')
  assert.equal(createTextAttemptSession('leader', saved).getSnapshot().eventId, session.getSnapshot().eventId)
})

test('an interrupted Messages handoff restores a question without assuming the message was sent', () => {
  const saved = storage()
  const session = createTextAttemptSession('leader', saved)
  session.begin(contact, 'waiting')
  assert.equal(createTextAttemptSession('leader', saved).getSnapshot().stage, 'confirm')
  assert.equal(createTextAttemptSession('different-leader', saved).getSnapshot(), null)
})

test('text logging still works when browser storage is disabled', () => {
  const session = createTextAttemptSession('leader', { getItem() { throw Error() }, setItem() { throw Error() }, removeItem() { throw Error() } })
  session.begin(contact, 'waiting'); session.leave(); session.resume(); session.confirm()
  assert.equal(session.getSnapshot().stage, 'form')
  session.dismiss()
  assert.equal(session.getSnapshot(), null)
})

test('stale or damaged reminders are ignored', () => {
  const session = createTextAttemptSession('leader', null)
  session.begin(contact, 'waiting')
  const pending = session.getSnapshot()
  assert.equal(readPendingTextAttempt('broken'), null)
  assert.equal(readPendingTextAttempt(JSON.stringify({ ...pending, startedAt: 0 })), null)
  assert.equal(readPendingTextAttempt(JSON.stringify({ ...pending, eventId: [pending.eventId] })), null)
  assert.equal(readPendingTextAttempt(JSON.stringify({ ...pending, stage: 'sent' })), null)
})

test('purpose choices support multiple invitations, custom events, and optional notes', () => {
  assert.equal(validateTextAttempt(['invite_cg', 'appointment'], '', ''), null)
  assert.equal(validateTextAttempt(['invite_event'], 'Barn Bash', 'Offered a ride'), null)
  assert.ok(validateTextAttempt(['invite_event'], '   ', ''))
  assert.ok(validateTextAttempt([], '', ''))
  assert.ok(validateTextAttempt(['unknown'], '', ''))
  assert.ok(validateTextAttempt(['follow_up'], '', 'x'.repeat(2001)))
  assert.equal(textPurposeSummary(['appointment', 'invite_event', 'invite_cg'], 'Barn Bash'), 'Invite to CG · Set appointment · Invite to Barn Bash')
})

test('text events have their own label without changing existing activity labels', () => {
  assert.equal(followUpActivityLabel('text_attempt'), 'Text attempt')
  assert.equal(followUpActivityLabel('knock'), 'Knocked')
  assert.equal(followUpActivityLabel('interaction'), 'Interaction')
})
