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
  const loadedUserIdRef = useRef<string | null>(hasInitialSession ? initialUser?.id ?? null : null)

  useEffect(() => {
    let active = true
    let requestId = 0
    let authVersion = 0
    let initialized = hasInitialSession

    const loadProfile = async (authUser: User | null) => {
      if (!active) return

      const currentRequest = ++requestId
      initialized = true
      loadedUserIdRef.current = authUser?.id ?? null
      setUser(authUser)
      setProfile(null)
      setLoading(Boolean(authUser))

      if (!authUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      // Salir del callback de auth antes de consultar Supabase (su lock sigue activo).
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (!active || currentRequest !== requestId) return
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle()

        if (!active || currentRequest !== requestId) return
        if (error || !data) loadedUserIdRef.current = null
        setProfile(error ? null : (data as Profile | null))
      } catch {
        if (!active || currentRequest !== requestId) return
        loadedUserIdRef.current = null
        setProfile(null)
      } finally {
        if (active && currentRequest === requestId) setLoading(false)
      }
    }

    if (!hasInitialSession) {
      const initialVersion = authVersion
      supabase.auth.getUser().then(({ data }) => {
        if (active && authVersion === initialVersion) void loadProfile(data.user)
      }).catch(() => {
        if (active && authVersion === initialVersion) void loadProfile(null)
      })
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      authVersion += 1
      const nextUserId = session?.user?.id ?? null
      if (initialized && nextUserId === loadedUserIdRef.current && _event !== 'SIGNED_OUT') return
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
