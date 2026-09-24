'use client'

export function CheckboxFilterDropdown({ label, name, selected, options, emptyLabel = 'Any', onSelectionChange }: {
  label: string
  name: string
  selected: string[]
  options: { value: string; label: string; locked?: boolean }[]
  emptyLabel?: string
  onSelectionChange?: (values: string[]) => void
}) {
  const chosen = options.filter(option => selected.includes(option.value) && !option.locked)
  const summary = chosen.length === options.filter(option => !option.locked).length && chosen.length
    ? 'All available' : chosen.map(option => option.label).join(', ') || emptyLabel
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-xs font-bold text-[#667085]">{label}</div>
      <details className="rounded-[11px] border border-[#e4e7ec] bg-white">
        <summary aria-label={`${label}: ${summary}`} className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-[11px] px-2.5 py-2.5 text-sm text-[#15223a] focus-visible:outline-2 focus-visible:outline-[#175cd3] [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 truncate">{summary}</span>
          <svg aria-hidden="true" viewBox="0 0 16 20" fill="none" className="h-4 w-3 shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4 7 4-4 4 4M4 13l4 4 4-4" />
          </svg>
        </summary>
        <div className="grid gap-2 border-t border-[#eef0f3] p-3">
          {options.map(option => (
            <label key={option.value} className={`flex items-center gap-2 text-xs font-bold ${option.locked ? 'text-[#667085]' : 'text-[#475467]'}`}>
              <input type="checkbox" name={name} value={option.value} disabled={option.locked}
                {...(onSelectionChange ? {
                  checked: !option.locked && selected.includes(option.value),
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) => onSelectionChange(event.target.checked
                    ? [...selected, option.value] : selected.filter(value => value !== option.value)),
                } : { defaultChecked: !option.locked && selected.includes(option.value) })} className="h-4 w-4" />
              {option.label}
              {option.locked && <span aria-label="Locked: excluded from this list" title="Excluded from this list">🔒</span>}
            </label>
          ))}
          {options.length === 0 && <span className="text-xs text-[#667085]">No groups available</span>}
        </div>
      </details>
    </div>
  )
}
