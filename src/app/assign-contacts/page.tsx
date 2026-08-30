import { redirect } from 'next/navigation'

import { ContactAssignmentWorkspace } from '@/components/follow-up/contact-assignment-workspace'
import { DiscipleBackButton } from '@/components/follow-up/disciple-back-button'
import { createClient } from '@/lib/supabase/server'
import { ManageTabs } from '@/components/follow-up/manage-tabs'

type AssignmentWorkspace = {
  role: string
  scope: string
  assignees: {
    id: string
    display_name: string
    role: string
    area_name: string | null
  }[]
  contacts: {
    id: string
    display_name: string
    status: string
    primary_owner_id: string | null
    primary_owner_name: string | null
    location_name: string | null
    house_name: string | null
    room_or_address: string | null
    location_resolution: string | null
    jesus_interest: string | null
    community_interest: string | null
    interview_interest: string | null
  }[]
}

type PageProps = {
  searchParams: Promise<{
    areaId?: string
    queue?: string
  }>
}

const attentionQueueLabels: Record<
  string,
  string
> = {
  interested_unassigned:
    'Interested + unassigned',
  never_attempted: 'Never attempted',
  stale_go_backs:
    'Go Backs quiet 7+ days',
  new_believers_unassigned:
    'New believers unassigned',
}

export default async function AssignContactsPage({
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
    .select(
      'display_name, role, is_active'
    )
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    throw new Error(profileError.message)
  }

  if (
    !profile ||
    !profile.is_active ||
    !['discipler', 'staff', 'admin'].includes(
      profile.role
    )
  ) {
    redirect('/')
  }

  const { data, error } =
    await supabase.rpc(
      'get_contact_assignment_workspace'
    )

  if (error) {
    throw new Error(error.message)
  }

  let workspace = data as AssignmentWorkspace

  /*
   * The workspace RPC intentionally limits the
   * "people I manage" list. Add the signed-in
   * assigner to the dropdown separately so anyone
   * with Assign Contacts access can also take
   * contacts themselves.
   */
  if (
    !workspace.assignees.some(
      (assignee) =>
        assignee.id === user.id
    )
  ) {
    workspace = {
      ...workspace,
      assignees: [
        {
          id: user.id,
          display_name:
            profile.display_name?.trim() ||
            user.email?.split('@')[0] ||
            'Me',
          role: profile.role,
          area_name: null,
        },
        ...workspace.assignees,
      ],
    }
  }

  const areaId = params.areaId
  const queue = params.queue

  const isAttentionMode = Boolean(
    queue &&
      attentionQueueLabels[queue] &&
      ['staff', 'admin'].includes(
        profile.role
      )
  )

  if (isAttentionMode && queue) {
    const {
      data: attentionContactIds,
      error: attentionError,
    } = await supabase.rpc(
      'get_manage_attention_contact_ids',
      {
        p_area_id: areaId ?? null,
        p_queue: queue,
      }
    )

    if (attentionError) {
      throw new Error(
        attentionError.message
      )
    }

    const idSet = new Set(
      (attentionContactIds ?? []) as string[]
    )

    let areaName = 'All Campus'

    if (areaId) {
      const {
        data: area,
        error: areaError,
      } = await supabase
        .from('ministry_areas')
        .select('name')
        .eq('id', areaId)
        .maybeSingle()

      if (areaError) {
        throw new Error(
          areaError.message
        )
      }

      areaName =
        area?.name ?? 'Selected area'
    }

    workspace = {
      ...workspace,
      scope: `${areaName} • ${
        attentionQueueLabels[queue]
      }`,
      contacts:
        workspace.contacts.filter(
          (contact) =>
            idSet.has(contact.id)
        ),
    }
  }

  return (
    <main className="mx-auto max-w-[1040px] px-[18px] py-[18px] md:px-7 md:pb-12 md:pt-6">
      <div className="mb-3">
        <DiscipleBackButton />
      </div>

      <ManageTabs
        role={profile.role}
        active="assign"
      />

      <ContactAssignmentWorkspace
        initialWorkspace={workspace}
        focused={isAttentionMode}
      />
    </main>
  )
}
