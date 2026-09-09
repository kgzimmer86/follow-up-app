import assert from 'node:assert/strict'
import test from 'node:test'
import {
  personalFilterCookie,
  personalFilterKeys,
  readPersonalFilters,
  readPersonalFilterView,
  filtersForContactView,
  rememberContactFilterView,
  shouldRestorePersonalFilters,
  smartCardCriteria,
  resetChangedDormFilters,
  assignedAreaFilters,
  clearedPersonalFilters,
  homeFilterAreaContext,
  resetChangedCampusFilters,
  withoutGeographicFilters,
} from './contact-filters.ts'
import {
  additionalContactFilters,
  clearSpreadsheetColumnFilter,
  contactFiltersForDisplay,
  normalizeSharedContactFilters,
  updateSpreadsheetColumnFilter,
} from './spreadsheet-filter-options.ts'

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

test('personal values remain separate from card identity and navigation state', () => {
  const personal = { gender: 'male', location: 'bursley-id', jesus: 'yes', floor: '3' }
  assert.deepEqual(readPersonalFilters(JSON.stringify({
    ...personal, view: 'gospel', page: '4', display: 'sheet', sort: 'room',
    cardCriteria: smartCardCriteria('gospel'),
  })), personal)
  assert.deepEqual(readPersonalFilters('{}'), {})
  assert.notEqual(personalFilterCookie('user-a'), personalFilterCookie('user-b'))
})

const travelling = { campus: 'north', location: 'bursley', floor: '3', wing: '2', gender: 'male', affinity: 'greek' }
const cardOnly = {
  status: 'go_back', jesus: 'yes,maybe', community: 'no', interview: 'yes',
  kgp: 'not_shared', interviewDone: 'not_completed', invitedCg: 'invited', roomOnly: '1',
  ...Object.fromEntries(additionalContactFilters.map(({ param, kind }) => [param, kind === 'email' || kind === 'text' ? 'has' : 'yes'])),
}

test('switching smart cards carries only location, gender, and affinity choices', () => {
  const saved = { ...travelling, ...cardOnly }
  for (const previous of ['mine', 'goback', 'gospel', 'new', 'cg', 'area']) {
    for (const next of ['mine', 'goback', 'gospel', 'new', 'cg', 'area']) {
      assert.deepEqual(filtersForContactView(saved, previous, next), previous === next ? saved : travelling)
    }
  }
  assert.deepEqual(saved, { ...travelling, ...cardOnly })
})

test('Home count filters match card entry, and visiting another card discards old card-only choices', () => {
  const original = JSON.stringify({ ...travelling, ...cardOnly, view: 'gospel' })
  const homePreview = filtersForContactView(readPersonalFilters(original), readPersonalFilterView(original), 'cg')
  const afterVisit = rememberContactFilterView(original, 'cg')
  assert.equal(readPersonalFilterView(afterVisit), 'cg')
  assert.deepEqual(homePreview, readPersonalFilters(afterVisit))
  const backToGospel = rememberContactFilterView(afterVisit, 'gospel')
  assert.deepEqual(readPersonalFilters(backToGospel), travelling)
  assert.ok(smartCardCriteria('cg').includes('Community: Yes or Maybe'))
  assert.ok(smartCardCriteria('gospel').includes('KGP shared: No'))
})

test('returning to the same card keeps its extra filters, including explicit empty selections', () => {
  const original = JSON.stringify({ ...travelling, ...cardOnly, view: 'gospel' })
  const returned = rememberContactFilterView(original, 'gospel')
  assert.deepEqual(readPersonalFilters(returned), { ...travelling, ...cardOnly })
  const cleared = rememberContactFilterView(JSON.stringify({ view: 'gospel' }), 'cg')
  assert.deepEqual(readPersonalFilters(cleared), {})
  assert.equal(readPersonalFilterView(cleared), 'cg')
})

test('No Address entry ignores geography while remembering it for the next smart card', () => {
  const original = JSON.stringify({ ...travelling, ...cardOnly, view: 'gospel' })
  const saved = rememberContactFilterView(original, 'noaddress')
  assert.deepEqual(filtersForContactView(readPersonalFilters(original), 'gospel', 'noaddress'), {
    gender: 'male', affinity: 'greek',
  })
  assert.deepEqual(readPersonalFilters(saved), travelling)
  const edited = JSON.stringify({ ...readPersonalFilters(saved), status: 'attempted_contact', view: 'noaddress' })
  assert.deepEqual(filtersForContactView(readPersonalFilters(edited), 'noaddress', 'noaddress'), {
    gender: 'male', affinity: 'greek', status: 'attempted_contact',
  })
  assert.deepEqual(readPersonalFilters(rememberContactFilterView(edited, 'cg')), travelling)
})

