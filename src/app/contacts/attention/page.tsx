import { notFound, redirect } from 'next/navigation'

export default async function AttentionPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category = 'awaiting' } = await searchParams
  if (!['awaiting', 'stale', 'new-believers'].includes(category)) notFound()
  redirect(`/contacts?context=1&attention=${category}`)
}
