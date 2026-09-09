'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { clearSpreadsheetColumnFilter } from '@/lib/spreadsheet-filter-options'
import { useSpreadsheetFilters } from '@/components/follow-up/spreadsheet-column-filter'
import {
  parseSpreadsheetColumns,
  spreadsheetColumnOptions,
  type SpreadsheetColumnKey,
} from '@/lib/spreadsheet-columns'

const storagePrefix = 'follow-up-spreadsheet-columns-'

export function SpreadsheetColumnPicker({
  userId,
  selectedColumns,
}: {
  userId: string
  selectedColumns: SpreadsheetColumnKey[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [open, setOpen] = useState(false)
  const { pending, updateFilters } = useSpreadsheetFilters()
  const hasColumnsParam = searchParams.has('columns')
  const columns = selectedColumns

  useEffect(() => {
    if (hasColumnsParam || pending) return

    try {
      const saved = parseSpreadsheetColumns(
        window.localStorage.getItem(`${storagePrefix}${userId}`) ?? undefined
      )
      if (saved.length === 0) return

      const params = new URLSearchParams(searchParams.toString())
      params.set('columns', saved.join(','))
      router.replace(`${pathname}?${params.toString()}#results`, { scroll: false })
    } catch {
      // The spreadsheet still works when browser storage is unavailable.
    }
  }, [hasColumnsParam, pathname, router, searchParams, userId, pending])

  function updateColumns(nextColumns: SpreadsheetColumnKey[]) {
    if (pending) return
    const ordered = spreadsheetColumnOptions
      .map((option) => option.value)
      .filter((key) => nextColumns.includes(key))

    try {
      window.localStorage.setItem(`${storagePrefix}${userId}`, ordered.join(','))
    } catch {
      // The URL remains the source of truth for this visit.
    }

    const params = new URLSearchParams(searchParams.toString())
    const previousFilters = params.toString()
    for (const option of spreadsheetColumnOptions) {
      if (!ordered.includes(option.value)) clearSpreadsheetColumnFilter(params, option.filterParam)
    }
    const filtersChanged = params.toString() !== previousFilters
    if (ordered.length > 0) params.set('columns', ordered.join(','))
    else params.delete('columns')
    params.delete('page')
    if (filtersChanged) updateFilters(params)
    else router.replace(`${pathname}?${params.toString()}#results`, { scroll: false })
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-[10px] border border-[#e4e7ec] bg-white px-3 py-2 text-xs font-extrabold text-[#475467] hover:border-[#98a2b3]"
      >
        Columns{columns.length > 0 ? ` · ${columns.length}` : ''}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[245px] rounded-[14px] border border-[#e4e7ec] bg-white p-3 shadow-[0_12px_30px_rgba(16,24,40,0.14)]">
          <div className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#667085]">
            Optional columns
          </div>

          <div className="grid gap-2">
            {spreadsheetColumnOptions.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 text-xs font-bold text-[#475467]"
              >
                <input
                  type="checkbox"
                  disabled={pending}
                  checked={columns.includes(option.value)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...columns, option.value]
                      : columns.filter((column) => column !== option.value)
                    updateColumns(next)
                  }}
                  className="h-4 w-4 rounded border-[#d0d5dd]"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

          <p className="mt-3 text-[11px] leading-4 text-[#98a2b3]">
            Text columns show whether it was ever logged and the most recent date.
          </p>
        </div>
      )}
    </div>
  )
}
