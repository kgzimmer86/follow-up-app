import Link from 'next/link'

export function SectionTabs({ label, tabs }: { label: string; tabs: { href: string; label: string; active: boolean }[] }) {
  return <nav data-navigation-tabs aria-label={label} className="my-5 flex gap-1 overflow-x-auto rounded-[14px] border border-[#e4e7ec] bg-[#f9fafb] p-1.5">
    {tabs.map(tab => <Link key={tab.href} href={tab.href} aria-current={tab.active ? 'page' : undefined} className={`inline-flex min-h-11 shrink-0 items-center rounded-[10px] px-3.5 py-2.5 text-xs font-extrabold transition ${tab.active ? 'bg-[#00274c] text-white' : 'text-[#475467] hover:bg-white hover:text-[#15223a]'}`}>{tab.label}</Link>)}
  </nav>
}
