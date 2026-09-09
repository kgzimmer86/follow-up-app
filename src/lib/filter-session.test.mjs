import assert from 'node:assert/strict'
import test from 'node:test'
import { filterSessionUrl } from './filter-session.ts'
import { personalFilterKeys, clearedPersonalFilters, readPersonalFilters } from './contact-filters.ts'
import { additionalContactFilters, spreadsheetPersonalFilters } from './spreadsheet-filter-options.ts'

const defaults = { campus: 'north', location: 'bursley', floor: '', wing: '', affinity: '' }

test('a fresh session keeps only the assigned area and resets other choices', () => {
  const href = filterSessionUrl('https://example.com/opportunities/share-the-gospel?campus=hill&location=markley&floor=3&wing=2&gender=male&jesus=yes&jesus=maybe&sort=room&display=sheet&page=4#results', defaults)
  const url = new URL(href, 'https://example.com')
  assert.equal(url.searchParams.get('campus'), 'north')
  assert.equal(url.searchParams.get('location'), 'bursley')
  for (const key of ['floor', 'wing', 'gender', 'jesus', 'community', 'interview', 'kgp', 'interviewDone', 'invitedCg', 'affinity', 'roomOnly', 'page']) {
    assert.equal(url.searchParams.has(key), false)
  }
  assert.equal(url.searchParams.get('sort'), 'room')
  assert.equal(url.searchParams.get('display'), 'sheet')
  assert.equal(url.hash, '')
})

test('no-address reopening remains campus-wide', () => {
  const href = filterSessionUrl('https://example.com/opportunities/no-address?campus=hill&location=markley&gender=male', defaults)
  const url = new URL(href, 'https://example.com')
  assert.equal(url.searchParams.has('campus'), false)
  assert.equal(url.searchParams.has('location'), false)
  assert.equal(url.searchParams.has('gender'), false)
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

test('reopening a saved spreadsheet resets every personal and legacy filter just like Clear Filters', () => {
  const resetKeys = new Set([
    ...personalFilterKeys,
    ...additionalContactFilters.map(({ param }) => param),
    ...Object.keys(spreadsheetPersonalFilters),
  ])
  const params = new URLSearchParams({ display: 'sheet', columns: 'email,text_cg', sort: 'room', dir: 'desc', page: '3' })
  for (const key of resetKeys) params.set(key, 'old-choice')
  const assignments = [
    null,
    { id: 'north', name: 'North Campus', area_type: 'campus_region', parent_id: null },
    { id: 'bursley', name: 'Bursley', area_type: 'dorm', parent_id: 'north' },
    { id: 'off-north', name: 'Off Campus — North', area_type: 'off_campus', parent_id: 'north' },
    { id: 'greek', name: 'Greek Life', area_type: 'affinity', parent_id: null },
  ]
  for (const assignment of assignments) {
    const cleared = clearedPersonalFilters(assignment)
    for (const path of ['/contacts', '/contacts/area', '/opportunities/go-back', '/opportunities/share-the-gospel', '/opportunities/meet-someone-new', '/opportunities/community-group', '/opportunities/no-address']) {
      const url = new URL(filterSessionUrl(`https://example.com${path}?${params}`, cleared), 'https://example.com')
      const expected = readPersonalFilters(JSON.stringify(cleared))
      if (path === '/opportunities/no-address') {
        delete expected.campus
        delete expected.location
      }
      assert.deepEqual(readPersonalFilters(JSON.stringify(Object.fromEntries(url.searchParams))), expected)
      for (const key of resetKeys) assert.equal(url.searchParams.get(key), expected[key] ?? null, `${path}: ${key}`)
      assert.equal(url.searchParams.has('page'), false)
      assert.equal(url.searchParams.get('columns'), 'email,text_cg')
      assert.equal(url.searchParams.get('display'), 'sheet')
      assert.equal(url.searchParams.get('sort'), 'room')
      assert.equal(url.searchParams.get('dir'), 'desc')
    }
  }
})
