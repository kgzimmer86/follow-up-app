import {
  ContactResultsPage,
  type ContactResultsSearchParams,
} from '@/components/follow-up/contact-results-page'

type PageProps = {
  searchParams: Promise<ContactResultsSearchParams>
}

export default async function NoAddressPage({
  searchParams,
}: PageProps) {
  const params = await searchParams

  return (
    <ContactResultsPage
      view="noaddress"
      basePath="/opportunities/no-address"
      searchParams={params}
    />
  )
}