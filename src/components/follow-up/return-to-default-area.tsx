'use client'

import { useActionState } from 'react'
import { startFilterSession } from '@/app/filter-session-actions'

export function ReturnToDefaultArea({ userId, areaName }: { userId: string; areaName: string }) {
  const [error, resetArea, pending] = useActionState(async () => {
    try {
      // Reuse the authenticated area reset. Saving the cookie also refreshes
      // Home's heading and counts, while preserving other personal filters.
      await startFilterSession(userId)
      return null
    } catch {
      return 'We couldn’t restore your default ministry area. Please try again.'
    }
  }, null)

  return (
    <form action={resetArea} className="mb-3" aria-busy={pending}>
      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-between gap-3 rounded-[14px] bg-[#fff8eb] px-[13px] py-[11px] text-left text-xs font-bold text-[#b54708] hover:underline disabled:opacity-60"
      >
        <span>Return to default ministry area: <strong>{areaName}</strong></span>
        <span aria-hidden="true">↻</span>
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </form>
  )
}
