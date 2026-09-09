export function SurveyInterestRow({
  values,
}: {
  values: { label: string; value: string | null }[]
}) {
  return (
    <div className="my-3 grid grid-cols-3 gap-1.5">
      {values.map(({ label, value }) => (
        <span
          key={label}
          className={[
            'min-w-0 rounded-lg border px-1.5 py-1.5 text-center text-[11px] leading-tight',
            surveyClass(value),
          ].join(' ')}
        >
          <strong className="block break-words">{label}</strong>
          <span className="mt-0.5 block break-words">{formatSurveyAnswer(value)}</span>
        </span>
      ))}
    </div>
  )
}

export function InvitedToCommunityGroupPill({ done }: { done: boolean }) {
  return (
    <span
      className={[
        'rounded-full px-2 py-1.5 font-bold',
        done
          ? 'bg-[#ecfdf3] text-[#027a48]'
          : 'bg-[#f2f4f7] text-[#475467]',
      ].join(' ')}
    >
      {done ? '✓' : '○'} Invited to CG
    </span>
  )
}

function surveyClass(value: string | null) {
  switch (value) {
    case 'yes':
      return 'border-[#abefc6] bg-[#ecfdf3] text-[#027a48]'
    case 'maybe':
      return 'border-[#fedf89] bg-[#fff8eb] text-[#b54708]'
    case 'no':
      return 'border-[#fecdca] bg-[#fef3f2] text-[#b42318]'
    default:
      return 'border-[#e4e7ec] bg-[#f9fafb] text-[#667085]'
  }
}

function formatSurveyAnswer(value: string | null) {
  switch (value) {
    case 'yes': return 'Yes'
    case 'maybe': return 'Maybe'
    case 'no': return 'No'
    case 'already_have_one': return 'Already have one'
    default: return '—'
  }
}
