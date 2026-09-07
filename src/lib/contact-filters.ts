export const personalFilterKeys = [
  'campus', 'location', 'gender', 'status', 'jesus', 'community',
  'interview', 'kgp', 'interviewDone', 'affinity', 'floor', 'wing', 'roomOnly',
] as const

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

// Keep only filter values; card identity, pagination and display never travel.
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

export function shouldRestorePersonalFilters(
  view: string,
  params: { context?: string } & Partial<Record<typeof personalFilterKeys[number], string | string[]>>,
) {
  return ['mine', 'goback', 'gospel', 'new', 'cg', 'noaddress', 'area'].includes(view) && params.context !== '1' &&
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
