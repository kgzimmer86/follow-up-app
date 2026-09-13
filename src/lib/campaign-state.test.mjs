import test from 'node:test'
import assert from 'node:assert/strict'
import { isNoActiveCampaignError, selectCommunityCampaign, isMeetingDateAllowed } from './campaign-state.ts'

test('only known missing-campaign messages become empty states', () => {
  for (const s of ['No active Follow Up campaign', 'No active Follow Up campaign exists.', 'No active follow-up campaign exists']) assert.equal(isNoActiveCampaignError(s), true)
  for (const s of ['Network error', 'Management access required', 'permission denied']) assert.equal(isNoActiveCampaignError(s), false)
})
test('archived years stay reachable with no active campaign', () => {
  const archived = {id:'old',status:'archived'}, active = {id:'new',status:'active'}
  assert.equal(selectCommunityCampaign([archived]), archived)
  assert.equal(selectCommunityCampaign([archived, active]), active)
  assert.equal(selectCommunityCampaign([archived, active], 'old'), archived)
  assert.equal(selectCommunityCampaign([]), undefined)
})
test('URL dates cannot bypass campaign and future boundaries', () => {
  const allowed = date => isMeetingDateAllowed(date,'2026-08-01','2027-07-31','2026-09-12')
  for (const date of ['2026-08-01','2026-09-11','2026-09-12']) assert.equal(allowed(date), true)
  for (const date of ['2026-07-31','2027-08-01','2026-09-13','2026-02-30','invalid']) assert.equal(allowed(date), false)
})
