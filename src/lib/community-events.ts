export type CommunityEvent = {
  id: string; campaign_id: string; name: string; event_date: string; location: string;
  details: string; is_open: boolean; revision: number
}
export const invitationStatuses = [
  { value: 'not_asked', label: 'Not asked' },
  { value: 'invited', label: 'Invited' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'coming', label: 'Coming' },
  { value: 'cant_come', label: 'Can’t come' },
] as const
export type InvitationStatus = typeof invitationStatuses[number]['value']
