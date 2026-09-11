'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function saveCgTextInvitePreference(contactId: string, enabled: boolean) {
  const { error } = await (await createClient()).rpc('set_contact_cg_text_invite_only', {
    p_contact_id: contactId,
    p_enabled: enabled,
  })
  if (error) throw new Error('Couldn’t save this preference. Please try again.')
  revalidatePath(`/contacts/${contactId}`)
  revalidatePath('/opportunities/community-group')
}
