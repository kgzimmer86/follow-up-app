import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const page = readFileSync(new URL('./[discipleId]/page.tsx', import.meta.url), 'utf8')
const contact = readFileSync(new URL('../contacts/[contactId]/page.tsx', import.meta.url), 'utf8')

test('both attention queues retain the disciple and attention section', () => {
  assert.equal(page.match(/returnTo=\{`\/disciples\/\$\{discipleId\}#needs-attention`\}/g)?.length, 2)
  assert.ok(page.includes('query: { from: returnTo }'))
})

test('assigned contacts and activity retain their originating sections', () => {
  for (const section of ['assigned-contacts', 'recent-activity']) {
    assert.ok(page.includes('query: { from: `/disciples/${discipleId}#' + section + '` }'))
  }
  assert.doesNotMatch(page, /href=\{`\/contacts\//)
})

test('return sections remain anchored even when their lists become empty', () => {
  for (const section of ['needs-attention', 'assigned-contacts', 'recent-activity']) {
    assert.ok(page.includes(`id="${section}"`))
  }
  assert.match(page, /<section id=\{id\} className="scroll-mt-28/)
})

test('contact detail still uses the safe return destination and preserves it in tab links', () => {
  assert.ok(contact.includes('safeReturnTo(query.from)'))
  assert.ok(contact.includes('href={returnTo}'))
  assert.ok(contact.includes('from: returnTo,'))
  assert.ok(contact.includes("!value.startsWith('//')"))
})
