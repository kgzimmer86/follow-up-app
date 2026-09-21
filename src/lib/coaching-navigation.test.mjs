import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { coachingPageHref, coachingReturnTo } from './coaching-navigation.ts'

test('coaching origin survives contact round trips and nested coaching pages', () => {
  for (const origin of ['/disciples', '/manage/leaders?q=Test&area=test-area', '/manage/areas/test-area']) {
    const coaching = coachingPageHref('test-person', origin)
    const contact = new URL('/contacts/test-contact', 'https://example.invalid')
    contact.searchParams.set('from', `${coaching}#needs-attention`)
    const returned = new URL(contact.searchParams.get('from'), contact.origin)
    assert.equal(returned.hash, '#needs-attention')
    assert.equal(coachingReturnTo(returned.searchParams.get('from')), origin)
    const child = new URL(coachingPageHref('test-child', coaching), contact.origin)
    assert.equal(coachingReturnTo(child.searchParams.get('from')), coaching)
  }
})

test('missing and invalid origins fall back to My Disciples', () => {
  for (const value of [undefined, ['bad'], '//example.com', '/\\example.com', 'https://example.com', '/contacts/test', '/disciples/../contacts', '/manage/leaders-extra', '/disciples\n']) {
    assert.equal(coachingReturnTo(value), '/disciples')
  }
})

test('coaching back button never uses browser history', () => {
  const button = readFileSync(new URL('../components/follow-up/disciple-back-button.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(button, /router\.back|window\.history/)
  assert.ok(button.includes('href={href}'))
  const page = readFileSync(new URL('../app/disciples/[discipleId]/page.tsx', import.meta.url), 'utf8')
  assert.ok(page.includes('<DiscipleBackButton href={returnTo} />'))
})
