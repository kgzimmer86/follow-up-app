'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

import { createClient } from '@/lib/supabase/client'
import { MyContactAttentionBadge } from '@/components/follow-up/my-contact-attention'
import { InviteBadge } from '@/components/community/invite-attention'
import { AddPersonModal } from '@/components/follow-up/add-person-modal'
import { communityContext } from '@/lib/workspace-navigation'

type AppShellProps = {
  children: ReactNode
  displayName: string
  role: string
  areaLabel: string
}

export function AppShell({
  children,
  displayName,
  role,
  areaLabel,
}: AppShellProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const inCommunity = communityContext(pathname, searchParams.get('from'))
  const router = useRouter()
  const [profileMenuOpen, setProfileMenuOpen] =
    useState(false)
  const [addPersonOpen, setAddPersonOpen] =
    useState(false)
  const profileMenuRef =
    useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handlePointerDown(
      event: MouseEvent
    ) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(
          event.target as Node
        )
      ) {
        setProfileMenuOpen(false)
      }
    }

    document.addEventListener(
      'mousedown',
      handlePointerDown
    )

    return () => {
      document.removeEventListener(
        'mousedown',
        handlePointerDown
      )
    }
  }, [])

  async function signOut() {
    const supabase = createClient()

    await supabase.auth.signOut()

    setProfileMenuOpen(false)
    router.push('/')
    router.refresh()
  }

  const navItems = [
    {
      href: '/',
      label: 'Home',
      icon: '⌂',
      active: pathname === '/',
    },
    {
      href: '/contacts',
      label: 'My Contacts',
      icon: '☷',
      active:
        pathname === '/contacts' ||
        pathname.startsWith('/contacts/'),
    },
  ]

  if (
    role === 'discipler' ||
    role === 'staff' ||
    role === 'admin'
  ) {
    navItems.push({
      href: '/disciples',
      label: 'My Disciples',
      icon: '♙',
      active:
        pathname === '/disciples' ||
        pathname.startsWith('/disciples/'),
    })
  }

  if (
    role === 'admin' ||
    role === 'staff'
  ) {
    navItems.push({
      href: '/manage',
      label: 'Manage',
      icon: '⚙',
      active:
        pathname.startsWith('/manage') ||
        pathname.startsWith('/admin'),
    })
  }

  navItems.push({
    href: '/god-at-work',
    label: 'God at Work',
    icon: '✦',
    active:
      pathname === '/god-at-work' ||
      pathname.startsWith('/god-at-work/'),
  })

  const campaignQuery = searchParams.get('campaign') ? `?campaign=${encodeURIComponent(searchParams.get('campaign')!)}` : ''
  const groupPath = (pathname.startsWith('/community/') ? pathname : searchParams.get('from') ?? '').match(/^\/community\/groups\/([\da-f-]{36})(?:[/?]|$)/i)
  const leaderEvents = groupPath ? `/community/events?group=${groupPath[1]}` : `/community/events${campaignQuery}`
  const sectionPath = pathname.startsWith('/contacts/') ? searchParams.get('from') ?? pathname : pathname
  const onEvents = sectionPath.startsWith('/community/events')
  const onInvitations = sectionPath.startsWith('/community/invites')
  const communityNavItems = [
    { href: `/community${campaignQuery}`, label: 'Groups', icon: <CommunityIcon />, active: !onEvents && !onInvitations },
    { href: leaderEvents, label: 'Events', icon: <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/></svg>, active: onEvents },
    { href: '/community/invites', label: 'Invitations', icon: <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>, active: onInvitations },
  ]
  const visibleNavItems = inCommunity
    ? communityNavItems
    : navItems

  return (
    <div className="follow-up-shell min-h-screen bg-[#f7f8fb] text-[#15223a]">
      {/* DESKTOP SIDEBAR */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[230px] bg-[#00274c] px-[18px] py-7 text-white md:block">
        <WorkspaceSwitcher key={`${pathname}:${inCommunity}`} community={inCommunity} dark />

        <div className="mt-7 rounded-2xl bg-white/[0.08] p-3.5">
          <div className="font-extrabold">
            {displayName}
          </div>

          <div className="mt-1 text-xs leading-5 text-white/70">
            {formatRole(role)}
            <br />
            {areaLabel}
          </div>

          <div className="mt-3 flex items-center gap-3 text-xs font-extrabold">
            <Link
              href="/profile"
              className="text-white/75 transition hover:text-white"
            >
              Profile
            </Link>

            <button
              type="button"
              onClick={signOut}
              className="text-white/75 transition hover:text-white"
            >
              Log out
            </button>
          </div>
        </div>

        <nav className="mt-6 grid gap-2">
          {visibleNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm transition',
                item.active
                  ? 'bg-white/[0.13] font-extrabold text-white'
                  : 'font-semibold text-white/80 hover:bg-white/[0.08] hover:text-white',
              ].join(' ')}
            >
              <span className="relative w-5 shrink-0 text-center text-lg">
                {item.icon}
                {item.href === '/contacts' && <MyContactAttentionBadge />}
                {inCommunity && item.label === 'Invitations' && <InviteBadge />}
                {inCommunity && item.label === 'Groups' && <InviteBadge kind="groups"/>}
              </span>

              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* MAIN AREA */}
      <div className="min-h-screen pb-[calc(88px+env(safe-area-inset-bottom))] md:ml-[230px] md:pb-0">
        {/* TOP BAR */}
        <header className="sticky top-0 z-20 border-b border-[#e4e7ec]/80 bg-[#f7f8fb]/95 px-[18px] py-3 backdrop-blur-xl md:px-7 md:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 md:hidden"><WorkspaceSwitcher key={`${pathname}:${inCommunity}`} community={inCommunity} /></div>
            <div className="hidden min-w-0 items-center gap-2.5 md:flex">

              <div className="min-w-0">
                <h1 className="zoom-wrap truncate text-[21px] font-extrabold tracking-[-0.025em] text-[#15223a]">
                  {pageTitle(pathname)}
                </h1>
              </div>
            </div>

            <div
              ref={profileMenuRef}
              className="relative shrink-0"
            >
              <button
                type="button"
                onClick={() =>
                  setProfileMenuOpen(
                    (current) => !current
                  )
                }
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
                aria-label="Open profile menu"
                className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#00274c] text-xs font-extrabold text-white transition hover:bg-[#113a67]"
              >
                {initials(displayName)}
              </button>

              {profileMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[46px] z-50 max-h-[calc(100dvh-150px)] w-[230px] overflow-y-auto rounded-[16px] border border-[#e4e7ec] bg-white shadow-[0_14px_40px_rgba(16,24,40,0.16)]"
                >
                  <div className="border-b border-[#eef0f3] px-4 py-3.5">
                    <div className="zoom-wrap truncate text-sm font-extrabold text-[#15223a]">
                      {displayName}
                    </div>

                    <div className="mt-1 text-xs leading-5 text-[#667085]">
                      {formatRole(role)}
                      {' • '}
                      {areaLabel}
                    </div>
                  </div>

                  <div className="p-1.5">
                    <div className="px-3 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#98a2b3]">
                      Field tools
                    </div>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setProfileMenuOpen(false)
                        setAddPersonOpen(true)
                      }}
                      className="flex w-full items-center rounded-[10px] px-3 py-2.5 text-left text-sm font-extrabold text-[#175cd3] transition hover:bg-[#eff8ff]"
                    >
                      + Add person
                    </button>

                    <div className="my-1.5 border-t border-[#eef0f3]" />

                    <div className="px-3 pb-1 pt-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#98a2b3]">
                      Account
                    </div>

                    {[
                      { href: '/my-stats', label: 'My Stats' },
                      { href: '/my-activity', label: 'My Activity' },
                    ].map((item) => (
                      <Link key={item.href} href={item.href} prefetch={false} role="menuitem"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex w-full items-center rounded-[10px] px-3 py-2.5 text-left text-sm font-extrabold text-[#15223a] transition hover:bg-[#f9fafb]">
                        {item.label}
                      </Link>
                    ))}

                    <Link
                      href="/profile"
                      role="menuitem"
                      onClick={() =>
                        setProfileMenuOpen(false)
                      }
                      className="flex w-full items-center rounded-[10px] px-3 py-2.5 text-left text-sm font-extrabold text-[#15223a] transition hover:bg-[#f9fafb]"
                    >
                      Profile
                    </Link>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={signOut}
                      className="flex w-full items-center rounded-[10px] px-3 py-2.5 text-left text-sm font-extrabold text-[#b42318] transition hover:bg-[#fef3f2]"
                    >
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {children}
      </div>

      {/* MOBILE BOTTOM NAV */}
      <nav aria-label={inCommunity ? 'Community navigation' : 'Follow Up navigation'} className="fixed inset-x-0 bottom-0 z-30 grid grid-flow-col auto-cols-fr border-t border-[#e4e7ec] bg-white px-1.5 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(16,24,40,0.06)] md:hidden">
        {(inCommunity ? communityNavItems : navItems).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.active ? 'page' : undefined}
            className={[
              'flex min-h-11 flex-col items-center justify-center px-1 py-1 text-center text-[11px] font-bold',
              item.active
                ? 'text-[#00274c]'
                : 'text-[#667085]',
            ].join(' ')}
          >
            <span className="mb-0.5 block text-xl leading-none">
              <span className="relative inline-block">{item.icon}{item.href === '/contacts' && <MyContactAttentionBadge />}{inCommunity && item.label === 'Invitations' && <InviteBadge />}{inCommunity && item.label === 'Groups' && <InviteBadge kind="groups"/>}</span>
            </span>

            {item.label}
          </Link>
        ))}
      </nav>

      <AddPersonModal
        open={addPersonOpen}
        onClose={() =>
          setAddPersonOpen(false)
        }
      />
    </div>
  )
}

