export function AppLoading() {
  return (
    <main
      className="grid min-h-screen place-items-center bg-[#f7f8fb] px-5"
      aria-busy="true"
      aria-label="Loading Follow Up"
    >
      <div className="flex w-full max-w-[240px] flex-col items-center">
        <img
          src="/icon-512(1).png"
          alt=""
          width="96"
          height="96"
          className="h-24 w-24 rounded-[24px] shadow-[0_10px_30px_rgba(0,39,76,0.16)]"
        />

        <div
          className="mt-7 h-1.5 w-40 overflow-hidden rounded-full bg-[#d9e2f2]"
          role="progressbar"
          aria-label="Loading"
        >
          <div className="app-loading-progress h-full w-2/5 rounded-full bg-[#175cd3]" />
        </div>

        <span className="sr-only">Loading Follow Up…</span>
      </div>
    </main>
  )
}
