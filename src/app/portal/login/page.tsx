'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'

const emailInputId = 'portal-login-email'
const passwordInputId = 'portal-login-password'

export default function PortalLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { toast.error('Correo o contraseña incorrectos'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('rol, status, is_active')
        .eq('id', data.user.id)
        .single()

      if (!profile || profile.status !== 'Aprobado' || !profile.is_active) {
        await supabase.auth.signOut()
        toast.error('Tu cuenta no está activa. Contacta a soporte.')
        return
      }

      // Staff goes to ERP, clients to portal
      router.replace(profile.rol === 'Cliente' ? '/portal' : '/dashboard')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen w-full font-sans">
      {/* LEFT · BRAND / CONTEXT PANEL */}
      <div className="relative hidden flex-1 flex-col overflow-hidden bg-[#07111F] px-14 py-16 text-white lg:flex xl:px-[72px]">
        <div className="pointer-events-none absolute -right-44 -top-44 h-[620px] w-[620px] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(0,56,189,0.25),rgba(0,56,189,0)_62%)]" />
        <div className="pointer-events-none absolute -bottom-52 -left-36 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(239,142,1,0.14),rgba(239,142,1,0)_60%)]" />

        {/* logo */}
        <div className="relative z-10 flex items-center gap-4">
          <Image
            src="/brand/isotipo-color.png"
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 object-contain"
          />
          <span className="font-display text-[22px] font-bold tracking-tight">
            Forwarders <span className="text-[#EF8E01]">ERP</span>
          </span>
        </div>

        {/* pitch */}
        <div className="relative z-10 my-auto flex max-w-[520px] flex-col gap-7">
          <div className="font-mono text-[13px] uppercase tracking-[0.2em] text-[#7E8AA0]">
            Portal de clientes
          </div>
          <h1 className="font-display text-[44px] font-semibold leading-[1.12] tracking-tight">
            Sigue tu carga,<br />de punta a punta.
          </h1>
          <p className="text-[17px] leading-relaxed text-[#AEB8CC]">
            Consulta el estatus de tus embarques y coordina con tu agente, sin importar el modo de transporte.
          </p>

          <div className="mt-1 flex flex-wrap gap-2.5">
            {['FCL', 'LCL', 'LTL', 'Paquetería'].map((mode) => (
              <span
                key={mode}
                className="rounded-lg border border-white/[0.14] bg-white/[0.06] px-3.5 py-2 font-mono text-xs tracking-wide text-[#E6EAF2]"
              >
                {mode}
              </span>
            ))}
          </div>

          {/* tracking preview */}
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.04] px-4.5 py-3">
              <span className="font-mono text-[11px] uppercase tracking-wide text-[#7E8AA0]">
                Ejemplo de tracking
              </span>
              <span className="rounded-md bg-white/[0.06] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[#AEB8CC]">
                Demo
              </span>
            </div>
            <div className="grid grid-cols-[1.2fr_1fr_1fr_0.9fr] px-4.5 py-3 font-mono text-[11px] uppercase tracking-wide text-[#7E8AA0]">
              <span>Referencia</span><span>Modo</span><span>ETA</span><span>Estado</span>
            </div>
            {[
              { ref: 'BL-2847', modo: 'FCL', eta: '02 Jul', estado: 'Tránsito', bg: 'bg-[#0038BD]/20', color: 'text-[#9DB4F5]' },
              { ref: 'HW-1193', modo: 'LTL', eta: '05 Jul', estado: 'Aduana', bg: 'bg-[#EF8E01]/20', color: 'text-[#F5C168]' },
              { ref: 'PQ-5502', modo: 'Paquetería', eta: '28 Jun', estado: 'Entregado', bg: 'bg-[#1E8A52]/20', color: 'text-[#7FD8A4]' },
            ].map((row) => (
              <div key={row.ref} className="grid grid-cols-[1.2fr_1fr_1fr_0.9fr] items-center border-t border-white/[0.06] px-4.5 py-3.5 text-[13px] text-[#E6EAF2]">
                <span className="font-mono">{row.ref}</span>
                <span className="text-[#AEB8CC]">{row.modo}</span>
                <span className="text-[#AEB8CC]">{row.eta}</span>
                <span><em className={`rounded-md px-2.5 py-0.5 text-[11px] not-italic ${row.bg} ${row.color}`}>{row.estado}</em></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT · LOGIN FORM */}
      <div className="flex w-full flex-col justify-center bg-white px-8 py-12 dark:bg-[#020817] lg:w-[480px] lg:flex-none lg:px-14 lg:py-16">
        <div className="mx-auto w-full max-w-[360px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image
              src="/brand/isotipo-color.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 object-contain"
            />
            <div>
              <p className="font-display text-lg font-bold tracking-tight text-[#07111F] dark:text-white">
                Forwarders <span className="text-[#EF8E01]">ERP</span>
              </p>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#7E8AA0]">
                Portal de clientes
              </p>
            </div>
          </div>

          <div className="mb-9">
            <h2 className="font-display text-[28px] font-semibold tracking-tight text-[#07111F] dark:text-white">
              Bienvenido de vuelta
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[#5B6573] dark:text-slate-400">
              Ingresa a tu cuenta para dar seguimiento a tus embarques.
            </p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4.5">
            <div>
              <label htmlFor={emailInputId} className="mb-1.5 block text-[13px] font-semibold text-[#3A4151] dark:text-slate-300">
                Correo electrónico
              </label>
              <input
                id={emailInputId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                required
                autoComplete="email"
                autoFocus
                className="h-[46px] w-full rounded-[10px] border border-[#D8DEE7] bg-white px-4 text-[15px] text-[#07111F] outline-none placeholder:text-[#9AA3B2] focus:border-[#0038BD] focus:ring-4 focus:ring-[#0038BD]/[0.12] dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-950"
              />
            </div>

            <div>
              <label htmlFor={passwordInputId} className="mb-1.5 block text-[13px] font-semibold text-[#3A4151] dark:text-slate-300">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id={passwordInputId}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="h-[46px] w-full rounded-[10px] border border-[#D8DEE7] bg-white px-4 pr-12 text-[15px] text-[#07111F] outline-none placeholder:text-[#9AA3B2] focus:border-[#0038BD] focus:ring-4 focus:ring-[#0038BD]/[0.12] dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-950"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-1.5 top-1/2 flex h-[34px] w-[34px] -translate-y-1/2 items-center justify-center rounded-md text-[#8B96AB] hover:bg-[#F7F8FA] focus:outline-none focus:ring-2 focus:ring-[#0038BD]/30 dark:text-slate-400 dark:hover:bg-slate-800 dark:focus:ring-blue-400/30"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-[46px] w-full rounded-[10px] bg-[#0038BD] text-[15px] font-semibold text-white transition-colors hover:bg-[#022a91] disabled:cursor-not-allowed disabled:bg-[#5B7CD6] dark:bg-blue-600 dark:hover:bg-blue-700 dark:disabled:bg-blue-900"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>

            <div className="text-center">
              <Link href="/portal/forgot-password" className="text-sm font-medium text-[#0038BD] hover:underline dark:text-blue-400">
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>

          <div className="my-8 h-px bg-[#EDEFF3] dark:bg-slate-800" />

          <p className="text-center text-sm leading-relaxed text-[#5B6573] dark:text-slate-400">
            ¿Aún no tienes acceso?{' '}
            <Link href="/portal/register" className="font-semibold text-[#0038BD] hover:underline dark:text-blue-400">
              Solicitar cuenta
            </Link>
          </p>
          <p className="mt-4.5 text-center text-xs leading-relaxed text-[#9AA3B2] dark:text-slate-500">
            ¿Problemas para ingresar? Contacta a tu agente de carga.
          </p>
        </div>
      </div>
    </div>
  )
}
