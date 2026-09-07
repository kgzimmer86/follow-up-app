import assert from 'node:assert/strict'
import test from 'node:test'
import {
  personalFilterCookie,
  readPersonalFilters,
  shouldRestorePersonalFilters,
  smartCardCriteria,
  resetChangedDormFilters,
  assignedAreaFilters,
  resetChangedCampusFilters,
  withoutGeographicFilters,
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

test('fresh visits to all shared contact lists restore personal context', () => {
  for (const view of ['mine', 'goback', 'gospel', 'new', 'cg', 'noaddress']) {
    assert.equal(shouldRestorePersonalFilters(view, {}), true)
  }
  assert.equal(shouldRestorePersonalFilters('area', {}), true)
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
    cardCriteria: smartCardCriteria('gospel'),
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
  const gospel = smartCardCriteria('gospel')
  const community = smartCardCriteria('cg')
  assert.ok(gospel.includes('KGP shared: No'))
  assert.ok(gospel.some((rule) => rule.includes(' OR ') && rule.includes('either qualifies')))
  assert.ok(community.includes('Community: Yes or Maybe'))
  assert.ok(community.every((rule) => !rule.includes('KGP') && !rule.includes('Interview')))
  assert.ok(smartCardCriteria('goback').includes('You have personally recorded an interaction'))
})

const north = { id: 'north', name: 'North Campus', area_type: 'campus_region', parent_id: null }
const central = { ...north, id: 'central', name: 'Central Campus' }
const bursley = { id: 'bursley', name: 'Bursley', area_type: 'dorm', parent_id: north.id }
const areas = [north, central, bursley]

test('assigned areas map to visible filters for regions, dorms, off-campus and affinities', () => {
  for (const name of ['North Campus', 'Central Campus', 'The Hill', 'The Village']) {
    assert.deepEqual(assignedAreaFilters({ ...north, name }), {
      campus: 'north', location: '', floor: '', wing: '', affinity: '',
    })
  }
  assert.deepEqual(assignedAreaFilters(bursley), {
    campus: 'north', location: 'bursley', floor: '', wing: '', affinity: '',
  })
  assert.equal(assignedAreaFilters({ ...bursley, area_type: 'off_campus' }).location, 'bursley')
  assert.deepEqual(assignedAreaFilters({ id: 'greek', name: 'Greek Life', area_type: 'affinity', parent_id: null }), {
    campus: '', location: '', floor: '', wing: '', affinity: 'greek',
  })
  assert.deepEqual(assignedAreaFilters(null), { campus: '', location: '', floor: '', wing: '', affinity: '' })
})

test('campus changes clear incompatible locations and spatial choices but preserve personal filters', () => {
  for (const campus of ['central', '']) {
    const filters = { campus, location: 'bursley', floor: '3', wing: '2', gender: 'male' }
    assert.deepEqual(resetChangedCampusFilters(filters, 'north', areas), {
      ...filters, location: '', floor: '', wing: '',
    })
  }
  const compatible = { campus: 'north', location: 'bursley', floor: '3', wing: '2' }
  assert.deepEqual(resetChangedCampusFilters(compatible, '', areas), compatible)
  assert.deepEqual(resetChangedCampusFilters(compatible, 'north', areas), compatible)
  assert.equal(resetChangedCampusFilters({ ...compatible, location: 'no_address' }, '', areas).location, '')
})

test('no-address entry omits geographic filters without mutating saved context', () => {
  const saved = { campus: 'north', location: 'bursley', floor: '3', wing: '2', gender: 'male', affinity: 'greek' }
  assert.deepEqual(withoutGeographicFilters(saved), { gender: 'male', affinity: 'greek' })
  assert.equal(saved.location, 'bursley')
})

test('assigned area is no longer a hidden fixed card criterion', () => {
  for (const view of ['gospel', 'new', 'cg']) {
    assert.ok(smartCardCriteria(view).every((rule) => !rule.includes('Ministry area')))
  }
})
