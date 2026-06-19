'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  MapPin, KeyRound, User, ChevronRight, Calculator, Truck,
  Phone, FileText, ShieldAlert, Info, LogOut, Smartphone, BookOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'

const APP_VERSION = '1.0.0'

export default function PortalPerfilPage() {
  const { user, profile } = useUser()
  const router = useRouter()
  const [changingPwd, setChangingPwd] = useState(false)
  const [pwd, setPwd] = useState({ new: '', confirm: '' })
  const [saving, setSaving] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pwd.new !== pwd.confirm) { toast.error('Las contraseñas no coinciden'); return }
    if (pwd.new.length < 6) { toast.error('Mínimo 6 caracteres'); return }
    setSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd.new })
      if (error) throw error
      toast.success('Contraseña actualizada correctamente')
      setChangingPwd(false)
      setPwd({ new: '', confirm: '' })
    } catch (err: any) {
      toast.error(err.message ?? 'Error al cambiar contraseña')
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
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Perfil</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Cuenta, herramientas e información</p>
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

      {/* Address */}
      <Section>
        <SectionHeader icon={<MapPin className="h-4 w-4" />} title="Dirección Miami" />
        <NavLink href="/portal/perfil/direccion-miami" label="Mi dirección de consignación" sub="Gestiona tu casillero en Miami" />
      </Section>

      {/* Tools */}
      <Section>
        <SectionHeader icon={<Calculator className="h-4 w-4" />} title="Herramientas" />
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <NavLink href="/portal/calculadora" label="Calculadora de Volumen" sub="FT³ y CBM en tiempo real" />
          <NavLink href="/portal/pickup" label="Solicitud de Recogida" sub="Coordina recolección de paquetes" />
        </div>
      </Section>

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
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Nueva contraseña</label>
                <input type="password" value={pwd.new} onChange={e => setPwd(p => ({ ...p, new: e.target.value }))} placeholder="••••••••" required className={fieldClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Confirmar nueva contraseña</label>
                <input type="password" value={pwd.confirm} onChange={e => setPwd(p => ({ ...p, confirm: e.target.value }))} placeholder="••••••••" required className={fieldClass} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setChangingPwd(false); setPwd({ new: '', confirm: '' }) }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                  {saving ? 'Guardando...' : 'Actualizar'}
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-400 dark:text-slate-500">••••••••••••</p>
          )}
        </div>
      </Section>

      {/* App settings (placeholders) */}
      <Section>
        <SectionHeader icon={<Smartphone className="h-4 w-4" />} title="Aplicación" />
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <PlaceholderItem label="Autenticación biométrica" badge="Próximamente en app móvil" />
          <PlaceholderItem label="Buscar actualizaciones" badge="Próximamente en app móvil" />
          <NavLinkDisabled icon={<BookOpen className="h-4 w-4 text-slate-300 dark:text-slate-600" />} label="Tutoriales de uso" />
          <NavLinkDisabled label="Restablecer tutoriales" />
        </div>
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs text-slate-400 dark:text-slate-500">Versión {APP_VERSION}</p>
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

function NavLinkDisabled({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 opacity-40">
      {icon && <span className="shrink-0">{icon}</span>}
      <p className="flex-1 text-sm font-medium text-slate-900 dark:text-white">{label}</p>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
    </div>
  )
}

function PlaceholderItem({ label, badge }: { label: string; badge: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <p className="text-sm font-medium text-slate-900 dark:text-white">{label}</p>
      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-400 dark:bg-slate-800 dark:text-slate-500">{badge}</span>
    </div>
  )
}
