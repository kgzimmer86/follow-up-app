export const spreadsheetColumnOptions = [
  { value: 'email', label: 'Email' },
  { value: 'text_cg', label: 'Texted CG' },
  { value: 'text_acg', label: 'Texted ACG' },
  { value: 'text_appointment', label: 'Texted appointment' },
  { value: 'text_event', label: 'Texted another event' },
  { value: 'text_follow_up', label: 'Texted general follow-up' },
  { value: 'invited_cg', label: 'Invited to CG' },
  { value: 'latest_text', label: 'Latest text' },
] as const

export type SpreadsheetColumnKey = typeof spreadsheetColumnOptions[number]['value']

export function parseSpreadsheetColumns(value: string | undefined) {
  const requested = new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  )

  return spreadsheetColumnOptions
    .map((option) => option.value)
    .filter((key) => requested.has(key))
}
