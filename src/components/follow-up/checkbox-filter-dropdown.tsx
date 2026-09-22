export function CheckboxFilterDropdown({ label, name, selected, options, emptyLabel = 'Any' }: {
  label: string
  name: string
  selected: string[]
  options: { value: string; label: string; locked?: boolean }[]
  emptyLabel?: string
}) {
  const chosen = options.filter(option => selected.includes(option.value) && !option.locked)
  const summary = chosen.length === options.filter(option => !option.locked).length && chosen.length
    ? 'All available' : chosen.map(option => option.label).join(', ') || emptyLabel
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-xs font-bold text-[#667085]">{label}</div>
      <details className="rounded-[11px] border border-[#d0d5dd] bg-white">
        <summary aria-label={`${label}: ${summary}`} className="cursor-pointer px-3 py-2.5 text-sm text-[#15223a]">{summary}</summary>
        <div className="grid gap-2 border-t border-[#eef0f3] p-3">
          {options.map(option => (
            <label key={option.value} className={`flex items-center gap-2 text-xs font-bold ${option.locked ? 'text-[#667085]' : 'text-[#475467]'}`}>
              <input type="checkbox" name={name} value={option.value} disabled={option.locked}
                defaultChecked={!option.locked && selected.includes(option.value)} className="h-4 w-4" />
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
