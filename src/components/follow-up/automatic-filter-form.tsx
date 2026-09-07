'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { personalFilterKeys } from '@/lib/contact-filters'

export function AutomaticFilterForm({
  applyFilters,
  filterStateKey,
  children,
}: {
  applyFilters: (formData: FormData) => Promise<string>
  filterStateKey: string
  children: ReactNode
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const [scheduled, setScheduled] = useState(false)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function scheduleUpdate(delay = 250) {
    if (inFlight.current || pending) return
    if (timer.current) clearTimeout(timer.current)
    setError(false)
    setScheduled(true)
    timer.current = setTimeout(() => {
      timer.current = null
      const form = formRef.current
      if (!form) return
      // Capture before disabling inputs: disabled fields are omitted by FormData.
      const data = new FormData(form)
      inFlight.current = true
      setScheduled(false)
      startTransition(async () => {
        try {
          const href = await applyFilters(data)
          if (mounted.current) {
            // Also reset controls if a quick change was reversed before saving.
            startTransition(() => {
              setRevision((value) => value + 1)
              router.replace(href, { scroll: false })
            })
          }
        } catch {
          if (mounted.current) setError(true)
        } finally {
          inFlight.current = false
        }
      })
    }, delay)
  }

  function clearFilters() {
    const form = formRef.current
    if (!form) return
    for (const element of Array.from(form.elements)) {
      if (
        (element instanceof HTMLSelectElement || element instanceof HTMLInputElement) &&
        personalFilterKeys.some((key) => key === element.name)
      ) {
        if (element instanceof HTMLInputElement && element.type === 'checkbox') {
          element.checked = false
        } else {
          element.value = ''
        }
      }
    }
    scheduleUpdate(0)
  }

  return (
    <form
      ref={formRef}
      className="border-t border-[#e4e7ec] p-4"
      aria-busy={scheduled || pending}
      onSubmit={(event) => {
        event.preventDefault()
        scheduleUpdate(0)
      }}
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement && event.target.name === 'location') {
          for (const name of ['floor', 'wing']) {
            const field = event.currentTarget.elements.namedItem(name)
            if (field instanceof HTMLSelectElement) {
              field.value = ''
              field.disabled = true
            }
          }
        }
        scheduleUpdate()
      }}
    >
      <div role="status" aria-live="polite" className="mb-3 text-xs text-[#667085]">
        {scheduled || pending ? 'Updating…' : 'Filters update automatically.'}
      </div>
      {/* Keep the surrounding details open, but refresh uncontrolled values when
          new server results arrive (including back/forward navigation). */}
      <fieldset key={`${filterStateKey}-${revision}`} disabled={pending} className="min-w-0">
        {children}
        <div className="mt-4 flex flex-wrap gap-2 border-t border-[#eef0f3] pt-4">
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-[11px] border border-[#e4e7ec] bg-white px-4 py-2.5 text-sm font-extrabold text-[#15223a] disabled:opacity-60"
          >
            Clear Filters
          </button>
          {error && (
            <button type="submit" className="text-sm font-extrabold text-[#175cd3]">
              Retry
            </button>
          )}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          Couldn’t update filters. Your choices are still here; please retry.
        </p>
      )}
    </form>
  )
}
