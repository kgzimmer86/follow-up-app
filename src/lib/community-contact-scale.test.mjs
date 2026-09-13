import assert from 'node:assert/strict'
import test from 'node:test'
import { scopedContactRows } from './community-contact-scope.ts'

// Synthetic RPC responses only: no network, credentials, or database writes.
for (const total of [1000, 5000, 10000]) {
  test(`${total} authorized contacts: late matches and multi-page group results`, async t => {
    const source = Array.from({ length: total }, (_, i) => ({ id: `contact-${i}` }))
    const wanted = source.slice(-125).map(row => row.id)
    const pageSize = 50
    let requests = 1
    const page = n => ({ campaign_id: 'test', total_count: total, rows: source.slice((n - 1) * pageSize, n * pageSize) })
    const start = performance.now()
    const result = await scopedContactRows(page(1), 'test', wanted, pageSize, async n => {
      requests++
      return page(n)
    })
    assert.deepEqual(result, source.slice(-125))
    assert.equal(requests, total / pageSize)
    assert.equal(result.slice(0, 50).length, 50)
    assert.equal(result.slice(50, 100).length, 50)
    assert.equal(result.slice(100, 150).length, 25)
    t.diagnostic(`${requests} sequential RPC requests; ${(performance.now() - start).toFixed(2)} ms local processing (NOT network latency). At an assumed 100 ms/request: ${(requests * 0.1).toFixed(1)} seconds before other page work.`)
  })
}

test('unavailable contact forces full scan without leaking unrelated rows', async t => {
  const total = 5000
  let requests = 1
  const page = n => ({ campaign_id: 'test', total_count: total, rows: Array.from({ length: 50 }, (_, i) => ({ id: `contact-${(n - 1) * 50 + i}` })) })
  const result = await scopedContactRows(page(1), 'test', ['contact-0', 'not-authorized'], 50, async n => { requests++; return page(n) })
  assert.deepEqual(result, [{ id: 'contact-0' }])
  assert.equal(requests, 100)
  t.diagnostic('100 requests even with just one visible match when another requested contact is inaccessible or excluded by filters.')
})

test('large list with early matches stops after first page', async () => {
  const first = { campaign_id: 'test', total_count: 10000, rows: [{ id: 'first' }] }
  assert.deepEqual(await scopedContactRows(first, 'test', ['first'], 50, async () => { throw new Error('Unnecessary request') }), first.rows)
})
