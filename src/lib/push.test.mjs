import assert from 'node:assert/strict'
import test from 'node:test'
import { pushBody, validPushEndpoint } from './push.ts'

test('push endpoint allowlist rejects SSRF targets and deceptive hosts', () => {
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/x','https://web.push.apple.com/Qx','https://updates.push.services.mozilla.com/wpush/v2/a','https://wns2-bl2p.notify.windows.com/w/?token=x']) assert.equal(validPushEndpoint(endpoint),true,endpoint)
  for (const endpoint of ['https://127.0.0.1/a','https://[::1]/a','https://localhost/a','http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://evil@fcm.googleapis.com/a','https://fcm.googleapis.com:444/a','https://fcm.googleapis.com/a#secret','bad']) assert.equal(validPushEndpoint(endpoint),false,endpoint)
})
test('summary combines counts and clearing has a visible, non-personal message', () => {
  assert.match(pushBody({contacts:5,invitations:2,groups:1,total:8}),/^8 attention items: 5 contacts, 2 invitations, 1 group follow-ups/)
  assert.match(pushBody({contacts:0,invitations:0,groups:0,total:0}),/no follow-up items/)
})