function WorkspaceSwitcher({ community, dark = false }: { community: boolean; dark?: boolean }) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])
  // A route-keyed menu cannot stay open after navigation or browser Back.
  const [openedPath, setOpenedPath] = useState(pathname)
  const expanded = open && openedPath === pathname
  return <div ref={container} className="relative" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
  }} onKeyDown={(event) => {
    if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
  }}>
    <button ref={trigger} type="button" aria-expanded={expanded} aria-label={`Switch workspace, currently ${community ? 'Community' : 'Follow Up'}`}
      onClick={() => { setOpenedPath(pathname); setOpen(!expanded) }}
      className={`flex min-h-11 max-w-full items-center gap-2.5 text-left font-extrabold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ffcb05] ${dark ? 'text-white' : 'text-[#15223a]'}`}>
      <BrandMark small={!dark} community={community} />
      <span className="min-w-0">
        {!dark && <span className="block text-[10px] uppercase tracking-[0.12em] text-[#175cd3]">Michigan Cru</span>}
        <span className={`flex items-center gap-2 ${dark ? 'text-xl tracking-tight' : 'text-[21px] tracking-[-0.025em]'}`}>
          <span>{community ? 'Community' : 'Follow Up'}</span>
          {community ? <MyContactAttentionBadge inline/> : <InviteBadge inline kind="total"/>}
          <svg aria-hidden="true" viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 transition-transform ${dark ? 'text-white' : 'text-black'} ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4 6 4 4 4-4" /></svg>
        </span>
      </span>
    </button>
    {expanded && <div className="absolute left-0 top-full z-50 mt-2 w-[220px] max-w-[calc(100vw-36px)] rounded-2xl border border-[#e4e7ec] bg-white p-1.5 text-[#15223a] shadow-[0_8px_28px_rgba(16,24,40,0.22)]">
      <nav aria-label="Workspaces">{[{ name: 'Follow Up', href: '/', community: false }, { name: 'Community', href: '/community', community: true }].filter((item) => item.community !== community).map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
        className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-extrabold hover:bg-[#f9fafb] focus-visible:outline-2 focus-visible:outline-[#ffcb05]">
        <BrandMark small community={item.community}/><span>{item.name}</span>
        {item.community ? <InviteBadge inline kind="total"/> : <MyContactAttentionBadge inline/>}
      </Link>)}</nav>
    </div>}
  </div>
}

