export function TestEnvironmentBanner() {
  // NODE_ENV is production for both Preview and Production builds.
  if (process.env.VERCEL_ENV !== 'preview') return null

  return (
    <aside aria-label="Test environment" className="relative z-40 border-b-2 border-amber-600 bg-amber-100 px-4 py-3 text-center text-sm text-amber-950">
      <strong className="font-extrabold">TEST ENVIRONMENT</strong>
      <span className="ml-2">For testing only. Do not enter real student information.</span>
    </aside>
  )
}
