import Link from 'next/link'

type ManageTab =
  | 'areas'
  | 'leaders'
  | 'assign'
  | 'import'
  | 'campaigns'
  | 'users'

type ManageTabsProps = {
  role: string
  active: ManageTab
}

type TabItem = {
  key: ManageTab
  label: string
  href: string
  roles: string[]
}

const tabs: TabItem[] = [
  { key: 'areas', label: 'Ministry Areas', href: '/manage', roles: ['staff', 'admin'] },
  { key: 'leaders', label: 'Leaders', href: '/manage/leaders', roles: ['staff', 'admin'] },
  { key: 'assign', label: 'Assign Contacts', href: '/assign-contacts', roles: ['discipler', 'staff', 'admin'] },
  { key: 'import', label: 'Import Survey', href: '/manage/import-survey', roles: ['staff', 'admin'] },
  { key: 'campaigns', label: 'Campaigns', href: '/manage/campaigns', roles: ['admin'] },
  { key: 'users', label: 'Users', href: '/admin/users', roles: ['admin'] },
]

export function ManageTabs({ role, active }: ManageTabsProps) {
  const visibleTabs = tabs.filter((tab) => tab.roles.includes(role))

  return (
    <nav className="mt-5 flex gap-1 overflow-x-auto rounded-[14px] border border-[#e4e7ec] bg-[#f9fafb] p-1.5">
      {visibleTabs.map((tab) => {
        if (tab.key === active) {
          return (
            <span
              key={tab.key}
              aria-current="page"
              className="shrink-0 rounded-[10px] bg-[#00274c] px-3.5 py-2.5 text-xs font-extrabold text-white"
            >
              {tab.label}
            </span>
          )
        }

        return (
          <Link
            key={tab.key}
            href={tab.href}
            className="shrink-0 rounded-[10px] px-3.5 py-2.5 text-xs font-extrabold text-[#475467] transition hover:bg-white hover:text-[#15223a]"
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
