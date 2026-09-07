import assert from 'node:assert/strict'
import test from 'node:test'
import {
  personalFilterCookie,
  readPersonalFilters,
  shouldRestorePersonalFilters,
  smartCardCriteria,
  resetChangedDormFilters,
} from './contact-filters.ts'

test('changing or removing a dorm clears its floor and wing without dropping other choices', () => {
  for (const location of ['bursley', '', 'no_address', 'needs_area_assignment']) {
    const filters = { location, floor: '3', wing: '2', gender: 'male', jesus: 'yes,maybe' }
    assert.deepEqual(resetChangedDormFilters(filters, 'markley'), {
      ...filters, floor: '', wing: '',
    })
    assert.equal(filters.floor, '3')
  }
})

test('selecting a floor or changing another filter in the same dorm preserves floor and wing', () => {
  const filters = { location: 'bursley', floor: '4', wing: '2', gender: 'female' }
  assert.deepEqual(resetChangedDormFilters(filters, 'bursley'), filters)
})

test('fresh visits to every home card restore personal context; area browsing does not', () => {
  for (const view of ['mine', 'goback', 'gospel', 'new', 'cg', 'noaddress']) {
    assert.equal(shouldRestorePersonalFilters(view, {}), true)
  }
  assert.equal(shouldRestorePersonalFilters('area', {}), false)
})

test('result snapshots and existing filtered links take precedence over saved preferences', () => {
  assert.equal(shouldRestorePersonalFilters('cg', { context: '1' }), false)
  assert.equal(shouldRestorePersonalFilters('cg', { gender: 'female' }), false)
  assert.equal(shouldRestorePersonalFilters('cg', { gender: '' }), false)
  assert.equal(shouldRestorePersonalFilters('cg', { interview: ['yes', 'maybe'] }), false)
})

test('saved preferences carry manual survey filters but never card or navigation state', () => {
  const personal = { gender: 'male', location: 'bursley-id', jesus: 'yes', floor: '3' }
  assert.deepEqual(readPersonalFilters(JSON.stringify({
    ...personal, view: 'gospel', page: '4', display: 'sheet', sort: 'room',
    cardCriteria: smartCardCriteria('gospel', 'Bursley'),
  })), personal)
  assert.deepEqual(readPersonalFilters('{}'), {})
  assert.notEqual(personalFilterCookie('user-a'), personalFilterCookie('user-b'))
})

test('invalid stored preferences do not break results', () => {
  for (const value of ['', 'broken json', 'null', '[]', '42']) {
    assert.deepEqual(readPersonalFilters(value), {})
  }
  assert.deepEqual(readPersonalFilters(JSON.stringify({
    gender: ['male'], location: 'a'.repeat(201), campus: { id: 'x' }, status: '',
  })), {})
})

test('gospel OR rule remains explicit and is replaced by community criteria', () => {
  const gospel = smartCardCriteria('gospel', 'Bursley')
  const community = smartCardCriteria('cg', 'Bursley')
  assert.ok(gospel.includes('KGP shared: No'))
  assert.ok(gospel.some((rule) => rule.includes(' OR ') && rule.includes('either qualifies')))
  assert.ok(community.includes('Community: Yes or Maybe'))
  assert.ok(community.every((rule) => !rule.includes('KGP') && !rule.includes('Interview')))
  assert.ok(smartCardCriteria('goback', 'Bursley').includes('You have personally recorded an interaction'))
})
