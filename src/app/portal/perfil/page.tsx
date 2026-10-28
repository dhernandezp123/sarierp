'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  MapPin, KeyRound, User, ChevronRight, Calculator,
  Phone, FileText, ShieldAlert, Info, LogOut,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'


export default function PortalPerfilPage() {
  const { user, profile } = useUser()
  const router = useRouter()
  const [changingPwd, setChangingPwd] = useState(false)
  const [pwd, setPwd] = useState({ new: '', confirm: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwd.new !== pwd.confirm) { toast.error('Las contraseñas no coinciden'); return }
    if (pwd.new.length < 8) { toast.error('Mínimo 8 caracteres'); return }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd.new })
      if (error) throw error
      toast.success('Contraseña actualizada correctamente')
      setChangingPwd(false)
      setPwd({ new: '', confirm: '' })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar contraseña')
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/portal/login')
  }

  const fieldClass = 'h-10 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-blue-400 dark:focus:ring-blue-950'

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Mi cuenta</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tus datos, seguridad e información de servicio</p>
      </div>

      {/* Account info */}
      <Section>
        <SectionHeader icon={<User className="h-4 w-4" />} title="Mi cuenta" />
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <div className="px-5 py-3.5">
            <p className="text-xs text-slate-400 dark:text-slate-500">Nombre</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{profile?.nombre ?? '—'}</p>
          </div>
          <div className="px-5 py-3.5">
            <p className="text-xs text-slate-400 dark:text-slate-500">Correo electrónico</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{user?.email ?? '—'}</p>
          </div>
        </div>
      </Section>

      <Link href="/portal/contacto" className="block text-sm font-semibold text-blue-600 dark:text-blue-400">Solicitar corrección de mis datos</Link>
      {/* Address */}
      <Section>
        <SectionHeader icon={<MapPin className="h-4 w-4" />} title="Dirección Miami" />
        <NavLink href="/portal/perfil/direccion-miami" label="Mi dirección de consignación" sub="Consulta y copia tu dirección para compras" />
      </Section>

      <Section><SectionHeader icon={<Calculator className="h-4 w-4" />} title="Gestiones" /><NavLink href="/portal/solicitudes" label="Mis solicitudes y herramientas" sub="Prealertas, recogidas, incidencias y calculadora" /></Section>

      {/* Contact & Info */}
      <Section>
        <SectionHeader icon={<Info className="h-4 w-4" />} title="Información" />
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <NavLink href="/portal/contacto" label="Contáctanos" sub="Oficinas, teléfonos y horarios" icon={<Phone className="h-4 w-4 text-slate-400" />} />
          <NavLink href="/portal/info/restringidos" label="Materiales Restringidos" sub="Artículos que no podemos manejar" icon={<ShieldAlert className="h-4 w-4 text-slate-400" />} />
          <NavLink href="/portal/info/terminos" label="Términos y Condiciones" sub="Políticas de servicio" icon={<FileText className="h-4 w-4 text-slate-400" />} />
          <NavLink href="/portal/info/nosotros" label="Sobre Nosotros" sub="Quiénes somos" icon={<Info className="h-4 w-4 text-slate-400" />} />
        </div>
      </Section>

      {/* Security */}
      <Section>
        <SectionHeader icon={<KeyRound className="h-4 w-4" />} title="Seguridad" />
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-900 dark:text-white">Contraseña</p>
            {!changingPwd && (
              <button
                type="button"
                onClick={() => setChangingPwd(true)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Cambiar
              </button>
            )}
          </div>
          {changingPwd ? (
            <form onSubmit={handleChangePassword} className="space-y-3"><p className="text-xs text-slate-500">Usa al menos 8 caracteres.</p>
              <div>
                <label htmlFor="account-password" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Nueva contraseña</label>
                <input id="account-password" autoComplete="new-password" minLength={8} type={showPassword ? "text" : "password"} value={pwd.new} onChange={e => setPwd(p => ({ ...p, new: e.target.value }))} placeholder="••••••••" required className={fieldClass} />
              </div>
              <div>
                <label htmlFor="account-confirm-password" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Confirmar nueva contraseña</label>
                <input id="account-confirm-password" autoComplete="new-password" minLength={8} type={showPassword ? "text" : "password"} value={pwd.confirm} onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))} placeholder="••••••••" required className={fieldClass} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setChangingPwd(false); setPwd({ new: '', confirm: '' }) }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  {saving ? 'Guardando...' : 'Actualizar'}
                </button>
              </div>
            <button type="button" aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)} className="py-2 text-sm font-semibold text-blue-600 dark:text-blue-400">{showPassword ? "Ocultar contraseñas" : "Mostrar contraseñas"}</button></form>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500">••••••••••••</p>
          )}
        </div>
      </Section>

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white py-4 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/20"
      >
        <LogOut className="h-4 w-4" />
        Cerrar Sesión
      </button>
    </div>
  )
}

/* Helpers */

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {children}
    </div>
  )
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
      <span className="text-slate-400 dark:text-slate-500">{icon}</span>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{title}</p>
    </div>
  )
}

function NavLink({ href, label, sub, icon }: { href: string; label: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/60">
      {icon && <span className="shrink-0">{icon}</span>}
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
        {sub && <p className="text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" />
    </Link>
  )
}
