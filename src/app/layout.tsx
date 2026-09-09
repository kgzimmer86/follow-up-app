import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Suspense } from 'react'
import './globals.css'

import { createClient } from '@/lib/supabase/server'
import { getAppAccess } from '@/lib/supabase/access'
import { FilterSession } from '@/components/follow-up/filter-session'
import { TextAttemptSession } from '@/components/follow-up/text-attempt-session'
import { PhotoCleanupProvider } from '@/components/follow-up/photo-cleanup-provider'
import { AppShell } from '@/components/follow-up/app-shell'
import { LoadRecovery } from '@/components/follow-up/load-recovery'
import { AppLoading } from '@/components/follow-up/app-loading'
import { InteractionFeedback } from '@/components/interaction-feedback'
import { appleStartupImages } from '@/lib/startup-images'

export const metadata: Metadata = {
  title: 'Follow Up | Michigan Cru',
  applicationName: 'Follow Up',
  description: 'Michigan Cru Follow Up',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      {
        url: '/icon-192(1).png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icon-512(1).png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: 'Follow Up',
    statusBarStyle: 'default',
    startupImage: appleStartupImages,
  },
  other: {
    // Next emits only mobile-web-app-capable; iOS launch images also need this.
    // https://github.com/vercel/next.js/issues/74524
    'apple-mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  themeColor: '#00274c',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <InteractionFeedback />
        <Suspense fallback={<AppLoading />}>
          <AppRuntime>{children}</AppRuntime>
        </Suspense>
      </body>
    </html>
  )
}

async function AppRuntime({ children }: { children: ReactNode }) {
  const access = await getAppAccess()

  if (access.status === 'unavailable') {
    return <LoadRecovery fullScreen />
  }

  const { user, profile } = access

  /*
   * Login, pending-approval, and inactive-account
   * screens should remain standalone.
   */
  if (!user) {
    return children
  }

  if (
    !profile ||
    profile.role === 'pending' ||
    !profile.is_active
  ) {
    return children
  }

  /*
   * Find the user's default Follow Up ministry area.
   */
  let areaLabel = 'All Campus'
  const supabase = await createClient()

  const { data: campaign } = await supabase
    .from('follow_up_campaigns')
    .select('id')
    .eq('status', 'active')
    .maybeSingle()

  if (campaign) {
    const { data: assignment } = await supabase
      .from('profile_ministry_area_assignments')
      .select('ministry_area_id')
      .eq('campaign_id', campaign.id)
      .eq('profile_id', user.id)
      .eq('is_default', true)
      .maybeSingle()

    if (assignment?.ministry_area_id) {
      const { data: area } = await supabase
        .from('ministry_areas')
        .select('name')
        .eq(
          'id',
          assignment.ministry_area_id
        )
        .maybeSingle()

      if (area?.name) {
        areaLabel = area.name
      }
    }
  }

  const displayName =
    profile.display_name?.trim() ||
    user.email?.split('@')[0] ||
    'Follow Up Leader'

  return (
    <FilterSession key={user.id} userId={user.id}>
      <TextAttemptSession userId={user.id}>
        <PhotoCleanupProvider userId={user.id}>
        <AppShell
          displayName={displayName}
          role={profile.role}
          areaLabel={areaLabel}
        >
          {children}
        </AppShell>
        </PhotoCleanupProvider>
      </TextAttemptSession>
    </FilterSession>
  )
}
