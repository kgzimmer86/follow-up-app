export const nextStepsEnabled = process.env.NEXT_PUBLIC_NEXT_STEPS_ENABLED === 'true'
export const nextStepsChangedEvent = 'follow-up-next-steps-changed'

export type NextStep = {
  id: string
  contact_id: string
  action: string
  due_at: string
  version: number
  display_name: string
  contact_status: string
  is_primary: boolean
}

export function nextStepsChanged() {
  window.dispatchEvent(new Event(nextStepsChangedEvent))
}

// datetime-local values deliberately use the leader's device timezone. The
// database stores the chosen instant, so travel never moves a saved reminder.
export function localDateTime(value: string | Date) {
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function plannedInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(value)
  // Reject impossible dates and the missing hour during the spring DST change.
  if (!Number.isFinite(date.getTime()) || localDateTime(date) !== value) return null
  return date.toISOString()
}

export function nextStepInputError(action: string, due: string, now = Date.now()) {
  if (!action.trim() || action.trim().length > 500) return 'Write a next step between 1 and 500 characters.'
  const instant = plannedInstant(due)
  if (!instant || Date.parse(instant) <= now) return 'Choose a future date and time.'
  if (Date.parse(instant) > now + 366 * 86400000) return 'Choose a time within the next year.'
  return null
}
