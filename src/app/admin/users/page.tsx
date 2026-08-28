import Link from 'next/link'
import { redirect } from 'next/navigation'

import { UserManagement } from '@/components/admin/user-management'
import { createClient } from '@/lib/supabase/server'

type FollowUpUser = {
  user_id: string
  display_name: string | null
  email: string | null
  role:
    | 'pending'
    | 'student_leader'
    | 'discipler'
    | 'staff'
    | 'admin'
  is_active: boolean
  access_requested_at: string | null
  approved_at: string | null
  default_ministry_area_id: string | null
  discipler_id: string | null
}

type MinistryArea = {
  id: string
  name: string
  parent_id: string | null
  is_active: boolean
}

export default async function AdminUsersPage() {
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
    throw new Error(
      profileError.message
    )
  }

  if (
    !profile ||
    !profile.is_active ||
    profile.role !== 'admin'
  ) {
    redirect('/manage')
  }

  const {
    data: usersData,
    error: usersError,
  } = await supabase.rpc(
    'admin_list_users'
  )

  if (usersError) {
    throw new Error(
      usersError.message
    )
  }

  const {
    data: areaData,
    error: areaError,
  } = await supabase
    .from('ministry_areas')
    .select(
      'id, name, parent_id, is_active'
    )
    .eq('is_active', true)

  if (areaError) {
    throw new Error(
      areaError.message
    )
  }

  const users =
    (usersData ?? []) as FollowUpUser[]

  const ministryAreas =
    (areaData ?? []) as MinistryArea[]

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
            Approve access and manage Follow Up roles,
            ministry areas, and discipleship relationships.
          </p>

          <ManageTabs />
        </div>

        <div className="p-5 md:p-6">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-[#667085]">
              Administration
            </p>

            <h2 className="mt-1 text-xl font-extrabold tracking-[-0.025em] text-[#15223a]">
              Users
            </h2>

            <p className="mt-1 max-w-2xl text-xs leading-5 text-[#667085]">
              Approve new users and manage access for the
              people who use Follow Up.
            </p>
          </div>

          <UserManagement
            initialUsers={users}
            ministryAreas={
              ministryAreas
            }
          />
        </div>
      </section>
    </main>
  )
}

function ManageTabs() {
  return (
    <nav className="mt-5 flex gap-1 overflow-x-auto rounded-[14px] border border-[#e4e7ec] bg-[#f9fafb] p-1.5">
      <Link
        href="/manage"
        className="shrink-0 rounded-[10px] px-3.5 py-2.5 text-xs font-extrabold text-[#475467] transition hover:bg-white hover:text-[#15223a]"
      >
        Ministry Areas
      </Link>

      <Link
        href="/manage/leaders"
        className="shrink-0 rounded-[10px] px-3.5 py-2.5 text-xs font-extrabold text-[#475467] transition hover:bg-white hover:text-[#15223a]"
      >
        Leaders
      </Link>

      <Link
        href="/assign-contacts"
        className="shrink-0 rounded-[10px] px-3.5 py-2.5 text-xs font-extrabold text-[#475467] transition hover:bg-white hover:text-[#15223a]"
      >
        Assign Contacts
      </Link>

      <Link
        href="/manage/import-survey"
        className="shrink-0 rounded-[10px] px-3.5 py-2.5 text-xs font-extrabold text-[#475467] transition hover:bg-white hover:text-[#15223a]"
      >
        Import Survey
      </Link>

      <span className="shrink-0 rounded-[10px] bg-[#00274c] px-3.5 py-2.5 text-xs font-extrabold text-white">
        Users
      </span>
    </nav>
  )
}
