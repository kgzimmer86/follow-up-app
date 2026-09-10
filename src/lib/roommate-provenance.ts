import type { SupabaseClient } from '@supabase/supabase-js'
import { contactDisplayName } from './contact-name'

export type RoommateSource = { id: string; name: string }

// Batch only the displayed contacts; use the signed-in client's read permissions.
export async function loadRoommateSources(client: SupabaseClient, ids: string[]) {
  const sources = new Map<string, RoommateSource[]>()
  if (!ids.length) return sources
  try {
    const [outgoing, incoming] = await Promise.all([
      client.from('follow_up_contacts').select('id, field_added_from_contact_id')
        .in('id', ids).eq('field_added_relationship', 'roommate').not('field_added_from_contact_id', 'is', null),
      client.from('follow_up_contacts').select('id, field_added_from_contact_id')
        .in('field_added_from_contact_id', ids).eq('field_added_relationship', 'roommate'),
    ])
    if (outgoing.error || incoming.error) throw outgoing.error || incoming.error
    const relationships = [...(outgoing.data ?? []), ...(incoming.data ?? [])]
    if (!relationships.length) return sources
    const displayed = new Set(ids)
    const neighbors = new Map<string, Set<string>>()
    function add(id: string, neighbor: string) {
      if (!displayed.has(id) || !neighbor || id === neighbor) return
      if (!neighbors.has(id)) neighbors.set(id, new Set())
      neighbors.get(id)!.add(neighbor)
    }
    for (const row of relationships) {
      add(row.id, row.field_added_from_contact_id)
      add(row.field_added_from_contact_id, row.id)
    }
    const sourceIds = [...new Set([...neighbors.values()].flatMap((values) => [...values]))]
    if (!sourceIds.length) return sources
    const { data: contacts, error: contactError } = await client.from('follow_up_contacts')
      .select('id, student_id').in('id', sourceIds)
    if (contactError) throw contactError
    if (!contacts?.length) return sources
    const { data: students, error: studentError } = await client.from('students')
      .select('id, display_name').in('id', [...new Set(contacts.map((row) => row.student_id as string))])
    if (studentError) throw studentError
    const names = new Map((students ?? []).map((row) => [row.id, contactDisplayName(row.display_name)]))
    const byId = new Map(contacts.filter((row) => names.has(row.student_id)).map((row) => [row.id, { id: row.id as string, name: names.get(row.student_id)! }]))
    for (const [id, relatedIds] of neighbors) {
      const roommates = [...relatedIds].map((relatedId) => byId.get(relatedId))
        .filter((person): person is RoommateSource => Boolean(person))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      if (roommates.length) sources.set(id, roommates)
    }
  } catch {
    // Optional provenance must not prevent opening the contact list.
    console.error('Roommate labels could not be loaded.')
  }
  return sources
}
