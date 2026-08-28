import {
  ContactResultsPage,
  type ContactResultsSearchParams,
} from '@/components/follow-up/contact-results-page'

type PageProps = {
  searchParams: Promise<ContactResultsSearchParams>
}

export default async function ContactsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams

  return (
    <ContactResultsPage
      view="mine"
      basePath="/contacts"
      searchParams={params}
    />
  )
}