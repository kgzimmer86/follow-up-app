import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js'
import { loadAppAccess } from './app-access.ts'

const user = { id: 'test-user', email: 'leader@example.com' }
const profile = { display_name: 'Test Leader', role: 'student_leader', is_active: true }
const signedIn = { data: { user }, error: null }
const allowed = { data: profile, error: null }
const unavailable = { status: 'unavailable', user: null, profile: null }

function mockClient({ auth = [signedIn], profiles = [allowed] } = {}) {
  const calls = { auth: 0, profile: 0 }
  function nextResponse(responses, index) {
    const result = responses[Math.min(index, responses.length - 1)]
    if (result instanceof Error) return Promise.reject(result)
    return Promise.resolve(result)
  }
  return {
    calls,
    client: {
      auth: { getUser: () => nextResponse(auth, calls.auth++) },
      from(table) {
        assert.equal(table, 'profiles')
        return {
          select(columns) {
            assert.equal(columns, 'display_name, role, is_active')
            return this
          },
          eq(column, id) {
            assert.equal(column, 'id')
            assert.equal(id, user.id)
            return this
          },
          maybeSingle: () => nextResponse(profiles, calls.profile++),
        }
      },
    },
  }
}

test('successful access uses the verified user and their current profile', async () => {
  const { client, calls } = mockClient()
  assert.deepEqual(await loadAppAccess(client), { status: 'ready', user, profile })
  assert.deepEqual(calls, { auth: 1, profile: 1 })
})

test('signed-out and invalid sessions keep the login flow and never read a profile', async () => {
  for (const error of [
    null,
    new AuthSessionMissingError(),
    new AuthApiError('Invalid token', 401, 'bad_jwt'),
    new AuthApiError('Invalid token', 400, 'bad_jwt'),
    new AuthApiError('Missing refresh token', 400, 'refresh_token_not_found'),
  ]) {
    const { client, calls } = mockClient({ auth: [{ data: { user: null }, error }] })
    assert.deepEqual(await loadAppAccess(client), { status: 'ready', user: null, profile: null })
    assert.deepEqual(calls, { auth: 1, profile: 0 })
  }
})

test('a temporary sign-in lookup failure is retried, not treated as signed out', async () => {
  const { client, calls } = mockClient({ auth: [
    { data: { user: null }, error: new AuthRetryableFetchError('Unavailable', 503) },
    signedIn,
  ] })
  assert.deepEqual(await loadAppAccess(client), { status: 'ready', user, profile })
  assert.deepEqual(calls, { auth: 2, profile: 1 })
})

test('a temporary profile lookup failure recovers with the real role', async () => {
  const { client, calls } = mockClient({ profiles: [
    { data: null, error: { message: 'Unavailable', code: '503' } },
    allowed,
  ] })
  assert.deepEqual(await loadAppAccess(client), { status: 'ready', user, profile })
  assert.deepEqual(calls, { auth: 2, profile: 2 })
})

test('persistent failures stop after two attempts and never supply an account or role', async () => {
  const authFailure = mockClient({ auth: [{ data: { user: null }, error: new AuthRetryableFetchError('Unavailable', 503) }] })
  assert.deepEqual(await loadAppAccess(authFailure.client), unavailable)
  assert.deepEqual(authFailure.calls, { auth: 2, profile: 0 })

  // Even if an error response contains partial data, it must not grant access.
  const profileFailure = mockClient({ profiles: [{ data: profile, error: { message: 'Unavailable' } }] })
  assert.deepEqual(await loadAppAccess(profileFailure.client), unavailable)
  assert.deepEqual(profileFailure.calls, { auth: 2, profile: 2 })
})

test('rejected network requests are also retried and remain bounded', async () => {
  const recovered = mockClient({ profiles: [new TypeError('Fetch failed'), allowed] })
  assert.deepEqual(await loadAppAccess(recovered.client), { status: 'ready', user, profile })
  const failed = mockClient({ auth: [new TypeError('Fetch failed')] })
  assert.deepEqual(await loadAppAccess(failed.client), unavailable)
  assert.equal(failed.calls.auth, 2)
})

test('missing, pending, and inactive profiles are preserved for the existing access screens', async () => {
  for (const restricted of [null, { ...profile, role: 'pending' }, { ...profile, is_active: false }]) {
    const { client, calls } = mockClient({ profiles: [{ data: restricted, error: null }] })
    assert.deepEqual(await loadAppAccess(client), { status: 'ready', user, profile: restricted })
    assert.deepEqual(calls, { auth: 1, profile: 1 })
  }
})

test('a fresh check never carries a previous account or approval forward', async () => {
  const { client } = mockClient({ profiles: [allowed, { data: { ...profile, is_active: false }, error: null }] })
  assert.equal((await loadAppAccess(client)).profile.is_active, true)
  assert.equal((await loadAppAccess(client)).profile.is_active, false)
  const signedOut = mockClient({ auth: [{ data: { user: null }, error: null }] })
  assert.equal((await loadAppAccess(signedOut.client)).user, null)
})