function BrandMark({
  community = false,
  small = false,
}: {
  community?: boolean
  small?: boolean
}) {
  return (
    <div
      className={[
        'grid shrink-0 place-items-center bg-[#ffcb05] text-[#00274c]',
        small
          ? 'h-8 w-8 rounded-[10px]'
          : 'h-9 w-9 rounded-[11px]',
      ].join(' ')}
    >
      {community ? <CommunityIcon /> : <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={
          small
            ? 'h-5 w-5'
            : 'h-[23px] w-[23px]'
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 4.5h10a3 3 0 0 1 3 3v8.5a3 3 0 0 1-3 3h-5.7L7 22v-2.8H7a3 3 0 0 1-3-3V7.5a3 3 0 0 1 3-3Z" />
        <path d="M12 7.2v9.8" />
        <path d="M9.4 10.2h5.2" />
      </svg>}
    </div>
  )
}

function CommunityIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="inline-block h-5 w-5 align-middle" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="3" />
      <path d="M7 20v-2a5 5 0 0 1 10 0v2H7Z" />
      <path d="M6 5a2.5 2.5 0 1 0 0 5M18 5a2.5 2.5 0 1 1 0 5M5 13a4 4 0 0 0-4 4v1h3M19 13a4 4 0 0 1 4 4v1h-3" />
    </svg>
  )
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function formatRole(role: string) {
  switch (role) {
    case 'student_leader':
      return 'Student Leader'

    case 'discipler':
      return 'Discipler'

    case 'staff':
      return 'Staff'

    case 'admin':
      return 'Admin'

    default:
      return role
  }
}

