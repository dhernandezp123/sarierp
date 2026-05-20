'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/src/lib/supabase/client'

export default function AdminGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkAccess = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('rol')
        .eq('id', user.id)
        .single()

      if (!profile || profile.rol !== 'Admin') {
        router.push('/dashboard')
        return
      }

      setAuthorized(true)
      setLoading(false)
    }

    checkAccess()
  }, [router])

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-500">
        Validando permisos...
      </div>
    )
  }

  if (!authorized) {
    return null
  }

  return <>{children}</>
}