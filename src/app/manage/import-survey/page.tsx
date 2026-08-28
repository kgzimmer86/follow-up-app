import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { SurveyImportPreview } from '@/components/follow-up/survey-import-preview'

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
            Preview survey responses and verify the column mapping before anything is imported.
          </p>

          <ManageTabs role={profile.role} />
        </div>

        <div className="p-5 md:p-6">
          <SurveyImportPreview />
        </div>
      </section>
    </main>
  )
}

function ManageTabs({
  role,
}: {
  role: string
}) {
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

      <span className="shrink-0 rounded-[10px] bg-[#00274c] px-3.5 py-2.5 text-xs font-extrabold text-white">
        Import Survey
      </span>

      {role === 'admin' && (
        <Link
          href="/admin/users"
          className="shrink-0 rounded-[10px] px-3.5 py-2.5 text-xs font-extrabold text-[#475467] transition hover:bg-white hover:text-[#15223a]"
        >
          Users
        </Link>
      )}
    </nav>
  )
}