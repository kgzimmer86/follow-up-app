export const personalFilterKeys = [
  'campus', 'location', 'gender', 'status', 'jesus', 'community',
  'interview', 'kgp', 'interviewDone', 'affinity', 'floor', 'wing', 'roomOnly',
] as const

export function personalFilterCookie(userId: string) {
  return `follow-up-filters-${userId}`
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
  return view !== 'area' && params.context !== '1' &&
    !personalFilterKeys.some((key) => params[key] !== undefined)
}

// These describe the existing get_follow_up_contact_results rules. Do not send
// these as personal RPC parameters: survey rules across fields use OR, not AND.
export function smartCardCriteria(view: string, areaName: string) {
  const interested = 'Jesus, Community or Interview: Yes or Maybe in at least one'
  const pursuing = 'Status: excludes Not Interested'
  switch (view) {
    case 'mine': return ['Assigned to you as the primary follow-up person']
    case 'goback': return ['You have personally recorded an interaction', pursuing]
    case 'gospel': return [
      `Ministry area: ${areaName}`, pursuing, 'KGP shared: No',
      'Jesus: Yes or Maybe OR Interview: Yes or Maybe (either qualifies)',
    ]
    case 'cg': return [
      `Ministry area: ${areaName}`, pursuing, 'Community: Yes or Maybe',
    ]
    case 'new': return [
      `Ministry area: ${areaName}`, pursuing, interested,
      'No interactions recorded by anyone',
    ]
    case 'noaddress': return ['Location: No address', pursuing, interested]
    default: return []
  }
}
