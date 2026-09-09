'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { updateSpreadsheetColumnFilter, spreadsheetFilterOptions, spreadsheetHeaderSelection, type SpreadsheetFilterKind } from '@/lib/spreadsheet-filter-options'
import { SurveyColumnFilter } from '@/components/follow-up/survey-column-filter'

export function SpreadsheetColumnFilter({
  label,
  param,
  value,
  personalValue = '',
  kind = 'yesNo',
}: {
  label: string
  param: string
  value: string
  personalValue?: string
  kind?: SpreadsheetFilterKind
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const options = spreadsheetFilterOptions[kind]
  const selection = spreadsheetHeaderSelection(kind, value, personalValue)

  function updateFilter(nextValue: string) {
    const params = new URLSearchParams(searchParams.toString())
    updateSpreadsheetColumnFilter(params, param, nextValue)
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}#results`, { scroll: false })
    })
  }

  if (kind === 'jesus' || kind === 'survey') {
    return <SurveyColumnFilter label={label} kind={kind} value={value} personalValue={personalValue} pending={pending} onChange={updateFilter} />
  }

  return (
    <label className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <span
        title={`${label}: ${selection.label}`}
        className={[
          'relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border focus-within:ring-2 focus-within:ring-[#175cd3]',
          value || personalValue
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
          title={`${label}: ${selection.label}`}
          value={selection.value}
          disabled={pending}
          className="absolute inset-0 h-full w-full cursor-pointer text-sm font-normal normal-case tracking-normal text-[#15223a] opacity-0 disabled:cursor-wait"
          onChange={(event) => updateFilter(event.target.value)}
        >
          <option value="">Any</option>
          {selection.value === '__current' && (
            <option value="__current" disabled>{selection.label}</option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </span>
    </label>
  )
}
