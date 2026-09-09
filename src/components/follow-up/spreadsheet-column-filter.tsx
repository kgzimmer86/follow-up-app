'use client'

import { createContext, useContext, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { updateSpreadsheetColumnFilter, spreadsheetFilterOptions, spreadsheetHeaderSelection, type SpreadsheetFilterKind } from '@/lib/spreadsheet-filter-options'
import { SurveyColumnFilter } from '@/components/follow-up/survey-column-filter'

const SpreadsheetFiltersContext = createContext<{
  pending: boolean
  updateFilters: (params: URLSearchParams) => void
} | null>(null)

export function SpreadsheetFilterProvider({ saveFiltersAction, children }: {
  saveFiltersAction: (query: string) => Promise<string>
  children: ReactNode
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  const inFlight = useRef(false)

  function updateFilters(params: URLSearchParams) {
    // All column controls share this lock so a second column cannot overwrite
    // a change that is still being saved or loaded.
    if (pending || inFlight.current) return
    inFlight.current = true
    setError(false)
    startTransition(async () => {
      try {
        const href = await saveFiltersAction(params.toString())
        startTransition(() => router.replace(`${href}#results`, { scroll: false }))
      } catch {
        setError(true)
      } finally {
        inFlight.current = false
      }
    })
  }

  return (
    <SpreadsheetFiltersContext.Provider value={{ pending, updateFilters }}>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">Couldn’t save your filters. Please try again.</p>}
      {children}
    </SpreadsheetFiltersContext.Provider>
  )
}

export function useSpreadsheetFilters() {
  const context = useContext(SpreadsheetFiltersContext)
  if (!context) throw new Error('Spreadsheet filters require their saving controls.')
  return context
}

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
  const searchParams = useSearchParams()
  const { pending, updateFilters } = useSpreadsheetFilters()
  const options = spreadsheetFilterOptions[kind]
  const selection = spreadsheetHeaderSelection(kind, value, personalValue)

  function updateFilter(nextValue: string) {
    const params = new URLSearchParams(searchParams.toString())
    updateSpreadsheetColumnFilter(params, param, nextValue)
    updateFilters(params)
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
