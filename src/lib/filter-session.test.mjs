import assert from 'node:assert/strict'
import test from 'node:test'
import { filterSessionUrl } from './filter-session.ts'

const defaults = { campus: 'north', location: 'bursley', floor: '', wing: '', affinity: '' }

test('a fresh session replaces area and resets pagination while preserving other choices', () => {
  const href = filterSessionUrl('https://example.com/opportunities/share-the-gospel?campus=hill&location=markley&floor=3&wing=2&gender=male&jesus=yes&jesus=maybe&sort=room&display=sheet&page=4#results', defaults)
  const url = new URL(href, 'https://example.com')
  assert.equal(url.searchParams.get('campus'), 'north')
  assert.equal(url.searchParams.get('location'), 'bursley')
  for (const key of ['floor', 'wing', 'page', 'affinity']) assert.equal(url.searchParams.has(key), false)
  assert.equal(url.searchParams.get('gender'), 'male')
  assert.deepEqual(url.searchParams.getAll('jesus'), ['yes', 'maybe'])
  assert.equal(url.searchParams.get('sort'), 'room')
  assert.equal(url.searchParams.get('display'), 'sheet')
  assert.equal(url.hash, '')
})

test('no-address reopening remains campus-wide', () => {
  const href = filterSessionUrl('https://example.com/opportunities/no-address?campus=hill&location=markley&gender=male', defaults)
  const url = new URL(href, 'https://example.com')
  assert.equal(url.searchParams.has('campus'), false)
  assert.equal(url.searchParams.has('location'), false)
  assert.equal(url.searchParams.get('gender'), 'male')
})

test('affinity assignments and missing assignments are supported', () => {
  const url = new URL(filterSessionUrl('https://example.com/contacts?campus=north', { affinity: 'greek' }), 'https://example.com')
  assert.equal(url.searchParams.get('affinity'), 'greek')
  assert.equal(url.searchParams.has('campus'), false)
  assert.equal(filterSessionUrl('https://example.com/contacts?campus=north', {}), '/contacts?context=1')
})

test('session initialization does not navigate away from other app workflows', () => {
  for (const path of ['/', '/contacts/contact-id?returnTo=original', '/assign-contacts', '/manage', '/profile']) {
    assert.equal(filterSessionUrl(`https://example.com${path}`, defaults), null)
  }
})
