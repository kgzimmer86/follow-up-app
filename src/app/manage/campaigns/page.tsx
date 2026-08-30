import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { ManageTabs } from '@/components/follow-up/manage-tabs'

type PageProps = {
  searchParams: Promise<{
    archived?: string
    error?: string
  }>
}

type CampaignRow = {
  id: string
  academic_year: string
  label: string
  starts_on: string
  ends_on: string
  status: 'draft' | 'active' | 'archived'
  archived_at: string | null
  purge_after: string | null
  created_at: string
}

export default async function ManageCampaignsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams
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
    profile.role !== 'admin'
  ) {
    redirect('/manage')
  }

  const {
    data: campaignData,
    error: campaignError,
  } = await supabase.rpc(
    'admin_list_follow_up_campaigns'
  )

  if (campaignError) {
    throw new Error(campaignError.message)
  }

  const campaigns =
    (campaignData ?? []) as CampaignRow[]

  const activeCampaign =
    campaigns.find(
      (campaign) =>
        campaign.status === 'active'
    ) ?? null

  const draftCampaigns = campaigns.filter(
    (campaign) => campaign.status === 'draft'
  )

  const archivedCampaigns = campaigns.filter(
    (campaign) =>
      campaign.status === 'archived'
  )

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
            Manage the active Follow Up year and
            preserve prior campaign history.
          </p>

          <ManageTabs role={profile.role} active="campaigns" />
        </div>

        <div className="p-5 md:p-6">
          {params.archived === '1' && (
            <div className="mb-5 rounded-[16px] border border-[#abefc6] bg-[#ecfdf3] px-4 py-3 text-sm font-semibold text-[#027a48]">
              Campaign archived successfully. Its
              Follow Up history is preserved and is
              no longer part of the live campaign.
            </div>
          )}

          {params.error && (
            <div className="mb-5 rounded-[16px] border border-[#fecdca] bg-[#fef3f2] px-4 py-3 text-sm font-semibold text-[#b42318]">
              {params.error}
            </div>
          )}

          <section>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-[#667085]">
                Current Year
              </p>

              <h2 className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-[#15223a]">
                Active campaign
              </h2>

              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#667085]">
                Follow Up uses exactly one active
                campaign at a time. Archiving it
                removes that year from the live
                workflow without deleting its data.
              </p>
            </div>

            {activeCampaign ? (
              <div className="mt-4 rounded-[20px] border border-[#b2ccff] bg-white p-5 shadow-[0_1px_5px_rgba(16,24,40,0.03)] md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-xl font-extrabold tracking-[-0.025em] text-[#15223a]">
                        {activeCampaign.label}
                      </h3>

                      <StatusBadge status="active" />
                    </div>

                    <p className="mt-1 text-sm font-semibold text-[#667085]">
                      Academic year{' '}
                      {activeCampaign.academic_year}
                    </p>
                  </div>

                  <div className="rounded-[12px] bg-[#eef4ff] px-3 py-2 text-right">
                    <div className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#3538cd]">
                      Live Follow Up
                    </div>
                    <div className="mt-0.5 text-xs font-extrabold text-[#15223a]">
                      In progress
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <DateCard
                    label="Starts"
                    value={formatDate(
                      activeCampaign.starts_on
                    )}
                  />
                  <DateCard
                    label="Ends"
                    value={formatDate(
                      activeCampaign.ends_on
                    )}
                  />
                </div>

                <div className="mt-5 border-t border-[#eef0f3] pt-5">
                  <details className="group rounded-[16px] border border-[#fecdca] bg-[#fffafa]">
                    <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-extrabold text-[#b42318] marker:hidden">
                      <span className="flex items-center justify-between gap-3">
                        Archive campaign
                        <span
                          aria-hidden="true"
                          className="text-base transition group-open:rotate-180"
                        >
                          ▾
                        </span>
                      </span>
                    </summary>

                    <div className="border-t border-[#fecdca] px-4 py-4">
                      <p className="text-sm font-bold text-[#7a271a]">
                        Are you sure you want to archive{' '}
                        {activeCampaign.label}?
                      </p>

                      <p className="mt-2 max-w-3xl text-xs leading-5 text-[#912018]">
                        This immediately ends the live
                        Follow Up campaign. Contacts,
                        interactions, assignments, and
                        historical data are preserved.
                        There will be no active campaign
                        until another campaign is
                        activated.
                      </p>

                      <form
                        action={archiveCampaign}
                        className="mt-4"
                      >
                        <input
                          type="hidden"
                          name="campaignId"
                          value={activeCampaign.id}
                        />

                        <button
                          type="submit"
                          className="rounded-[12px] bg-[#b42318] px-4 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#912018]"
                        >
                          Yes, archive{' '}
                          {activeCampaign.academic_year}
                        </button>
                      </form>
                    </div>
                  </details>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-[18px] border border-[#fedf89] bg-[#fff8eb] p-5">
                <p className="text-sm font-extrabold text-[#b54708]">
                  No active Follow Up campaign
                </p>
                <p className="mt-1 text-xs leading-5 text-[#93370d]">
                  The live Follow Up workflow will
                  remain paused until a campaign is
                  activated.
                </p>
              </div>
            )}
          </section>

          {draftCampaigns.length > 0 && (
            <section className="mt-8">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-[#667085]">
                  Upcoming
                </p>

                <h2 className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-[#15223a]">
                  Draft campaigns
                </h2>
              </div>

              <div className="mt-4 space-y-3">
                {draftCampaigns.map(
                  (campaign) => (
                    <CampaignHistoryCard
                      key={campaign.id}
                      campaign={campaign}
                    />
                  )
                )}
              </div>
            </section>
          )}

          <section className="mt-8">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-[#667085]">
                History
              </p>

              <h2 className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-[#15223a]">
                Archived campaigns
              </h2>

              <p className="mt-1 max-w-2xl text-xs leading-5 text-[#667085]">
                Archived campaigns are retained with
                their Follow Up history until their
                scheduled purge date.
              </p>
            </div>

            {archivedCampaigns.length === 0 ? (
              <div className="mt-4 rounded-[18px] border border-dashed border-[#d0d5dd] bg-white p-6 text-sm text-[#667085]">
                No campaigns have been archived yet.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {archivedCampaigns.map(
                  (campaign) => (
                    <CampaignHistoryCard
                      key={campaign.id}
                      campaign={campaign}
                    />
                  )
                )}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

async function archiveCampaign(
  formData: FormData
) {
  'use server'

  const campaignId = String(
    formData.get('campaignId') ?? ''
  ).trim()

  if (!campaignId) {
    redirect(
      '/manage/campaigns?error=Campaign%20ID%20is%20missing.'
    )
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc(
    'admin_archive_follow_up_campaign',
    {
      p_campaign_id: campaignId,
    }
  )

  if (error) {
    redirect(
      `/manage/campaigns?error=${encodeURIComponent(
        error.message
      )}`
    )
  }

  revalidatePath('/')
  revalidatePath('/manage')
  revalidatePath('/manage/campaigns')
  revalidatePath('/contacts')
  revalidatePath('/assign-contacts')

  redirect('/manage/campaigns?archived=1')
}


function CampaignHistoryCard({
  campaign,
}: {
  campaign: CampaignRow
}) {
  return (
    <div className="rounded-[18px] border border-[#e4e7ec] bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-extrabold text-[#15223a]">
              {campaign.label}
            </h3>
            <StatusBadge
              status={campaign.status}
            />
          </div>

          <p className="mt-1 text-xs font-semibold text-[#667085]">
            Academic year {campaign.academic_year}
          </p>
        </div>

        <div className="text-right text-[10px] font-semibold leading-5 text-[#667085]">
          <div>
            {formatDate(campaign.starts_on)} –{' '}
            {formatDate(campaign.ends_on)}
          </div>

          {campaign.archived_at && (
            <div>
              Archived{' '}
              {formatDateTime(
                campaign.archived_at
              )}
            </div>
          )}
        </div>
      </div>

      {campaign.status === 'archived' && (
        <div className="mt-3 rounded-[12px] bg-[#f9fafb] px-3 py-2.5 text-[10px] font-semibold text-[#667085]">
          {campaign.purge_after
            ? `Retention scheduled through ${formatDate(
                campaign.purge_after
              )}.`
            : 'No purge date has been assigned yet.'}
        </div>
      )}
    </div>
  )
}

function DateCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-[14px] bg-[#f9fafb] px-4 py-3">
      <div className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#667085]">
        {label}
      </div>
      <div className="mt-1 text-sm font-extrabold text-[#15223a]">
        {value}
      </div>
    </div>
  )
}

function StatusBadge({
  status,
}: {
  status: CampaignRow['status']
}) {
  if (status === 'active') {
    return (
      <span className="rounded-full bg-[#ecfdf3] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.07em] text-[#027a48]">
        Active
      </span>
    )
  }

  if (status === 'draft') {
    return (
      <span className="rounded-full bg-[#fff8eb] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.07em] text-[#b54708]">
        Draft
      </span>
    )
  }

  return (
    <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-[0.07em] text-[#475467]">
      Archived
    </span>
  )
}

function formatDate(value: string | null) {
  if (!value) {
    return '—'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(
    new Date(`${value}T00:00:00Z`)
  )
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Detroit',
  }).format(new Date(value))
}
