'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import {
  clearedPersonalFilters, personalFilterCookie, readPersonalFilters,
  readPersonalFilterView, rememberContactFilterView,
} from '@/lib/contact-filters'

export async function startFilterSession(expectedUserId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== expectedUserId) throw new Error('Please sign in again.')
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('is_active, role').eq('id', user.id).maybeSingle()
  if (profileError || !profile?.is_active || profile.role === 'pending') throw new Error('Active access is required.')

  const { data: campaign, error: campaignError } = await supabase.from('follow_up_campaigns')
    .select('id').eq('status', 'active').maybeSingle()
  if (campaignError) throw new Error(campaignError.message)
  let area = null
  if (campaign) {
    const { data: assignment, error } = await supabase.from('profile_ministry_area_assignments')
      .select('ministry_area_id').eq('campaign_id', campaign.id)
      .eq('profile_id', user.id).eq('is_default', true).maybeSingle()
    if (error) throw new Error(error.message)
    if (assignment?.ministry_area_id) {
      const { data, error: areaError } = await supabase.from('ministry_areas')
        .select('id, name, area_type, parent_id').eq('id', assignment.ministry_area_id)
        .eq('is_active', true).maybeSingle()
      if (areaError) throw new Error(areaError.message)
      area = data
    }
  }
  const cookieStore = await cookies()
  const stored = cookieStore.get(personalFilterCookie(user.id))?.value ?? ''
  const defaults = clearedPersonalFilters(area)
  const nextValue = JSON.stringify({
    ...defaults,
    view: readPersonalFilterView(stored),
  })
  const saved = readPersonalFilters(stored)
  const refreshHome = stored !== '' &&
    ['campus', 'location', 'affinity'].some((key) =>
      (saved[key as keyof typeof saved] ?? '') !== defaults[key as keyof typeof defaults]
    )
  cookieStore.set(personalFilterCookie(user.id), nextValue, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
  })
  return { defaults, refreshHome }
}

export async function activateContactFilterView(expectedUserId: string, view: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.id !== expectedUserId) throw new Error('Please sign in again.')
  const { data: profile, error } = await supabase.from('profiles')
    .select('is_active, role').eq('id', user.id).maybeSingle()
  if (error || !profile?.is_active || profile.role === 'pending') throw new Error('Active access is required.')

  const cookieStore = await cookies()
  const name = personalFilterCookie(user.id)
  const stored = cookieStore.get(name)?.value
  // With no saved choices, normal assigned-area initialization still applies.
  if (stored === undefined) return
  if (readPersonalFilterView(stored) === view) return
  cookieStore.set(name, rememberContactFilterView(stored, view), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
  })
}
