import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGroupSummaries } from './community-summaries.ts'

test('summary transport is bounded to 100 groups and restores the original display mapping', async () => {
  const groups = Array.from({ length: 205 }, (_, i) => ({ id: `group-${i}`, campaign_id: 'campaign', is_active: true }))
  const calls = []
  const client = {
    async rpc(name, args) {
      assert.equal(name, 'get_community_group_summaries')
      calls.push(args.p_group_ids)
      return { data: args.p_group_ids.map(group_id => ({ group_id, ever_attended: 1103, involved: 2, attended: 1, needs_attention: 0, latest_meeting_date: '2026-09-14' })), error: null }
    },
    from() { throw new Error('History should not be loaded when summaries are installed') },
  }
  const summaries = await loadGroupSummaries(client, groups, true)
  assert.deepEqual(calls.map(ids => ids.length), [100, 100, 5])
  assert.equal(summaries.size, groups.length)
  for (const g of groups) assert.equal(summaries.get(g.id).ever_attended, 1103)
  assert.equal((await loadGroupSummaries(client, [], true)).size, 0)
})

test('missing SQL uses the original reads; permission, network and incomplete results are not hidden', async () => {
  const group = { id: 'group', campaign_id: 'campaign', is_active: true }
  let legacyReads = 0
  const client = {
    async rpc(name) {
      return name === 'get_community_group_summaries'
        ? { data: null, error: { code: 'PGRST202' } }
        : { count: 1, error: null }
    },
    from(table) {
      legacyReads++
      let head = false
      return {
        select(_columns, options) { head = options?.head; return this },
        eq() { return this }, is() { return this }, in() { return this }, order() { return this }, range() { return this }, limit() { return this },
        then(resolve) {
          return Promise.resolve({ error: null, count: head ? 1 : null, data: head ? null
            : table === 'community_group_meetings' ? [{ id: 'meeting', meeting_date: '2026-09-14' }]
            : table === 'community_group_memberships' ? [{ student_id: 'person' }]
            : [{ student_id: 'person' }, { student_id: 'person' }, { student_id: 'former' }] }).then(resolve)
        },
      }
    },
  }
  assert.deepEqual((await loadGroupSummaries(client, [group], true)).get(group.id), {
    group_id: group.id, involved: 1, attended: 1, ever_attended: 2, needs_attention: 1, latest_meeting_date: '2026-09-14',
  })
  assert(legacyReads > 0)
  assert.equal((await loadGroupSummaries(client, [group], false)).get(group.id).needs_attention, 0)
  for (const code of ['42501', '503']) {
    await assert.rejects(loadGroupSummaries({ rpc: async () => ({ error: { code, message: 'unavailable' } }), from() { throw new Error('incorrect fallback') } }, [group], true), /unavailable/)
  }
  await assert.rejects(loadGroupSummaries({ rpc: async () => ({ data: [], error: null }) }, [group], true), /all Community Group summaries/)
})
