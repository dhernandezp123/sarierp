'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Bell, Home, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { supabase } from '@/src/lib/supabase/client'

type Profile = {
  nombre: string | null
  apellido: string | null
  email: string | null
  rol: string | null
}

export default function Topbar() {
  const { theme, setTheme } = useTheme()
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data } = await supabase
        .from('profiles')
        .select('nombre, apellido, email, rol')
        .eq('id', user.id)
        .single()

      setProfile(data)
    }

    fetchProfile()
  }, [])

  const displayName =
    profile?.nombre || profile?.apellido
      ? `${profile?.nombre || ''} ${profile?.apellido || ''}`.trim()
      : profile?.email || 'Usuario'

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-6 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          title="Ir al inicio"
          className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <Home className="h-5 w-5" />
        </Link>

        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Sari Express ERP
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Plataforma logística interna
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          title="Cambiar tema"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>

        <button
          title="Notificaciones"
          className="relative rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <Bell className="h-5 w-5" />

          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </button>

        <div className="text-right">
          <p className="text-sm font-medium text-slate-900 dark:text-white">
            {displayName}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {profile?.rol || 'Sin rol'}
          </p>
        </div>
      </div>
    </header>
  )
}
