'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { spreadsheetFilterOptions, spreadsheetHeaderSelection, spreadsheetSelectedAnswers } from '@/lib/spreadsheet-filter-options'

export function SurveyColumnFilter({ label, kind, value, personalValue, pending, onChange }: {
  label: string
  kind: 'jesus' | 'survey'
  value: string
  personalValue: string
  pending: boolean
  onChange: (value: string) => void
}) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const options = spreadsheetFilterOptions[kind]
  const answers = spreadsheetSelectedAnswers(kind, value, personalValue)
  const selection = spreadsheetHeaderSelection(kind, value, personalValue)
  const active = Boolean(value || personalValue)

  useEffect(() => {
    if (!position) return
    panelRef.current?.querySelector<HTMLInputElement>('input')?.focus()
    function outside(event: PointerEvent) {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setPosition(null)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPosition(null)
        buttonRef.current?.focus()
      }
    }
    function dismiss(event: Event) {
      if (!(event.target instanceof Node) || !panelRef.current?.contains(event.target)) setPosition(null)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [position])

  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Filter ${label}`}
        aria-expanded={Boolean(position)}
        aria-controls={position ? id : undefined}
        aria-haspopup="dialog"
        title={`${label}: ${selection.label}`}
        className={[
          'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border focus-visible:ring-2 focus-visible:ring-[#175cd3]',
          active ? 'border-[#b2ccff] bg-[#eef4ff] text-[#175cd3]' : 'border-transparent text-[#667085] hover:border-[#d0d5dd] hover:bg-white',
          pending ? 'opacity-50' : '',
        ].join(' ')}
        onClick={() => {
          if (position) { setPosition(null); return }
          const bounds = buttonRef.current?.getBoundingClientRect()
          if (!bounds) return
          const height = 96 + (options.length + 1) * 32
          setPosition({
            left: Math.max(8, Math.min(bounds.left, window.innerWidth - 240)),
            top: bounds.bottom + height < window.innerHeight ? bounds.bottom + 6 : Math.max(8, bounds.top - height),
          })
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {position && createPortal(
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={`${label} filter`}
          className="fixed z-[100] w-[232px] overflow-y-auto rounded-[14px] border border-[#e4e7ec] bg-white p-3 text-xs font-bold text-[#475467] shadow-[0_12px_30px_rgba(16,24,40,0.14)]"
          style={{ ...position, maxHeight: `calc(100vh - ${position.top + 8}px)` }}
        >
          <div className="text-xs font-extrabold text-[#15223a]">{label}</div>
          <p className="mb-2 mt-1 text-[11px] font-normal text-[#667085]">Choose any answers to include.</p>
          <fieldset disabled={pending} className="grid gap-1 disabled:opacity-60" aria-busy={pending}>
            <legend className="sr-only">{label} answers</legend>
            <label className="flex min-h-8 cursor-pointer items-center gap-2">
              <input type="checkbox" checked={!active} onChange={() => onChange('')} className="h-4 w-4 accent-[#175cd3]" />
              Any
            </label>
            {options.map((option) => (
              <label key={option.value} className="flex min-h-8 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={answers.includes(option.value)}
                  className="h-4 w-4 accent-[#175cd3]"
                  onChange={(event) => {
                    const next = event.target.checked ? [...answers, option.value] : answers.filter((answer) => answer !== option.value)
                    onChange(options.filter((answer) => next.includes(answer.value)).map((answer) => answer.value).join(','))
                  }}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          {active && answers.length === 0 && <p className="mt-2 text-[11px]">No matching answers. Choose an answer or Any.</p>}
        </div>,
        document.body,
      )}
    </span>
  )
}
