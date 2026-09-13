export function isNoActiveCampaignError(message: string) {
  return /^No active (Follow[ -]Up )?campaign( exists)?\.?$/i.test(message)
}

export function selectCommunityCampaign<T extends { id: string; status: string }>(campaigns: T[], requested?: string) {
  return campaigns.find(c => c.id === requested) ?? campaigns.find(c => c.status === 'active') ?? campaigns[0]
}

export function isMeetingDateAllowed(date: string, starts: string, ends: string, today: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date && date >= starts && date <= ends && date <= today
}
