export const personalFilterKeys = [
  'campus', 'location', 'gender', 'status', 'jesus', 'community',
  'interview', 'kgp', 'interviewDone', 'affinity', 'floor', 'wing', 'roomOnly',
  'invitedCg',
] as const

const contactFilterViews = ['mine', 'goback', 'gospel', 'new', 'cg', 'noaddress', 'area'] as const
const travellingFilterKeys = ['campus', 'location', 'floor', 'wing', 'gender', 'affinity'] as const
type PersonalFilters = Partial<Record<typeof personalFilterKeys[number], string>>

export function personalFilterCookie(userId: string) {
  return `follow-up-filters-${userId}`
}

export function resetChangedDormFilters<T extends { location: string; floor: string; wing: string }>(
  filters: T,
  previousLocation: string,
): T {
  return filters.location === previousLocation
    ? filters
    : { ...filters, floor: '', wing: '' }
}

// Keep only filter values. The owning card is read separately from the cookie.
export function readPersonalFilters(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const record = parsed as Record<string, unknown>
    return Object.fromEntries(personalFilterKeys.flatMap((key) => {
      const item = record[key]
      return typeof item === 'string' && item.length <= 200 && item
        ? [[key, item]]
        : []
    })) as Partial<Record<typeof personalFilterKeys[number], string>>
  } catch {
    return {}
  }
}

export function readPersonalFilterView(value: string) {
  try {
    const view: unknown = JSON.parse(value)?.view
    return contactFilterViews.find((candidate) => candidate === view)
  } catch {
    return undefined
  }
}

function filtersForCardChange(filters: PersonalFilters, savedView: string | undefined, view: string): PersonalFilters {
  return savedView === view ? { ...filters }
    : Object.fromEntries(travellingFilterKeys.flatMap((key) => filters[key] ? [[key, filters[key]]] : []))
}

export function filtersForContactView(filters: PersonalFilters, savedView: string | undefined, view: string) {
  const personal = filtersForCardChange(filters, savedView, view)
  return view === 'noaddress' ? withoutGeographicFilters(personal) : personal
}

export function rememberContactFilterView(value: string, view: string) {
  if (!contactFilterViews.some((candidate) => candidate === view)) throw new Error('Invalid contact list.')
  const filters = readPersonalFilters(value)
  // Keep the saved geography while visiting No Address, so it is available
  // when the user returns to a list that can use it.
  const personal = filtersForCardChange(filters, readPersonalFilterView(value), view)
  return JSON.stringify({ ...personal, view })
}

export function shouldRestorePersonalFilters(
  view: string,
  params: { context?: string } & Partial<Record<typeof personalFilterKeys[number], string | string[]>>,
) {
  return contactFilterViews.some((candidate) => candidate === view) && params.context !== '1' &&
    !personalFilterKeys.some((key) => params[key] !== undefined)
}

// These describe the existing get_follow_up_contact_results rules. Do not send
// these as personal RPC parameters: survey rules across fields use OR, not AND.
export function smartCardCriteria(view: string) {
  const interested = 'Jesus, Community or Interview: Yes or Maybe in at least one'
  const pursuing = 'Status: excludes Not Interested'
  switch (view) {
    case 'mine': return ['Assigned to you as the primary follow-up person']
    case 'goback': return ['You have personally recorded an interaction', pursuing]
    case 'gospel': return [
      pursuing, 'KGP shared: No',
      'Jesus: Yes or Maybe OR Interview: Yes or Maybe (either qualifies)',
    ]
    case 'cg': return [
      pursuing, 'Community: Yes or Maybe',
    ]
    case 'new': return [
      pursuing, interested,
      'No interactions recorded by anyone',
    ]
    case 'noaddress': return ['Location: No address', pursuing, interested]
    default: return []
  }
}

export type FilterArea = {
  id: string
  name: string
  area_type: string
  parent_id: string | null
}

export const geographicFilterKeys = ['campus', 'location', 'floor', 'wing'] as const

export function assignedAreaFilters(area: FilterArea | null) {
  const filters = { campus: '', location: '', floor: '', wing: '', affinity: '' }
  if (!area) return filters
  if (area.area_type === 'affinity') filters.affinity = area.id
  else if (area.area_type === 'campus_region') filters.campus = area.id
  else {
    filters.campus = area.parent_id ?? ''
    filters.location = area.id
  }
  return filters
}

export function clearedPersonalFilters(area: FilterArea | null) {
  const empty = Object.fromEntries(personalFilterKeys.map((key) => [key, ''])) as Record<typeof personalFilterKeys[number], string>
  const defaults = assignedAreaFilters(area)
  return {
    ...empty,
    campus: defaults.campus,
    location: defaults.location,
    affinity: defaults.affinity,
  }
}

export function homeFilterAreaContext(
  saved: Partial<Record<typeof personalFilterKeys[number], string>> | undefined,
  areas: FilterArea[],
  defaultArea: FilterArea | null,
) {
  // An absent preference starts in the assigned area; an explicitly empty
  // preference means All Campus.
  const defaults = assignedAreaFilters(defaultArea)
  const filters = saved ?? defaults
  const location = areas.find((area) => area.id === filters.location)
  const campus = areas.find((area) => area.id === filters.campus)
  const affinity = areas.find((area) => area.id === filters.affinity)
  const locationLabel = filters.location === 'no_address' ? 'No Address'
    : filters.location === 'needs_area_assignment' ? 'Needs Area Assignment'
      : location?.name
  const areaLabel = [locationLabel || campus?.name, affinity?.name]
    .filter(Boolean).join(' · ') || 'All Campus'

  // Selecting the assigned dorm under All areas has the same scope as
  // selecting that dorm along with its parent campus.
  const selectedCampus = filters.campus || location?.parent_id || ''
  const isDefaultArea = selectedCampus === defaults.campus &&
    (filters.location || '') === defaults.location &&
    (filters.affinity || '') === defaults.affinity

  // No specific assignment means All Campus, which is still a valid default.
  return { areaLabel, showReturnToDefault: !isDefaultArea }
}

export function withoutGeographicFilters<T extends Partial<Record<typeof geographicFilterKeys[number], string>>>(filters: T): T {
  const next = { ...filters }
  for (const key of geographicFilterKeys) delete next[key]
  return next
}

export function resetChangedCampusFilters<T extends { campus: string; location: string; floor: string; wing: string }>(
  filters: T, previousCampus: string, areas: FilterArea[],
): T {
  if (filters.campus === previousCampus) return filters
  const location = areas.find((area) => area.id === filters.location)
  return filters.campus && location?.parent_id === filters.campus
    ? filters
    : { ...filters, location: '', floor: '', wing: '' }
}
