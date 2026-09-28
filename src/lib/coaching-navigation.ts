// Only coaching entry pages may be used as a return destination.
export function coachingReturnTo(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || /[\\\s]/.test(value)) return '/disciples'
  if (!/^\/(?:disciples(?:\/[\w-]+)?|manage\/leaders|manage\/areas\/[\w-]+)(?:[?#]|$)/.test(value)) return '/disciples'
  return value
}

export function coachingPageHref(discipleId: string, from: string): string {
  return `/disciples/${encodeURIComponent(discipleId)}?${new URLSearchParams({ from: coachingReturnTo(from) })}`
}