test('existing cookies keep shared context without carrying unknown card-only choices', () => {
  const legacy = JSON.stringify({ ...travelling, ...cardOnly })
  assert.equal(readPersonalFilterView(legacy), undefined)
  assert.deepEqual(filtersForContactView(readPersonalFilters(legacy), undefined, 'cg'), travelling)
  assert.deepEqual(readPersonalFilters(rememberContactFilterView(legacy, 'cg')), travelling)
  for (const invalid of ['', 'broken json', 'null', '[]', '{"view":"other"}', '{"view":["gospel"]}']) {
    assert.equal(readPersonalFilterView(invalid), undefined)
  }
  assert.throws(() => rememberContactFilterView(legacy, 'other'), /Invalid contact list/)
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

test('Clear Filters restores only the assigned campus and location and clears other personal choices', () => {
  const offCampus = { id: 'off-north', name: 'Off Campus — North', area_type: 'off_campus', parent_id: north.id }
  for (const [area, expected] of [
    [north, { campus: north.id }],
    [central, { campus: central.id }],
    [bursley, { campus: north.id, location: bursley.id }],
    [offCampus, { campus: north.id, location: offCampus.id }],
    [null, {}],
  ]) {
    const reset = clearedPersonalFilters(area)
    const merged = { ...travelling, ...cardOnly, ...reset }
    assert.deepEqual(readPersonalFilters(JSON.stringify(merged)), expected)
    for (const key of ['floor', 'wing', 'gender', 'status', 'jesus', 'community', 'interview', 'kgp', 'interviewDone', 'invitedCg', 'roomOnly']) {
      assert.equal(reset[key], '')
    }
  }

  const affinity = { id: 'greek', name: 'Greek Life', area_type: 'affinity', parent_id: null }
  assert.deepEqual(clearedPersonalFilters(affinity), {
    campus: '', location: '', floor: '', wing: '', gender: '', status: '', jesus: '',
    community: '', interview: '', kgp: '', interviewDone: '', invitedCg: '', affinity: affinity.id, roomOnly: '',
    ...Object.fromEntries(additionalContactFilters.map(({ param }) => [param, ''])),
  })
})

test('all spreadsheet choices survive saving, card display changes, and reopening the same smart card', () => {
  const params = new URLSearchParams({ ...travelling, display: 'sheet', columns: 'email,text_cg', page: '4' })
  for (const [column, value] of [
    ['sheetJesus', 'yes,maybe,already_have_one'], ['sheetCommunity', 'maybe,unanswered'],
    ['sheetInterview', 'yes,no'], ['sheetStatus', 'attempted_contact'],
    ['sheetKgpShared', 'no'], ['sheetInterviewComplete', 'yes'], ['sheetInvitedCg', 'no'],
    ...additionalContactFilters.map(({ param, kind }) => [param, kind === 'email' || kind === 'text' ? 'missing' : 'no']),
  ]) updateSpreadsheetColumnFilter(params, column, value)

  const selected = normalizeSharedContactFilters(Object.fromEntries(params))
  const personal = readPersonalFilters(JSON.stringify(selected))
  assert.deepEqual(personal, {
    ...travelling, jesus: 'yes,maybe,already_have_one', community: 'maybe,unanswered', interview: 'yes,no',
    status: 'attempted_contact', kgp: 'not_shared', interviewDone: 'completed', invitedCg: 'not_invited',
    ...Object.fromEntries(additionalContactFilters.map(({ param, kind }) => [param, kind === 'email' || kind === 'text' ? 'missing' : 'no'])),
  })
  for (const display of ['cards', 'sheet']) {
    assert.deepEqual(readPersonalFilters(JSON.stringify(contactFiltersForDisplay(selected, display))), personal)
  }
  const cookie = JSON.stringify({ ...personal, view: 'gospel' })
  const reopened = filtersForContactView(readPersonalFilters(cookie), readPersonalFilterView(cookie), 'gospel')
  assert.deepEqual(reopened, personal)
  assert.deepEqual(filtersForContactView(reopened, 'gospel', 'cg'), travelling)
})

test('choosing Any or hiding a filtered column removes its saved choice without reviving older filters', () => {
  for (const clear of [
    (params, column) => updateSpreadsheetColumnFilter(params, column, ''),
    clearSpreadsheetColumnFilter,
  ]) {
    const params = new URLSearchParams({ ...travelling, jesus: 'yes,maybe', sheetTextCg: 'yes', invitedCg: 'invited' })
    for (const column of ['sheetTextCg', 'sheetInvitedCg']) clear(params, column)
    const personal = readPersonalFilters(JSON.stringify(normalizeSharedContactFilters(Object.fromEntries(params))))
    const returned = rememberContactFilterView(JSON.stringify({ ...personal, view: 'mine' }), 'mine')
    assert.deepEqual(readPersonalFilters(returned), { ...travelling, jesus: 'yes,maybe' })
  }
})

test('additional spreadsheet restrictions count as explicit filters and are cleared with other personal choices', () => {
  for (const { param } of additionalContactFilters) {
    assert.ok(personalFilterKeys.includes(param))
    assert.equal(shouldRestorePersonalFilters('cg', { [param]: 'no' }), false)
    assert.equal(shouldRestorePersonalFilters('cg', { [param]: '' }), false)
    assert.equal(clearedPersonalFilters(bursley)[param], '')
  }
})

test('clearing in No Address saves the default area for other cards while keeping its own results campus-wide', () => {
  const reset = clearedPersonalFilters(bursley)
  const stored = JSON.stringify({ ...reset, view: 'noaddress' })
  assert.deepEqual(withoutGeographicFilters(readPersonalFilters(stored)), {})
  assert.deepEqual(filtersForContactView(readPersonalFilters(stored), 'noaddress', 'cg'), {
    campus: north.id, location: bursley.id,
  })
})

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

test('Home follows the saved area, including an explicit choice to see All Campus', () => {
  assert.deepEqual(homeFilterAreaContext(undefined, areas, bursley), {
    areaLabel: 'Bursley', showReturnToDefault: false,
  })
  assert.deepEqual(homeFilterAreaContext({}, areas, bursley), {
    areaLabel: 'All Campus', showReturnToDefault: true,
  })
  assert.deepEqual(homeFilterAreaContext({ campus: central.id }, areas, bursley), {
    areaLabel: 'Central Campus', showReturnToDefault: true,
  })
  assert.deepEqual(homeFilterAreaContext({ campus: north.id, location: bursley.id }, areas, north), {
    areaLabel: 'Bursley', showReturnToDefault: true,
  })
})

test('Home recognizes the assigned dorm with or without its campus and keeps non-area choices separate', () => {
  for (const campus of ['', north.id]) {
    assert.deepEqual(homeFilterAreaContext({
      campus, location: bursley.id, floor: '3', wing: '2', gender: 'male', jesus: 'yes,maybe',
    }, areas, bursley), {
      areaLabel: 'Bursley', showReturnToDefault: false,
    })
  }
})

test('Home handles affinity, off-campus, and combined area selections', () => {
  const affinity = { id: 'greek', name: 'Greek Life', area_type: 'affinity', parent_id: null }
  const offCampus = { id: 'off-north', name: 'Off Campus — North', area_type: 'off_campus', parent_id: north.id }
  const allAreas = [...areas, affinity, offCampus]
  for (const area of [affinity, offCampus]) {
    assert.deepEqual(homeFilterAreaContext(assignedAreaFilters(area), allAreas, area), {
      areaLabel: area.name, showReturnToDefault: false,
    })
  }
  assert.deepEqual(homeFilterAreaContext({ campus: north.id, affinity: affinity.id }, allAreas, affinity), {
    areaLabel: 'North Campus · Greek Life', showReturnToDefault: true,
  })
  assert.deepEqual(homeFilterAreaContext({ location: bursley.id, affinity: affinity.id }, allAreas, bursley), {
    areaLabel: 'Bursley · Greek Life', showReturnToDefault: true,
  })
})

test('Home labels special locations', () => {
  for (const [location, areaLabel] of [['no_address', 'No Address'], ['needs_area_assignment', 'Needs Area Assignment']]) {
    assert.deepEqual(homeFilterAreaContext({ location }, areas, bursley), {
      areaLabel, showReturnToDefault: true,
    })
  }
})

test('All Campus defaults offer a return from narrower areas, then hide it after resetting', () => {
  const affinity = { id: 'greek', name: 'Greek Life', area_type: 'affinity', parent_id: null }
  const allAreas = [...areas, affinity]
  for (const [selection, areaLabel] of [
    [{ campus: north.id }, 'North Campus'],
    [{ campus: north.id, location: bursley.id, floor: '3', wing: '2' }, 'Bursley'],
    [{ affinity: affinity.id }, 'Greek Life'],
  ]) {
    const saved = { ...selection, gender: 'male', jesus: 'yes,maybe' }
    assert.deepEqual(homeFilterAreaContext(saved, allAreas, null), {
      areaLabel, showReturnToDefault: true,
    })
    const restored = readPersonalFilters(JSON.stringify({ ...saved, ...assignedAreaFilters(null) }))
    assert.deepEqual(restored, { gender: 'male', jesus: 'yes,maybe' })
    assert.deepEqual(homeFilterAreaContext(restored, allAreas, null), {
      areaLabel: 'All Campus', showReturnToDefault: false,
    })
  }
  for (const saved of [undefined, {}, { gender: 'male' }]) {
    assert.deepEqual(homeFilterAreaContext(saved, allAreas, null), {
      areaLabel: 'All Campus', showReturnToDefault: false,
    })
  }
})
