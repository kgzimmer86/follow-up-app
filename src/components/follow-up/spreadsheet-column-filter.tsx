'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { spreadsheetFilterOptions, type SpreadsheetFilterKind } from '@/lib/spreadsheet-filter-options'

export function SpreadsheetColumnFilter({
  label,
  param,
  value,
  kind = 'yesNo',
}: {
  label: string
  param: string
  value: string
  kind?: SpreadsheetFilterKind
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const options = spreadsheetFilterOptions[kind]
  const selection = options.find((option) => option.value === value)?.label ?? 'Any'

  return (
    <label className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <span
        title={`${label}: ${selection}`}
        className={[
          'relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border focus-within:ring-2 focus-within:ring-[#175cd3]',
          value
            ? 'border-[#b2ccff] bg-[#eef4ff] text-[#175cd3]'
            : 'border-transparent text-[#667085] hover:border-[#d0d5dd] hover:bg-white',
          pending ? 'opacity-50' : '',
        ].join(' ')}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {/* A native menu stays usable inside the table's scrolling container. */}
        <select
          aria-label={`Filter ${label}`}
          title={`${label}: ${selection}`}
          value={value}
          disabled={pending}
          className="absolute inset-0 h-full w-full cursor-pointer text-sm font-normal normal-case tracking-normal text-[#15223a] opacity-0 disabled:cursor-wait"
          onChange={(event) => {
            const params = new URLSearchParams(searchParams.toString())
            if (event.target.value) params.set(param, event.target.value)
            else params.delete(param)
            params.delete('page')
            startTransition(() => {
              router.replace(`${pathname}?${params.toString()}#results`, { scroll: false })
            })
          }}
        >
          <option value="">Any</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </span>
    </label>
  )
}
