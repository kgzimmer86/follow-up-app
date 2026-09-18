import { notFound, redirect } from 'next/navigation'
import { getAppAccess } from '@/lib/supabase/access'
import { nextStepsEnabled } from '@/lib/next-steps'
import { LoadRecovery } from '@/components/follow-up/load-recovery'
import { MyContactsTabs } from '@/components/follow-up/my-contacts-tabs'
import { NextStepWorkspace } from '@/components/follow-up/next-step-workspace'

export default async function NextStepsPage() {
  if (!nextStepsEnabled) notFound()
  const access = await getAppAccess()
  if (access.status === 'unavailable') return <LoadRecovery />
  if (!access.user || !access.profile?.is_active || access.profile.role === 'pending') redirect('/')
  return <main className="mx-auto max-w-[760px] px-[18px] py-6">
    <h1 className="text-3xl font-extrabold tracking-tight text-[#15223a]">My Contacts</h1>
    <MyContactsTabs active="steps" />
    <h2 className="text-xl font-extrabold text-[#15223a]">My Next Steps</h2>
    <p className="mt-2 text-sm leading-6 text-[#667085]">Your plans to follow up, organized by when you want to act. Add a step from a contact’s page.</p>
    <NextStepWorkspace key={access.user.id} />
  </main>
}
