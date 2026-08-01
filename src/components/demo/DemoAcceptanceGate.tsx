'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, FlaskConical, LogOut } from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import {
  DEMO_TERMS_VERSION,
  IS_DEMO_ENVIRONMENT,
  isDemoAccessExpired,
} from '@/src/lib/demo-environment'

type DemoGateProfile = {
  id: string
  rol: string
  is_demo_user?: boolean | null
  demo_expires_at?: string | null
  demo_access_grant_id?: string | null
}

type GateState =
  | 'checking'
  | 'required'
  | 'accepted'
  | 'expired'
  | 'misconfigured'
  | 'error'

export function DemoAcceptanceGate({
  profile,
  children,
}: {
  profile: DemoGateProfile
  children: React.ReactNode
}) {
  const [state, setState] = useState<GateState>(() => {
    if (!IS_DEMO_ENVIRONMENT && profile.is_demo_user !== true) return 'accepted'
    if (
      IS_DEMO_ENVIRONMENT
      && (
        profile.is_demo_user !== true
        || !profile.demo_access_grant_id
      )
    ) return 'misconfigured'
    if (isDemoAccessExpired(profile)) return 'expired'
    return 'checking'
  })
  const [acknowledged, setAcknowledged] = useState(false)
  const [saving, setSaving] = useState(false)
  const accessGrantId = profile.demo_access_grant_id ?? ''

  useEffect(() => {
    if (state !== 'checking') return

    let cancelled = false

    const checkAcceptance = async () => {
      const { data, error } = await supabase
        .from('demo_terms_acceptances')
        .select('id')
        .eq('user_id', profile.id)
        .eq('terms_version', DEMO_TERMS_VERSION)
        .eq('access_grant_id', accessGrantId)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        setState('error')
        return
      }

      if (data) {
        const { error: sessionError } = await supabase.rpc('log_demo_session')
        if (sessionError) {
          setState('error')
          return
        }
        if (!cancelled) setState('accepted')
        return
      }

      setState('required')
    }

    void checkAcceptance()
    return () => {
      cancelled = true
    }
  }, [accessGrantId, profile.id, state])

  const logout = async () => {
    await supabase.auth.signOut()
    window.location.assign(profile.rol === 'Cliente' ? '/portal/login' : '/login')
  }

  const accept = async () => {
    if (!acknowledged || !accessGrantId || saving) return
    setSaving(true)

    const { error } = await supabase.from('demo_terms_acceptances').insert({
      user_id: profile.id,
      terms_version: DEMO_TERMS_VERSION,
      access_grant_id: accessGrantId,
      shared_sandbox_acknowledged: true,
    })

    if (error) {
      setSaving(false)
      setState('error')
      return
    }

    const { error: sessionError } = await supabase.rpc('log_demo_session')
    if (sessionError) {
      setSaving(false)
      setState('error')
      return
    }
    setState('accepted')
    setSaving(false)
  }

  if (state === 'accepted') return children

  if (state === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-sm text-slate-300">
        Validando acceso al ambiente demo...
      </div>
    )
  }

  const isExpired = state === 'expired'
  const isMisconfigured = state === 'misconfigured'
  const hasError = state === 'error'

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07111F] px-5 py-10 text-slate-900">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl shadow-black/30">
        <div className="border-b border-slate-200 bg-amber-50 px-6 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              {isExpired || isMisconfigured || hasError
                ? <AlertTriangle className="h-5 w-5" />
                : <FlaskConical className="h-5 w-5" />}
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
                Forwarders ERP
              </p>
              <h1 className="text-xl font-bold text-slate-950">
                {isExpired
                  ? 'Acceso demo vencido'
                  : isMisconfigured
                    ? 'Cuenta demo sin configurar'
                    : hasError
                      ? 'No pudimos validar tu acceso'
                      : 'Antes de ingresar al ambiente demo'}
              </h1>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-6 py-6 sm:px-8">
          {isExpired ? (
            <p className="text-sm leading-6 text-slate-600">
              El periodo asignado a esta cuenta terminó. Solicita una nueva
              ventana de acceso escribiendo a contacto@forwarders.app.
            </p>
          ) : isMisconfigured ? (
            <p className="text-sm leading-6 text-slate-600">
              Esta cuenta no tiene la restricción demo requerida. Por seguridad
              no se mostrará información hasta que Hernova Systems la configure.
            </p>
          ) : hasError ? (
            <p className="text-sm leading-6 text-slate-600">
              No fue posible comprobar la aceptación de las condiciones. Puedes
              recargar la página o cerrar sesión e intentarlo nuevamente.
            </p>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                <ul className="space-y-2">
                  <li>Los nombres, operaciones, montos y documentos son ficticios.</li>
                  <li>El sandbox es compartido con otros evaluadores.</li>
                  <li>Tus cambios pueden ser modificados o reiniciados sin previo aviso.</li>
                  <li>Ningún documento tiene validez comercial, operativa o fiscal.</li>
                </ul>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-6 text-slate-700">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#0038BD]"
                />
                <span>
                  Entiendo que usaré datos ficticios y compartidos, y acepto las{' '}
                  <Link
                    href="/politicas#pruebas"
                    target="_blank"
                    className="font-semibold text-[#0038BD] underline underline-offset-2"
                  >
                    condiciones del ambiente demo
                  </Link>.
                </span>
              </label>
            </>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end sm:px-8">
          <button
            type="button"
            onClick={logout}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>

          {state === 'required' && (
            <button
              type="button"
              onClick={accept}
              disabled={!acknowledged || saving}
              className="h-11 rounded-xl bg-[#0038BD] px-6 text-sm font-bold text-white hover:bg-[#002f9d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Aceptar e ingresar'}
            </button>
          )}

          {hasError && (
            <button
              type="button"
              onClick={() => setState('checking')}
              className="h-11 rounded-xl bg-[#0038BD] px-6 text-sm font-bold text-white hover:bg-[#002f9d]"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
