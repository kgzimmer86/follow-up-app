import Link from 'next/link'

type DiscipleBackButtonProps = {
  href?: string
}

export function DiscipleBackButton({
  href = '/disciples',
}: DiscipleBackButtonProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#475467] transition hover:text-[#15223a]"
    >
      <span aria-hidden="true">←</span>
      Back
    </Link>
  )
}
