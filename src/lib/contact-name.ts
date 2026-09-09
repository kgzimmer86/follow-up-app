export function contactDisplayName(
  value: string | null | undefined
) {
  return value?.trim() || '?'
}
