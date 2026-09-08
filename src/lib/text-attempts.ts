export const textPurposes = [
  { value: 'invite_cg', label: 'Invite to CG' },
  { value: 'invite_acg', label: 'Invite to ACG' },
  { value: 'appointment', label: 'Set appointment' },
  { value: 'invite_event', label: 'Invite to another event' },
  { value: 'follow_up', label: 'General follow-up' },
] as const

export type TextPurpose = typeof textPurposes[number]['value']

export type TextAttemptDetails = {
  text_purposes: string[] | null
  text_event_name: string | null
}

export function textPurposeSummary(purposes: string[] | null, eventName: string | null) {
  return textPurposes.filter((purpose) => purposes?.includes(purpose.value))
    .map((purpose) => purpose.value === 'invite_event' && eventName?.trim()
      ? `Invite to ${eventName.trim()}` : purpose.label)
    .join(' · ') || 'Text attempt'
}

export function validateTextAttempt(purposes: string[], eventName: string, notes: string) {
  if (purposes.length === 0) return 'Choose at least one text purpose.'
  if (purposes.some((value) => !textPurposes.some((purpose) => purpose.value === value))) {
    return 'Choose one of the listed text purposes.'
  }
  if (purposes.includes('invite_event') && !eventName.trim()) return 'Enter the event name.'
  if (eventName.trim().length > 100) return 'Keep the event name to 100 characters or fewer.'
  if (notes.trim().length > 2000) return 'Keep the note to 2,000 characters or fewer.'
  return null
}

export function followUpActivityLabel(eventType: string) {
  if (eventType === 'knock') return 'Knocked'
  if (eventType === 'text_attempt') return 'Text attempt'
  return 'Interaction'
}

export type TextContact = { id: string; name: string }
export type PendingTextAttempt = {
  eventId: string
  contact: TextContact
  startedAt: number
  stage: 'waiting' | 'confirm' | 'form'
}

export function readPendingTextAttempt(raw: string | null, now = Date.now()): PendingTextAttempt | null {
  try {
    const value = JSON.parse(raw ?? 'null')
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!value || typeof value.eventId !== 'string' || !uuid.test(value.eventId) ||
      typeof value.contact?.id !== 'string' || !uuid.test(value.contact.id) ||
      typeof value.contact?.name !== 'string' || !value.contact.name.trim() ||
      !['waiting', 'confirm', 'form'].includes(value.stage) ||
      typeof value.startedAt !== 'number' || value.startedAt > now ||
      now - value.startedAt > 24 * 60 * 60 * 1000) return null
    return value as PendingTextAttempt
  } catch { return null }
}

export function createTextAttemptSession(userId: string, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null) {
  const key = `follow-up-pending-text-${userId}`
  let pending: PendingTextAttempt | null = null
  let leftApp = false
  try {
    if (storage) {
      pending = readPendingTextAttempt(storage?.getItem(key))
      // A restored document cannot rely on having observed the departure.
      if (pending?.stage === 'waiting') pending = { ...pending, stage: 'confirm' }
    }
  } catch { /* The current page still works when storage is unavailable. */ }
  const listeners = new Set<() => void>()
  function update(value: PendingTextAttempt | null) {
    pending = value
    try {
      if (value) storage?.setItem(key, JSON.stringify(value))
      else storage?.removeItem(key)
    } catch { /* Retain the in-memory attempt. */ }
    for (const listener of listeners) listener()
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => pending,
    begin(contact: TextContact, stage: 'waiting' | 'form') {
      leftApp = false
      update({ eventId: crypto.randomUUID(), contact, startedAt: Date.now(), stage })
    },
    leave() { if (pending?.stage === 'waiting') leftApp = true },
    resume() {
      if (leftApp && pending?.stage === 'waiting') update({ ...pending, stage: 'confirm' })
      leftApp = false
    },
    confirm() { if (pending) update({ ...pending, stage: 'form' }) },
    dismiss() { leftApp = false; update(null) },
  }
}