function pageTitle(pathname: string) {
  if (pathname.startsWith('/community')) return 'Community'
  if (pathname === '/my-stats') return 'My Stats'
  if (pathname === '/my-activity') return 'My Activity'

  if (
    pathname === '/profile' ||
    pathname.startsWith('/profile/')
  ) {
    return 'Profile'
  }

  if (
    pathname.startsWith(
      '/opportunities/share-the-gospel'
    )
  ) {
    return 'Share the Gospel'
  }

  if (
    pathname.startsWith(
      '/opportunities/meet-someone-new'
    )
  ) {
    return 'Meet Someone New'
  }

  if (
    pathname.startsWith(
      '/opportunities/community-group'
    )
  ) {
    return 'Invite to Community Group'
  }

  if (
    pathname.startsWith(
      '/opportunities/no-address'
    )
  ) {
    return 'No Address'
  }

  if (
    pathname.startsWith(
      '/opportunities/go-back'
    )
  ) {
    return 'Go Back'
  }

  if (
    pathname === '/contacts/area'
  ) {
    return 'Contacts in My Area'
  }

  if (
    pathname === '/contacts/attention'
  ) {
    return 'My Contacts — Needs Attention'
  }

  if (
    pathname.startsWith('/contacts/')
  ) {
    return 'Contact'
  }

  if (
    pathname === '/contacts'
  ) {
    return 'My Contacts'
  }

  if (
    pathname === '/assign-contacts' ||
    pathname.startsWith('/assign-contacts/')
  ) {
    return 'Assign Contacts'
  }

  if (
    pathname === '/disciples' ||
    pathname.startsWith('/disciples/')
  ) {
    return 'My Disciples'
  }

  if (
    pathname.startsWith('/manage') ||
    pathname.startsWith('/admin')
  ) {
    return 'Manage'
  }

  if (
    pathname === '/god-at-work' ||
    pathname.startsWith('/god-at-work/')
  ) {
    return 'God at Work'
  }

  return 'Follow Up'
}
