import Link from 'next/link'
import { personalReportPeriods, type PersonalReportPeriod } from '@/lib/personal-reports'

export function PersonalReportHeader({ page, period }: { page: 'stats' | 'activity'; period: PersonalReportPeriod }) {
  return (
    <div className="border-b border-[#e4e7ec] bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-[#15223a]">{page === 'stats' ? 'My Stats' : 'My Activity'}</h1>
        <Link prefetch={false} href={`/my-${page === 'stats' ? 'activity' : 'stats'}?period=${period}`} className="text-sm font-bold text-[#175cd3] hover:underline">
          {page === 'stats' ? 'View My Activity →' : 'View My Stats →'}
        </Link>
      </div>
      <p className="mt-2 text-sm leading-6 text-[#667085]">Your own logged work in the active campaign, across all ministry areas.</p>
      <nav aria-label="Time period" className="mt-4 flex flex-wrap gap-2">
        {personalReportPeriods.map((choice) => <Link key={choice.value} prefetch={false}
          href={`/my-${page}?period=${choice.value}`} aria-current={period === choice.value ? 'page' : undefined}
          className={`rounded-[11px] border px-3 py-2.5 text-sm font-extrabold ${period === choice.value ? 'border-[#00274c] bg-[#00274c] text-white' : 'border-[#e4e7ec] bg-white text-[#667085] hover:bg-[#f9fafb]'}`}>
          {choice.label}
        </Link>)}
      </nav>
    </div>
  )
}
