import { redirect } from 'next/navigation'

import { ProfileSettings } from '@/components/follow-up/profile-settings'
import { createClient } from '@/lib/supabase/server'

type ProfileRow = {
  display_name: string | null
  role: string
  is_active: boolean
}

type AssignmentRow = {
  ministry_area_id: string
}

type AreaRow = {
  id: string
  name: string
}

type RelationshipRow = {
  discipler_id: string
}

type DisciplerRow = {
  id: string
  display_name: string | null
}

export default async function ProfilePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const {
    data: profileData,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select('display_name, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    throw new Error(profileError.message)
  }

  const profile =
    profileData as ProfileRow | null

  if (
    !profile ||
    !profile.is_active ||
    profile.role === 'pending'
  ) {
    redirect('/')
  }

  const {
    data: campaign,
    error: campaignError,
  } = await supabase
    .from('follow_up_campaigns')
    .select('id')
    .eq('status', 'active')
    .maybeSingle()

  if (campaignError) {
    throw new Error(campaignError.message)
  }

  let areaLabel = 'No default ministry area'
  let disciplerName = 'No discipler assigned'

  if (campaign) {
    const {
      data: assignmentData,
      error: assignmentError,
    } = await supabase
      .from('profile_ministry_area_assignments')
      .select('ministry_area_id')
      .eq('campaign_id', campaign.id)
      .eq('profile_id', user.id)
      .eq('is_default', true)
      .maybeSingle()

    if (assignmentError) {
      throw new Error(assignmentError.message)
    }

    const assignment =
      assignmentData as AssignmentRow | null

    if (assignment?.ministry_area_id) {
      const {
        data: areaData,
        error: areaError,
      } = await supabase
        .from('ministry_areas')
        .select('id, name')
        .eq(
          'id',
          assignment.ministry_area_id
        )
        .maybeSingle()

      if (areaError) {
        throw new Error(areaError.message)
      }

      const area =
        areaData as AreaRow | null

      if (area?.name) {
        areaLabel = area.name
      }
    }

    const {
      data: relationshipData,
      error: relationshipError,
    } = await supabase
      .from('discipleship_relationships')
      .select('discipler_id')
      .eq('campaign_id', campaign.id)
      .eq('disciple_id', user.id)
      .eq('is_current', true)
      .is('ended_at', null)
      .maybeSingle()

    if (relationshipError) {
      throw new Error(
        relationshipError.message
      )
    }

    const relationship =
      relationshipData as RelationshipRow | null

    if (relationship?.discipler_id) {
      const {
        data: disciplerData,
        error: disciplerError,
      } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq(
          'id',
          relationship.discipler_id
        )
        .maybeSingle()

      if (disciplerError) {
        throw new Error(
          disciplerError.message
        )
      }

      const discipler =
        disciplerData as DisciplerRow | null

      if (discipler?.display_name) {
        disciplerName =
          discipler.display_name
      }
    }
  }

  const displayName =
    profile.display_name ||
    user.user_metadata?.full_name ||
    user.email ||
    'Follow Up user'

  return (
    <main className="mx-auto max-w-[760px] px-[18px] py-[18px] md:px-7 md:pb-12 md:pt-6">
      <section>
        <div className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#175cd3]">
          Your account
        </div>

        <h2 className="mt-1 text-[30px] font-extrabold tracking-[-0.04em] text-[#15223a]">
          Profile
        </h2>

        <p className="mt-2 max-w-[620px] text-sm leading-6 text-[#667085]">
          See how Follow Up identifies your account and
          ministry assignment.
        </p>
      </section>

      <div className="mt-5 grid gap-4">
        <ProfileSettings
          displayName={displayName}
          email={user.email ?? ''}
          role={profile.role}
          areaLabel={areaLabel}
          disciplerName={disciplerName}
        />
      </div>
    </main>
  )
}
