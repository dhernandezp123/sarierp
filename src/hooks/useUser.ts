'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase/client'

export function useUser() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user }
      } = await supabase.auth.getUser()

      setUser(user)

      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        setProfile(data)
      }

      setLoading(false)
    }

    getUser()
  }, [])

  return {
    user,
    profile,
    loading
  }
}
