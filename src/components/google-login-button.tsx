'use client'

import { createClient } from '@/lib/supabase/client'

export function GoogleLoginButton() {
  async function signInWithGoogle() {
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      console.error(error)
      alert('Google sign-in could not start.')
    }
  }

  return (
    <button type="button" onClick={signInWithGoogle}>
      Continue with Google
    </button>
  )
}