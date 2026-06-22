'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase/client'
import type { Profile } from '../types'

type UserContextValue = {
  user: User | null
  profile: Profile | null
  loading: boolean
}

const UserContext = createContext<UserContextValue | null>(null)

type UserProviderProps = {
  children: React.ReactNode
  initialUser?: User | null
  initialProfile?: Profile | null
}

export function UserProvider({
  children,
  initialUser = null,
  initialProfile = null,
}: UserProviderProps) {
  const hasInitialSession = Boolean(initialUser && initialProfile)
  const [user, setUser] = useState<User | null>(initialUser)
  const [profile, setProfile] = useState<Profile | null>(initialProfile)
  const [loading, setLoading] = useState(!hasInitialSession)

  useEffect(() => {
    let active = true

    const loadProfile = async (authUser: User | null) => {
      if (!active) return

      setUser(authUser)

      if (!authUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authUser.id)
        .maybeSingle()

      if (!active) return
      setProfile((data as Profile | null) ?? null)
      setLoading(false)
    }

    if (!hasInitialSession) {
      supabase.auth.getUser().then(({ data }) => loadProfile(data.user))
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id === user?.id && profile) return
      void loadProfile(session?.user ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [hasInitialSession, profile, user?.id])

  const value = useMemo(
    () => ({ user, profile, loading }),
    [loading, profile, user]
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const context = useContext(UserContext)

  if (!context) {
    throw new Error('useUser debe utilizarse dentro de UserProvider')
  }

  return context
}
