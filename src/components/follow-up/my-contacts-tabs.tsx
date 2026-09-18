import Link from 'next/link'

export function MyContactsTabs({ active }: { active: 'contacts' | 'steps' }) {
  return <nav aria-label="My Contacts views" className="my-4 flex gap-1 rounded-xl bg-[#eef0f3] p-1">
    {[{ id: 'contacts', label: 'Contacts', href: '/contacts' }, { id: 'steps', label: 'My Next Steps', href: '/contacts/next-steps' }].map(tab =>
      <Link key={tab.id} href={tab.href} aria-current={active === tab.id ? 'page' : undefined}
        className={`flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 text-sm font-extrabold ${active === tab.id ? 'bg-white text-[#00274c] shadow-sm' : 'text-[#667085]'}`}>
        {tab.label}
      </Link>)}
  </nav>
}
