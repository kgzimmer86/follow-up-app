import assert from 'node:assert/strict'
import test from 'node:test'
import { communityContext } from './workspace-navigation.ts'

test('Community routes and its contact return paths keep Community navigation', () => {
  for (const path of ['/community', '/community/groups/abc', '/community/groups/abc/contacts/roster']) assert.equal(communityContext(path,null),true)
  assert.equal(communityContext('/contacts/abc','/community/groups/group/contacts/roster?sort=room'),true)
  assert.equal(communityContext('/contacts/abc','/community/groups/group?tab=people'),true)
})
test('normal Follow Up routes and unrelated contact visits remain Follow Up', () => {
  for (const path of ['/', '/contacts', '/manage', '/disciples','/opportunities/community-group']) assert.equal(communityContext(path,null),false)
  for (const from of [null, '/contacts?display=cards', 'https://example.com/community', '//example.com/community', '/community-other']) assert.equal(communityContext('/contacts/abc',from),false)
  assert.equal(communityContext('/manage','/community'),false)
})
