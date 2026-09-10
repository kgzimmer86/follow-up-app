export const personalReportPeriods = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'campaign', label: 'Full campaign' },
] as const
export type PersonalReportPeriod = typeof personalReportPeriods[number]['value']
export function personalReportPeriod(value: string | string[] | undefined): PersonalReportPeriod {
  return value === 'month' || value === 'campaign' ? value : 'week'
}
