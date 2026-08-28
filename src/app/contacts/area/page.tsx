import {
  ContactResultsPage,
  type ContactResultsSearchParams,
} from '@/components/follow-up/contact-results-page'

type PageProps = {
  searchParams: Promise<ContactResultsSearchParams>
}

export default async function ContactsInAreaPage({
  searchParams,
}: PageProps) {
  const params = await searchParams

  return (
    <ContactResultsPage
      view="area"
      basePath="/contacts/area"
      searchParams={params}
    />
  )
}