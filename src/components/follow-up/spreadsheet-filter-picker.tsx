'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const filterOptions = [
  {
    key: 'email',
    label: 'Email',
    param: 'sheetEmail',
    values: [
      { value: 'has', label: 'Has email' },
      { value: 'missing', label: 'No email' },
    ],
  },
  {
    key: 'textCg',
    label: 'Texted CG',
    param: 'sheetTextCg',
    values: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    key: 'textAcg',
    label: 'Texted ACG',
    param: 'sheetTextAcg',
    values: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    key: 'textAppointment',
    label: 'Texted appointment',
    param: 'sheetTextAppointment',
    values: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    key: 'textEvent',
    label: 'Texted another event',
    param: 'sheetTextEvent',
    values: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    key: 'textFollowUp',
    label: 'Texted general follow-up',
    param: 'sheetTextFollowUp',
    values: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    key: 'invitedCg',
    label: 'Invited to CG',
    param: 'sheetInvitedCg',
    values: [
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    key: 'latestText',
    label: 'Latest text',
    param: 'sheetLatestText',
    values: [
      { value: 'has', label: 'Has text' },
      { value: 'missing', label: 'No text' },
    ],
  },
] as const

type SpreadsheetFilterKey = typeof filterOptions[number]['key']

export function SpreadsheetFilterPicker({
  filters,
  activeCount,
}: {
  filters: Record<SpreadsheetFilterKey, string>
  activeCount: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)

  function updateFilter(param: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(param, value)
    else params.delete(param)
    params.delete('page')
    router.replace(`${pathname}?${params.toString()}#results`, { scroll: false })
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-[10px] border border-[#e4e7ec] bg-white px-3 py-2 text-xs font-extrabold text-[#475467] hover:border-[#98a2b3]"
      >
        Filter{activeCount > 0 ? ` · ${activeCount}` : ''}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[275px] rounded-[14px] border border-[#e4e7ec] bg-white p-3 shadow-[0_12px_30px_rgba(16,24,40,0.14)]">
          <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
            Spreadsheet filters
          </div>

          <div className="grid gap-2.5">
            {filterOptions.map((option) => (
              <label key={option.key} className="grid gap-1">
                <span className="text-xs font-extrabold text-[#475467]">
                  {option.label}
                </span>
                <select
                  value={filters[option.key]}
                  onChange={(event) => updateFilter(option.param, event.target.value)}
                  className="w-full rounded-[9px] border border-[#e4e7ec] bg-white px-2 py-2 text-xs font-bold text-[#475467]"
                >
                  <option value="">Any</option>
                  {option.values.map((value) => (
                    <option key={value.value} value={value.value}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <p className="mt-3 text-[11px] leading-4 text-[#98a2b3]">
            These filters apply before the spreadsheet pages are counted.
          </p>
        </div>
      )}
    </div>
  )
}
