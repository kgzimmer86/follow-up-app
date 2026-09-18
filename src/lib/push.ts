export type PushSnapshot = {
  suppressContactReminder?: boolean
  contacts: number; invitations: number; groups: number; nextSteps?: number; total: number; fingerprint: string
  attentionContactId?: string | null; attentionContactName?: string | null; attentionCategory?: string | null
  nextStepContactName?: string | null; staleContactName?: string | null; staleContactId?: string | null
}

// Sending an authenticated user's endpoint must never become an SSRF primitive.
export function validPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash &&
      url.pathname.length > 1 && endpoint.length <= 2048 &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/.test(url.hostname)
  } catch { return false }
}

export function pushBody(snapshot: PushSnapshot) {
  if (snapshot.total === 0) return 'You have no follow-up items needing attention right now.'
  if (snapshot.nextSteps && snapshot.nextStepContactName?.trim()) return `How did it go with ${snapshot.nextStepContactName.trim().slice(0, 100)}? Record an interaction, reschedule, edit, or clear your step.`
  if (snapshot.nextSteps) return `${snapshot.nextSteps} planned ${snapshot.nextSteps === 1 ? 'step is' : 'steps are'} ready to review. How did it go? Open Follow Up to record an interaction, reschedule, edit, or clear a step. ${snapshot.total} attention items in total.`
  if (snapshot.attentionContactName?.trim() && snapshot.attentionCategory === 'awaiting') return `Contact assigned: ${snapshot.attentionContactName.trim().slice(0, 100)}.`
  if (snapshot.attentionContactName?.trim()) return `What’s your next step with ${snapshot.attentionContactName.trim().slice(0, 100)}?`
  if (snapshot.staleContactName?.trim()) return `What’s your next step with ${snapshot.staleContactName.trim().slice(0, 100)}?`
  return `${snapshot.total} attention ${snapshot.total === 1 ? 'item' : 'items'}: ${snapshot.contacts} contacts, ${snapshot.invitations} invitations, ${snapshot.groups} group follow-ups. Open Follow Up to review.`
}

export function pushDestination(snapshot: PushSnapshot) {
  if (snapshot.nextSteps) return '/contacts/next-steps'
  if (snapshot.attentionContactId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(snapshot.attentionContactId) && ['awaiting', 'stale', 'new-believers'].includes(snapshot.attentionCategory ?? '')) {
    return `/contacts?context=1&attention=${snapshot.attentionCategory}&contact=${snapshot.attentionContactId}`
  }
  if (snapshot.staleContactId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(snapshot.staleContactId)) {
    return `/contacts?context=1&attention=stale&contact=${snapshot.staleContactId}`
  }
  return '/notifications'
}
