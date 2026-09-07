'use client'

import { useRouter } from 'next/navigation'

type DiscipleBackButtonProps = {
  href?: string
}

export function DiscipleBackButton({
  href,
}: DiscipleBackButtonProps) {
  const router = useRouter()

  function goBack() {
    if (href) {
      router.push(href)
      return
    }

    if (window.history.length > 1) {
      router.back()
      return
    }

    router.push('/disciples')
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#475467] transition hover:text-[#15223a]"
    >
      <span aria-hidden="true">←</span>
      Back
    </button>
  )
}