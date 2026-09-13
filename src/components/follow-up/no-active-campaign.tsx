import Link from 'next/link'

export function NoActiveCampaign() {
  return <main className="grid min-h-[70vh] place-items-center bg-[#f7f8fb] px-5 py-8">
    <div className="w-full max-w-md rounded-[22px] border border-[#e4e7ec] bg-white p-7 shadow-[0_8px_28px_rgba(19,33,68,0.08)]">
      <div aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#ffcb05] text-[#00274c]">
        <svg viewBox="0 0 24 24" className="h-[23px] w-[23px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 4.5h10a3 3 0 0 1 3 3v8.5a3 3 0 0 1-3 3h-5.7L7 22v-2.8H7a3 3 0 0 1-3-3V7.5a3 3 0 0 1 3-3Z" />
          <path d="M12 7.2v9.8" /><path d="M9.4 10.2h5.2" />
        </svg>
      </div>
      <h1 className="mt-4 text-2xl font-extrabold text-[#15223a]">Follow Up is ready.</h1>
      <p className="mt-3 leading-6 text-[#667085]">There is not currently an active Follow Up campaign. An admin can activate the next campaign. Previous records are preserved.</p>
      <div className="mt-6 flex flex-col gap-3">
        <Link className="rounded-xl bg-[#00274c] px-4 py-3 text-center text-sm font-bold text-white hover:bg-[#113a67]" href="/manage/campaigns">Campaign management</Link>
        <Link className="rounded-xl border border-[#dbe8f8] px-4 py-3 text-center text-sm font-bold text-[#175cd3] hover:bg-[#eef4ff]" href="/community">Community history</Link>
      </div>
    </div>
  </main>
}
