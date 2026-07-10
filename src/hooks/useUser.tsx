'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

  // Id del usuario ya cargado. Sirve para ignorar eventos redundantes de auth
  // (p. ej. refresco de token) sin meter `user`/`profile` en las dependencias
  // del efecto, lo que provocaria un bucle de re-suscripcion y re-fetch.
  const loadedUserIdRef = useRef<string | null>(initialUser?.id ?? null)

  useEffect(() => {
    let active = true

    const loadProfile = async (authUser: User | null) => {
      if (!active) return

      loadedUserIdRef.current = authUser?.id ?? null
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
      const nextUserId = session?.user?.id ?? null
      if (nextUserId === loadedUserIdRef.current) return
      void loadProfile(session?.user ?? null)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [hasInitialSession])

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
