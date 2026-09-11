'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

function refreshSurveyViews(contactId: string) {
  revalidatePath(`/contacts/${contactId}`)
  revalidatePath('/')
  revalidatePath('/contacts')
  revalidatePath('/contacts/area')
  for (const path of ['community-group', 'share-the-gospel', 'meet-someone-new', 'go-back', 'no-address']) {
    revalidatePath(`/opportunities/${path}`)
  }
  revalidatePath('/assign-contacts')
}

export async function saveContactSurveyField(contactId: string, field: string, value: string) {
  const { error } = await (await createClient()).rpc('set_contact_survey_field', { p_contact_id: contactId, p_field: field, p_value: value })
  if (error) throw new Error('Couldn’t save this survey answer. Please try again.')
  refreshSurveyViews(contactId)
}

export async function saveContactSurveyAffinities(contactId: string, areaIds: string[]) {
  const { error } = await (await createClient()).rpc('set_contact_survey_affinities', { p_contact_id: contactId, p_area_ids: areaIds })
  if (error) throw new Error('Couldn’t save affinity interests. Please try again.')
  refreshSurveyViews(contactId)
}
