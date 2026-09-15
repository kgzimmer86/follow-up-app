'use client'

import { createClient } from '@/lib/supabase/client'

const storageKey = 'follow-up-push-device'
export const pushSettingsChanged = 'follow-up-push-settings-changed'
export type PushBinding = { userId: string; id: string }
export function readPushBinding(): PushBinding | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null')
    return typeof value?.userId === 'string' && typeof value?.id === 'string' ? value : null
  } catch { return null }
}
export function writePushBinding(binding: PushBinding | null) {
  if (binding) localStorage.setItem(storageKey, JSON.stringify(binding))
  else localStorage.removeItem(storageKey)
  window.dispatchEvent(new Event(pushSettingsChanged))
}
export async function messagePushWorker(registration: ServiceWorkerRegistration, message: Record<string, unknown>) {
  const worker = registration.active
  if (!worker) throw new Error('Notifications are still preparing. Please try again.')
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Could not update this device’s notifications. Please try again.')) }, 5000)
    channel.port1.onmessage = event => {
      clearTimeout(timer); channel.port1.close()
      if (event.data?.ok) resolve()
      else reject(new Error('Your browser could not save notification settings.'))
    }
    worker.postMessage(message, [channel.port2])
  })
}
export async function disablePushNotifications() {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  // Clear persistent worker state BEFORE unsubscribing, including queued pushes.
  let clearError: unknown
  if (registration?.active) {
    try { await messagePushWorker(registration, { type: 'CLEAR' }) }
    catch (error) { clearError = error }
  }
  try { writePushBinding(null) } catch { /* Browser storage may be unavailable. */ }
  const subscription = await registration?.pushManager?.getSubscription()
  if (subscription) {
    const removed = await subscription.unsubscribe().catch(() => false)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const result = await createClient().rpc('follow_up_push_remove', { p_endpoint: subscription.endpoint })
      .abortSignal(controller.signal)
      .then(result => ({ error: result.error }), () => ({ error: true }))
    clearTimeout(timeout)
    // Either server removal or browser unsubscription stops future delivery.
    if (result.error && !removed) throw new Error('Could not turn off notifications. Please check your connection and try again.')
  }
  if (clearError) throw clearError
}

export async function clearPushOnSignOut() {
  try { await disablePushNotifications() }
  catch {
    // Logging out must remain possible offline. The next approved session also
    // checks server ownership and removes any orphaned browser subscription.
    const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> }
    await nav.clearAppBadge?.().catch(() => {})
  }
}
