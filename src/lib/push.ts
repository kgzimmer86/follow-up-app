export type PushSnapshot = { contacts: number; invitations: number; groups: number; total: number; fingerprint: string }

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
  return `${snapshot.total} attention ${snapshot.total === 1 ? 'item' : 'items'}: ${snapshot.contacts} contacts, ${snapshot.invitations} invitations, ${snapshot.groups} group follow-ups. Open Follow Up to review.`
}
