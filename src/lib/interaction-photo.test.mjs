import assert from 'node:assert/strict'
import test from 'node:test'
import { createPhotoCleanupQueue, interactionPhotoBucket, removeUnusedInteractionPhoto } from './interaction-photo.ts'

const contact = '11111111-1111-4111-8111-111111111111'
const path = `interaction-attachments/${contact}/22222222-2222-4222-8222-222222222222.jpg`
const secondPath = `interaction-attachments/${contact}/33333333-3333-4333-8333-333333333333.png`

function fixture({ references = [], referenceError = null, removed = [{ name: path }], removeError = null, remaining = [], listError = null, throwsAt } = {}) {
  const calls = []
  const client = {
    from(table) {
      assert.equal(table, 'follow_up_events')
      return { select(columns) {
        assert.equal(columns, 'id')
        return { eq(column, value) {
          assert.equal(column, 'attachment_path')
          assert.equal(value, path)
          return { async limit(count) {
            assert.equal(count, 1)
            calls.push('references')
            if (throwsAt === 'references') throw new Error('offline')
            return { data: references, error: referenceError }
          } }
        } }
      } }
    },
    storage: { from(bucket) {
      assert.equal(bucket, interactionPhotoBucket)
      return {
        async remove(paths) {
          assert.deepEqual(paths, [path])
          calls.push('remove')
          if (throwsAt === 'remove') throw new Error('offline')
          return { data: removed, error: removeError }
        },
        async list(folder, options) {
          assert.equal(folder, `interaction-attachments/${contact}`)
          assert.equal(options.search, path.split('/').at(-1))
          calls.push('list')
          if (throwsAt === 'list') throw new Error('offline')
          return { data: remaining, error: listError }
        },
      }
    } },
  }
  return { client, calls }
}

test('an unused photo is removed only after its interaction references are checked', async () => {
  const { client, calls } = fixture()
  assert.equal(await removeUnusedInteractionPhoto(client, path), 'removed')
  assert.deepEqual(calls, ['references', 'remove'])
})

test('a saved interaction protects its photo even when the save response was lost', async () => {
  for (const checkOnly of [false, true]) {
    const { client, calls } = fixture({ references: [{ id: 'saved-interaction' }] })
    assert.equal(await removeUnusedInteractionPhoto(client, path, checkOnly), 'in_use')
    assert.deepEqual(calls, ['references'])
  }
})

test('an uncertain save is not raced by an immediate photo deletion', async () => {
  const { client, calls } = fixture()
  assert.equal(await removeUnusedInteractionPhoto(client, path, true), 'pending')
  assert.deepEqual(calls, ['references'])
})

test('failed or missing reference results never allow a photo deletion', async () => {
  for (const options of [{ referenceError: { message: 'offline' } }, { references: null }]) {
    const { client, calls } = fixture(options)
    assert.equal(await removeUnusedInteractionPhoto(client, path), 'pending')
    assert.deepEqual(calls, ['references'])
  }
})

test('a storage error remains retryable without being reported as success', async () => {
  const { client, calls } = fixture({ removeError: { message: 'denied' } })
  assert.equal(await removeUnusedInteractionPhoto(client, path), 'pending')
  assert.deepEqual(calls, ['references', 'remove'])
})

test('empty removal responses are checked instead of assuming success', async () => {
  for (const remaining of [[], [{ name: path.split('/').at(-1) }]]) {
    const { client, calls } = fixture({ removed: [], remaining })
    assert.equal(await removeUnusedInteractionPhoto(client, path), remaining.length ? 'pending' : 'removed')
    assert.deepEqual(calls, ['references', 'remove', 'list'])
  }
})

test('an unverifiable empty response remains retryable', async () => {
  for (const options of [{ remaining: null }, { listError: { message: 'offline' } }]) {
    const { client } = fixture({ removed: [], ...options })
    assert.equal(await removeUnusedInteractionPhoto(client, path), 'pending')
  }
})

test('thrown network errors at every step preserve the retry option', async () => {
  for (const throwsAt of ['references', 'remove', 'list']) {
    const { client } = fixture({ removed: [], throwsAt })
    assert.equal(await removeUnusedInteractionPhoto(client, path), 'pending')
  }
})

test('retrying a failed removal never repeats an interaction save or deletion', async () => {
  const failed = fixture({ removeError: { message: 'offline' } })
  assert.equal(await removeUnusedInteractionPhoto(failed.client, path), 'pending')
  const retry = fixture()
  assert.equal(await removeUnusedInteractionPhoto(retry.client, path), 'removed')
  assert.deepEqual(retry.calls, ['references', 'remove'])
})

function memoryStorage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}

test('failed removals survive a reload and are kept separate for each user', () => {
  const storage = memoryStorage()
  const queue = createPhotoCleanupQueue('user-a', storage)
  queue.add(path)
  queue.add(path)
  queue.add(secondPath)
  assert.deepEqual(queue.getSnapshot(), [path, secondPath])
  assert.deepEqual(createPhotoCleanupQueue('user-b', storage).getSnapshot(), [])
  const reloaded = createPhotoCleanupQueue('user-a', storage)
  assert.deepEqual(reloaded.getSnapshot(), [path, secondPath])
  reloaded.remove(path)
  assert.deepEqual(createPhotoCleanupQueue('user-a', storage).getSnapshot(), [secondPath])
  reloaded.remove(secondPath)
  assert.deepEqual(createPhotoCleanupQueue('user-a', storage).getSnapshot(), [])
})

test('unavailable browser storage still allows retrying within the current session', () => {
  const storage = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') }, removeItem() { throw new Error('blocked') } }
  const queue = createPhotoCleanupQueue('user', storage)
  let updates = 0
  const unsubscribe = queue.subscribe(() => updates++)
  queue.add(path)
  assert.deepEqual(queue.getSnapshot(), [path])
  queue.remove(path)
  assert.deepEqual(queue.getSnapshot(), [])
  assert.equal(updates, 2)
  unsubscribe()
  queue.add(path)
  assert.equal(updates, 2)
})

test('malformed paths cannot reach storage or enter the retry queue', async () => {
  const queue = createPhotoCleanupQueue('user', null)
  for (const invalid of ['', '../avatar.jpg', 'other-bucket/file.jpg', null, 42]) {
    const { client, calls } = fixture()
    assert.equal(await removeUnusedInteractionPhoto(client, invalid), 'pending')
    assert.deepEqual(calls, [])
    queue.add(invalid)
  }
  assert.deepEqual(queue.getSnapshot(), [])
})
