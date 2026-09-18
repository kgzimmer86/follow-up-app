/* Notifications only: deliberately no fetch handler or offline data cache. */
const DB_NAME = 'follow-up-push'
let queue = Promise.resolve()
function serial(work) {
  const next = queue.then(work)
  queue = next.catch(() => {})
  return next
}
function stateStore(mode, operation) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('state')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('state', mode)
      const result = operation(tx.objectStore('state'))
      tx.oncomplete = () => { db.close(); resolve(result.result) }
      tx.onerror = () => { db.close(); reject(tx.error) }
      tx.onabort = () => { db.close(); reject(tx.error) }
    }
  })
}
const readState = () => stateStore('readonly', store => store.get('binding'))
const writeState = state => stateStore('readwrite', store => store.put(state, 'binding'))
async function badge(count) {
  try {
    if (count > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(count)
    else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge()
  } catch { /* Badge permission may differ from notification permission. */ }
}
async function closeNotifications() {
  const notices = await self.registration.getNotifications({ tag: 'follow-up-attention' })
  notices.forEach(notice => notice.close())
}
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))
self.addEventListener('message', event => {
  event.waitUntil(serial(async () => {
    try {
      const client = event.source && await self.clients.get(event.source.id)
      if (!client || new URL(client.url).origin !== self.location.origin) throw new Error('Unknown client')
      const data = event.data || {}
      if (data.type === 'BIND' && typeof data.id === 'string') {
        await writeState({ id: data.id, count: 0, updatedAt: 0 })
        await badge(0)
      } else if (data.type === 'CLEAR') {
        await writeState({ id: null, count: 0, updatedAt: Date.now() })
        await badge(0)
        await closeNotifications()
      } else if (data.type === 'SYNC') {
        const state = await readState()
        if (state?.id === data.id && Number.isSafeInteger(data.count) && data.count >= 0) {
          await writeState({ ...state, count: data.count, updatedAt: Date.now() })
          await badge(data.count)
          if (!data.count) await closeNotifications()
        }
      }
      event.ports[0]?.postMessage({ ok: true })
    } catch {
      event.ports[0]?.postMessage({ ok: false })
    }
  }))
})
self.addEventListener('push', event => {
  event.waitUntil(serial(async () => {
    let body = 'Open Follow Up to see your current attention items.'
    let count = 0
    try {
      const data = event.data?.json()
      const state = await readState()
      count = state?.id ? state.count || 0 : 0
      // A queued delivery from a signed-out account must not restore its badge.
      if (state?.id && data?.subscriptionId === state.id) {
        count = state.count || 0
        if (Number.isSafeInteger(data.count) && data.count >= 0 && Number.isFinite(data.sentAt) && data.sentAt >= state.updatedAt) {
          count = data.count
          if (typeof data.body === 'string') body = data.body.slice(0, 240)
          await writeState({ ...state, count, updatedAt: data.sentAt })
        }
      }
    } catch { /* Even an invalid/obsolete push must produce a visible notice. */ }
    await badge(count)
    // Apple requires a visible notification for EVERY push, including clearing
    // an attention count. A shared tag coalesces entries in Notification Center.
    await self.registration.showNotification('Follow Up', {
      body, icon: '/icon-192(1).png', tag: 'follow-up-attention',
      data: { url: '/notifications' },
    })
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil((async () => {
    const url = new URL('/notifications', self.location.origin).href
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = windows.find(item => new URL(item.url).origin === self.location.origin)
    if (client) {
      await client.navigate(url)
      await client.focus()
    } else await self.clients.openWindow(url)
  })())
})
