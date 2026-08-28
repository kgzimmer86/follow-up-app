'use client'

import { useRouter } from 'next/navigation'

export function ContactBackButton() {
  const router = useRouter()

  function goBack() {
    if (window.history.length > 1) {
      router.back()
      return
    }

    router.push('/contacts')
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-extrabold text-[#475467] transition hover:text-[#15223a]"
      aria-label="Back to contact list"
    >
      <span aria-hidden="true">←</span>
      Back
    </button>
  )
}