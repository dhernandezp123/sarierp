'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Package, Globe, Shield, Clock } from 'lucide-react'
import { useTenant } from '@/src/components/tenant/TenantProvider'

const VALUES = [
  { icon: Package, title: 'Logística sin complicaciones', desc: 'Nos encargamos de todo el proceso desde Miami hasta tu puerta, con visibilidad en tiempo real de tus paquetes.' },
  { icon: Globe, title: 'Experiencia internacional', desc: 'Operamos la ruta Miami – Honduras con profundo conocimiento de los procesos aduaneros y logísticos.' },
  { icon: Shield, title: 'Confianza y transparencia', desc: 'Cada paquete recibe un número único de bodega (WH#). Sabes dónde está tu carga en todo momento.' },
  { icon: Clock, title: 'Tiempos de respuesta', desc: 'Consulta avisos de recepción y comunícate con el equipo para resolver dudas sobre tu carga.' },
]

export default function NosotrosPage() {
  const router = useRouter()
  const tenant = useTenant()

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Volver" onClick={() => router.push('/portal/perfil')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Sobre Nosotros</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Conoce quiénes somos</p>
        </div>
      </div>

      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 p-6 text-white">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
          <Package className="h-6 w-6 text-white" />
        </div>
        <h2 className="text-xl font-bold">Freight Forwarding de confianza</h2>
        <p className="mt-2 text-sm text-blue-100 leading-relaxed">
          Conectamos tus compras en EE.UU. con Honduras. Somos un equipo especializado en logística internacional que coordina la recepción y el transporte de tu carga.
        </p>
      </div>

      {/* Mission */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mb-2 font-semibold text-slate-900 dark:text-white">Nuestra Misión</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Hacer que importar sea simple, transparente y confiable para empresas y personas en Honduras. Nuestro objetivo es facilitar el seguimiento de la carga y la comunicación con el equipo durante cada etapa.
        </p>
      </div>

      {/* Values */}
      <div className="space-y-3">
        <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Lo que nos diferencia</h2>
        {VALUES.map(v => (
          <div key={v.title} className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40">
              <v.icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{v.title}</p>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{v.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm text-slate-500">Mi Carga es el portal de clientes de {tenant?.tradeName || 'tu empresa'}, disponible en Forwarders ERP.</p><Link href="/portal/contacto" className="inline-block rounded-xl bg-tenant-primary px-4 py-3 text-sm font-semibold text-white">Contactar al equipo</Link>
    </div>
  )
}
