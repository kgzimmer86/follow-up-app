import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/follow-up/app-shell'

export const metadata: Metadata = {
  title: 'Follow Up | Michigan Cru',
  applicationName: 'Follow Up',
  description: 'Michigan Cru Follow Up',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      {
        url: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icon-512.png',
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
  },
}

export const viewport: Viewport = {
  themeColor: '#00274c',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  /*
   * Login, pending-approval, and inactive-account
   * screens should remain standalone.
   */
  if (!user) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (
    !profile ||
    profile.role === 'pending' ||
    !profile.is_active
  ) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    )
  }

  /*
   * Find the user's default Follow Up ministry area.
   */
  let areaLabel = 'All Campus'

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
    <html lang="en">
      <body>
        <AppShell
          displayName={displayName}
          role={profile.role}
          areaLabel={areaLabel}
        >
          {children}
        </AppShell>
      </body>
    </html>
  )
}