import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import {
  SurveyImportPreview,
  type ImportCampaign,
} from '@/components/follow-up/survey-import-preview'
import { ManageTabs } from '@/components/follow-up/manage-tabs'

export default async function ImportSurveyPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/')
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    throw new Error(profileError.message)
  }

  if (
    !profile ||
    !profile.is_active ||
    !['staff', 'admin'].includes(profile.role)
  ) {
    redirect('/')
  }

  const {
    data: campaignData,
    error: campaignError,
  } = await supabase.rpc(
    'list_importable_follow_up_campaigns'
  )

  if (campaignError) {
    throw new Error(campaignError.message)
  }

  const campaigns =
    (campaignData ?? []) as ImportCampaign[]

  return (
    <main className="mx-auto max-w-[1080px] px-[18px] py-[18px] md:px-7 md:pb-12 md:pt-6">
      <section className="overflow-hidden rounded-[24px] border border-[#dbe8f8] bg-[#fbfdff] shadow-[0_2px_12px_rgba(16,24,40,0.05)]">
        <div className="border-b border-[#e4e7ec] bg-white px-5 py-5 md:px-6">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#175cd3]">
            Staff Management
          </p>

          <h1 className="mt-1 text-[30px] font-extrabold tracking-[-0.04em] text-[#15223a] md:text-[36px]">
            Manage Follow Up
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
            Add survey responses to the right Follow Up campaign without replacing existing contacts.
          </p>

          <ManageTabs
            role={profile.role}
            active="import"
          />
        </div>

        <div className="p-5 md:p-6">
          <SurveyImportPreview
            initialCampaigns={campaigns}
            role={profile.role}
          />
        </div>
      </section>
    </main>
  )
}
