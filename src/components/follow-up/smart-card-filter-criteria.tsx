import { Fragment } from 'react'

function FixedChoice({ text }: { text: string }) {
  return (
    <span className="inline-flex items-start gap-2 text-sm font-bold text-[#15223a]">
      <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[#ffcb05] text-[#00274c]">✓</span>
      {text}
    </span>
  )
}

function InterestCriterion({ criterion }: { criterion: string }) {
  const match = /^(.*): Yes or Maybe$/.exec(criterion)
  if (!match) return <FixedChoice text={criterion} />
  return (
    <div>
      <div className="mb-2 text-xs font-extrabold text-[#475467]">{match[1]}</div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <FixedChoice text="Yes" />
        <FixedChoice text="Maybe" />
      </div>
    </div>
  )
}

// Presentation only: these are descriptions, deliberately not named form inputs.
// The existing RPC continues to own the fixed rules, including cross-field OR.
export function SmartCardFilterCriteria({ title, criteria }: { title: string; criteria: string[] }) {
  if (!criteria.length) return null
  return (
    <>
      <section aria-label={`${title} Criteria · Locked`} className="rounded-xl border border-[#f5da77] bg-[#fff8db] p-4">
        <h3 className="flex items-center gap-2 text-xs font-extrabold text-[#475467]">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          {title} Criteria
        </h3>
        <div className="mt-3 grid gap-4">
          {criteria.map((criterion) => {
            const alternatives = criterion.replace(/ \(either qualifies\)$/, '').split(' OR ')
            return alternatives.length > 1 ? (
              <div key={criterion}>
                {alternatives.map((alternative, index) => (
                  <Fragment key={alternative}>
                    {index > 0 && <div className="my-3 flex items-center gap-3 text-xs font-extrabold text-[#667085]"><span className="h-px flex-1 bg-[#e7d9a5]" />OR<span className="h-px flex-1 bg-[#e7d9a5]" /></div>}
                    <InterestCriterion criterion={alternative} />
                  </Fragment>
                ))}
                <p className="mt-3 text-xs leading-5 text-[#475467]">Either section qualifies; both can match.</p>
              </div>
            ) : <InterestCriterion key={criterion} criterion={criterion} />
          })}
        </div>
      </section>
      <div className="my-4 flex items-center gap-3 text-xs font-extrabold text-[#667085]"><span className="h-px flex-1 bg-[#d8dee8]" />AND<span className="h-px flex-1 bg-[#d8dee8]" /></div>
    </>
  )
}
