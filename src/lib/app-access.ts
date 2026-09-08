import {
  isAuthApiError,
  isAuthSessionMissingError,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js'

type AppProfile = {
  display_name: string | null
  role: string
  is_active: boolean
}

type AppAccess =
  | { status: 'ready'; user: User | null; profile: AppProfile | null }
  | { status: 'unavailable'; user: null; profile: null }

export async function loadAppAccess(
  supabase: Pick<SupabaseClient, 'auth' | 'from'>
): Promise<AppAccess> {
  // Retry a failed read once. A missing session/profile or a restricted account
  // is a completed check, not a connection failure, and must not grant access.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError) {
        if (
          isAuthSessionMissingError(authError) ||
          (isAuthApiError(authError) && (
            authError.status === 401 || authError.status === 403 ||
            authError.code === 'bad_jwt' || authError.code === 'refresh_token_not_found'
          ))
        ) {
          return { status: 'ready', user: null, profile: null }
        }
        continue
      }

      if (!user) return { status: 'ready', user: null, profile: null }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, role, is_active')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError) continue

      return { status: 'ready', user, profile }
    } catch {
      // Fetch failures can also reject rather than return an error response.
    }
  }

  return { status: 'unavailable', user: null, profile: null }
}
