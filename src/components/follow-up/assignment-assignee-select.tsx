'use client'

import { memo, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { observeAssignmentSelect } from '@/lib/assignment-viewport'

export type AssignmentOption = { id: string; label: string }

export const AssignmentAssigneeSelect = memo(function AssignmentAssigneeSelect({
  options, value, disabled, placeholder, onChange,
}: {
  options: AssignmentOption[]
  value: string
  disabled: boolean
  placeholder: string
  onChange: (value: string) => void
}) {
  const selectRef = useRef<HTMLSelectElement>(null)
  const near = useRef(false)
  const [expanded, setExpanded] = useState(false)
  const small = options.length <= 20
  useEffect(() => {
    const element = selectRef.current
    if (!element || small) return
    return observeAssignmentSelect(element, visible => {
      near.current = visible
      // Never remove choices while a native picker/keyboard interaction is open.
      setExpanded(visible || document.activeElement === element)
    })
  }, [small])
  function preparePicker() {
    // Near-screen pickers are already prepared. This fallback covers a rapid
    // scroll, keyboard focus, or assistive technology before the observer runs.
    // The native picker needs its options committed BEFORE its default action.
    if (!small && !expanded) flushSync(() => setExpanded(true))
  }
  const choices = small || expanded ? options : options.filter(option => option.id === value)
  return <select
    ref={selectRef}
    value={value}
    disabled={disabled}
    aria-label="Assign contact to"
    onPointerDown={preparePicker}
    onFocus={preparePicker}
    onKeyDown={preparePicker}
    onBlur={() => { if (!small && !near.current) setExpanded(false) }}
    onChange={event => onChange(event.target.value)}
    className="w-full rounded-[11px] border border-[#d0d5dd] bg-white px-3 py-2.5 text-sm font-semibold text-[#15223a]"
  >
    <option value="">{placeholder}</option>
    {choices.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select>
})
