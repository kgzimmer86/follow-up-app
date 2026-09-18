'use client'

import { useEffect } from 'react'
import { useMyContactAttentionCounts } from './my-contact-attention'
import { useInviteAttentionCounts } from '@/components/community/invite-attention'
import { createClient } from '@/lib/supabase/client'
import { nextStepsEnabled, nextStepsChangedEvent } from '@/lib/next-steps'
import { clearPushOnSignOut, disablePushNotifications, messagePushWorker, pushSettingsChanged, readPushBinding, writePushBinding } from '@/lib/push-client'

export function PushBadgeSync({ userId }: { userId: string }) {
  const contacts = useMyContactAttentionCounts()
  const community = useInviteAttentionCounts()
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let cancelled = false
    async function reconcile() {
      const registration = await navigator.serviceWorker.getRegistration('/')
      const subscription = await registration?.pushManager?.getSubscription()
      if (cancelled || !registration?.active || !subscription) return
      const { data, error } = await createClient().rpc('follow_up_push_device', { p_endpoint: subscription.endpoint })
      if (cancelled || error) return // A transient network error must not opt users out.
      if (!data) { await disablePushNotifications(); return }
      const binding = readPushBinding()
      if (binding?.id !== data || binding?.userId !== userId) {
        await messagePushWorker(registration, { type: 'BIND', id: data })
        if (!cancelled) writePushBinding({ userId, id: data })
      }
    }
    void reconcile().catch(() => {})
    const { data: listener } = createClient().auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { cancelled = true; void clearPushOnSignOut() }
    })
    return () => { cancelled = true; listener.subscription.unsubscribe() }
  }, [userId])
  useEffect(() => {
    if (!('serviceWorker' in navigator) || contacts === null || community === null) return
    let cancelled = false
    const total = contacts.total + community.initial + community.groups
    let generation = 0
    async function sync() {
      const request = ++generation
      const binding = readPushBinding()
      if (binding?.userId !== userId || document.visibilityState === 'hidden') return
      const steps = nextStepsEnabled ? await createClient().rpc('follow_up_next_step_due_count') : null
      if (steps?.error || cancelled || request !== generation) return
      const registration = await navigator.serviceWorker.getRegistration('/')
      if (!cancelled && request === generation && registration?.active) await messagePushWorker(registration, { type: 'SYNC', id: binding.id, count: total + (steps?.data ?? 0) })
    }
    const refresh = () => { void sync().catch(() => {}) }
    refresh()
    window.addEventListener(pushSettingsChanged, refresh)
    window.addEventListener(nextStepsChangedEvent, refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = nextStepsEnabled ? window.setInterval(refresh, 60000) : undefined
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener(pushSettingsChanged, refresh); window.removeEventListener(nextStepsChangedEvent, refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [userId, contacts, community])
  return null
}
