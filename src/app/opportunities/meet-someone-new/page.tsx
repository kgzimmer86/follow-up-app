import {
  ContactResultsPage,
  type ContactResultsSearchParams,
} from '@/components/follow-up/contact-results-page'

type PageProps = {
  searchParams: Promise<ContactResultsSearchParams>
}

export default async function MeetSomeoneNewPage({
  searchParams,
}: PageProps) {
  const params = await searchParams

  return (
    <ContactResultsPage
      view="new"
      basePath="/opportunities/meet-someone-new"
      searchParams={params}
    />
  )
}