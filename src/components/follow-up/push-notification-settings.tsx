'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { nextStepsEnabled } from '@/lib/next-steps'
import { disablePushNotifications, messagePushWorker, writePushBinding } from '@/lib/push-client'

export function PushNotificationSettings({ userId, publicKey }: { userId: string; publicKey: string }) {
  const [enabled, setEnabled] = useState(false)
  const [ready, setReady] = useState(false)
  const [supported, setSupported] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    async function inspect() {
      const supports = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
      setSupported(supports)
      if (supports) {
        const registration = await navigator.serviceWorker.getRegistration('/')
        const subscription = await registration?.pushManager.getSubscription()
        if (subscription) {
          const { data, error } = await createClient().rpc('follow_up_push_device', { p_endpoint: subscription.endpoint })
          if (error) throw new Error('Could not check notification settings. Reload this page to try again.')
          if (!cancelled) {
            setEnabled(Boolean(data))
            if (data && Notification.permission !== 'granted') setMessage('Notifications are blocked in your phone or browser settings. You can allow them there or turn off this device below.')
          }
        }
      }
      if (!cancelled) setReady(true)
    }
    void inspect().catch(error => { if (!cancelled) { setError(error.message); setReady(true) } })
    return () => { cancelled = true }
  }, [])

  async function toggle() {
    setBusy(true); setError(''); setMessage('')
    try {
      if (enabled) {
        await disablePushNotifications()
        setEnabled(false)
        setMessage('Notifications are off on this device. Your in-app badges are unchanged.')
        return
      }
      // Ask within the button gesture, before any network or worker awaits.
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') throw new Error('Notifications were not allowed. You can enable them in your phone or browser settings, then try again.')
      await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const { data, error } = await createClient().rpc('follow_up_push_device', { p_endpoint: subscription.endpoint })
        if (error) throw new Error('Notification setup is unavailable. Please try again later.')
        if (!data) { await subscription.unsubscribe(); subscription = null }
      }
      if (!subscription) {
        const raw = atob(publicKey.replace(/-/g, '+').replace(/_/g, '/'))
        const key = Uint8Array.from(raw, character => character.charCodeAt(0))
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      }
      const keys = subscription.toJSON().keys
      const { data, error } = await createClient().rpc('follow_up_push_register', {
        p_endpoint: subscription.endpoint, p_p256dh: keys?.p256dh, p_auth: keys?.auth,
      })
      if (error || !data) {
        await subscription.unsubscribe()
        throw new Error('Could not save notification settings. Please try again later.')
      }
      try {
        await messagePushWorker(registration, { type: 'BIND', id: data })
        writePushBinding({ userId, id: data })
      } catch (error) { await disablePushNotifications().catch(() => {}); throw error }
      setEnabled(true)
      setMessage('Notifications are on for this device. Your first summary should arrive within about five minutes once scheduled delivery is running.')
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not update notifications.') }
    finally { setBusy(false) }
  }

  return <section className="rounded-[20px] border border-[#e4e7ec] bg-white p-5 shadow-[0_1px_6px_rgba(16,24,40,0.04)]">
    <h3 className="text-sm font-extrabold text-[#15223a]">Phone notifications</h3>
    <p className="mt-2 text-sm leading-6 text-[#667085]">Get one combined update for your contacts, your invitations, and attendance follow-ups in groups you lead.{nextStepsEnabled && ' Planned next steps are included when their chosen time passes.'} Groups you only oversee are not included.</p>
    <p className="mt-2 text-xs leading-5 text-[#667085]">On iPhone or iPad, add Follow Up to your Home Screen, open it there, and allow notifications. Badge changes also require a notification, including when items are resolved. Android badge behavior depends on your phone and launcher.</p>
    {!publicKey && !enabled ? <p className="mt-3 text-sm text-[#667085]">Notifications are not available yet. Your in-app badges still work normally.</p> : !ready ? <p className="mt-3 text-sm text-[#667085]">Checking this device…</p> : !supported ? <p className="mt-3 text-sm text-[#667085]">This browser does not support notifications here. On iPhone or iPad, try from the installed Home Screen app.</p> : <button type="button" disabled={busy} onClick={toggle} className="mt-4 rounded-xl bg-[#00274c] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Updating…' : enabled ? 'Turn off on this device' : 'Enable on this device'}</button>}
    <p className="mt-3 text-xs leading-5 text-[#667085]">Optional, per device. Checks run about every five minutes; unchanged items do not trigger repeated reminders. {nextStepsEnabled ? 'Contact and next-step reminders include the student’s name, but not conversation notes.' : 'Notifications contain counts, not student names.'} You can also change alerts in your phone’s notification settings.</p>
    {message && <p role="status" className="mt-3 text-sm text-[#027a48]">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-[#b42318]">{error}</p>}
  </section>
}
