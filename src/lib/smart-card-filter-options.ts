export const statusOptions = [
  { value: 'uncontacted', label: 'Uncontacted' },
  { value: 'attempted_contact', label: 'Attempted contact' },
  { value: 'go_back', label: 'Go back' },
  { value: 'involved', label: 'Involved' },
  { value: 'not_interested', label: 'Not interested' },
]

export function hasExtendedFilters(view: string) {
  return !['gospel', 'cg'].includes(view)
}

export function locksNotInterested(view: string) {
  return ['mine', 'goback', 'gospel', 'new', 'cg', 'noaddress'].includes(view)
}

export function selectedStatuses(value: string, locked: boolean) {
  const allowed = statusOptions.filter(option => !locked || option.value !== 'not_interested')
  return allowed.filter(option => !value || value.split(',').includes(option.value)).map(option => option.value)
}

// Empty status selection must mean zero matches, not silently revert to Any.
export function statusFilterValue(values: string[], locked: boolean) {
  const selected = selectedStatuses(values.join(',') || '__no_matches', locked)
  const allowed = selectedStatuses('', locked)
  return selected.length === allowed.length ? '' : selected.join(',') || '__no_matches'
}

export function affinityFilterValue(values: string[]) {
  return [...new Set(values.flatMap(value => value.split(',')))].filter(value => /^[0-9a-f-]{36}$/i.test(value)).join(',')
}
