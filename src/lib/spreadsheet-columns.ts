export const spreadsheetColumnOptions = [
  { value: 'email', label: 'Email', filterParam: 'sheetEmail' },
  { value: 'text_cg', label: 'Texted CG', filterParam: 'sheetTextCg' },
  { value: 'text_acg', label: 'Texted ACG', filterParam: 'sheetTextAcg' },
  { value: 'text_appointment', label: 'Texted appointment', filterParam: 'sheetTextAppointment' },
  { value: 'text_event', label: 'Texted another event', filterParam: 'sheetTextEvent' },
  { value: 'text_follow_up', label: 'Texted general follow-up', filterParam: 'sheetTextFollowUp' },
  { value: 'invited_cg', label: 'Invited to CG', filterParam: 'sheetInvitedCg' },
  { value: 'latest_text', label: 'Latest text', filterParam: 'sheetLatestText' },
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
