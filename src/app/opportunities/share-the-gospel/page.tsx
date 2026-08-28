import {
  ContactResultsPage,
  type ContactResultsSearchParams,
} from '@/components/follow-up/contact-results-page'

type PageProps = {
  searchParams: Promise<ContactResultsSearchParams>
}

export default async function ShareTheGospelPage({
  searchParams,
}: PageProps) {
  const params = await searchParams

  return (
    <ContactResultsPage
      view="gospel"
      basePath="/opportunities/share-the-gospel"
      searchParams={params}
    />
  )
}