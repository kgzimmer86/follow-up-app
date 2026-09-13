import { DiscipleBackButton } from '@/components/follow-up/disciple-back-button'

export default function GroupNotFound() {
  return <main className="p-6">
    <p className="rounded-2xl border border-[#fedf89] bg-[#fff8eb] p-4 font-bold text-[#b54708]">Sorry, this group isn’t available or you don’t have access to it.</p>
    <div className="mt-4"><DiscipleBackButton href="/community" /></div>
  </main>
}
