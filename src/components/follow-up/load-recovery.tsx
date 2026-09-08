'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function LoadRecovery({
  fullScreen = false,
  onRetry,
}: {
  fullScreen?: boolean
  onRetry?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <main className={`grid ${fullScreen ? 'min-h-screen' : 'min-h-[60vh]'} place-items-center bg-[#f7f8fb] px-5 py-8`}>
      {pending && <div aria-hidden="true" className="app-navigation-indicator app-navigation-indicator-visible" />}
      <div className="w-full max-w-md rounded-[22px] border border-[#e4e7ec] bg-white p-7 shadow-[0_8px_28px_rgba(19,33,68,0.08)]" aria-busy={pending}>
        <h1 className="text-2xl font-extrabold text-[#15223a]">
          {fullScreen ? 'We couldn’t finish opening Follow Up.' : 'We couldn’t load this page.'}
        </h1>
        <p className="mt-3 leading-6 text-[#667085]">
          Please check your connection and try again.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => {
            if (onRetry) onRetry()
            else router.refresh()
          })}
          className="mt-5 rounded-xl bg-[#00274c] px-5 py-3 text-sm font-extrabold text-white disabled:opacity-60"
        >
          Try again
        </button>
      </div>
    </main>
  )
}
