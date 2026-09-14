import type { InvitationFilters } from '@/components/community/invitation-contact-filters'

// Browser-memory only: no contacts, assignments, or selections are retained.
type Snapshot = { eventId: string; query: string; filters: InvitationFilters }
const saved = new Map<string, Snapshot>()
export function readInvitationFilters(key: string) { return saved.get(key) }
export function rememberInvitationFilters(key: string, snapshot: Snapshot) { saved.set(key, snapshot) }
export function clearInvitationFilters() { saved.clear() }
