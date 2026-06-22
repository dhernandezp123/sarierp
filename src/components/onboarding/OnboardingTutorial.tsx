'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowRight,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  LayoutDashboard,
  Package,
  Plane,
  Route,
  Scale,
  ShieldAlert,
  Ship,
  Users,
  X,
} from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import { useUser } from '@/src/hooks/useUser'
import type { UserRole } from '@/src/types'

type TutorialStep = {
  icon: React.ReactNode
  title: string
  description: string
  href: string
  linkLabel: string
}

const STEPS_BY_ROLE: Record<string, TutorialStep[]> = {
  Ventas: [
    {
      icon: <FileText className="h-8 w-8" />,
      title: 'Nueva Cotización',
      description: 'Crea cotizaciones para tus clientes: llena los datos del servicio, carga, incoterm y origen/destino.',
      href: '/quotations/new',
      linkLabel: 'Ir a nueva cotización',
    },
    {
      icon: <BookOpen className="h-8 w-8" />,
      title: 'Histórico de Cotizaciones',
      description: 'Revisa el estado de todas las cotizaciones: aprobadas, pendientes de precio, cotizadas y rechazadas.',
      href: '/historico',
      linkLabel: 'Ver histórico',
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: 'Clientes',
      description: 'Administra tu base de clientes. Consulta cada cuenta y su historial de cotizaciones.',
      href: '/clientes',
      linkLabel: 'Ver clientes',
    },
  ],

  Pricing: [
    {
      icon: <Scale className="h-8 w-8" />,
      title: 'Comparar Tarifas',
      description: 'Compara tarifas de agentes por ruta y carrier. Selecciona la mejor opción para cada cotización.',
      href: '/pricing-comparison',
      linkLabel: 'Ir a pricing',
    },
    {
      icon: <Ship className="h-8 w-8" />,
      title: 'Agentes de Carga',
      description: 'Administra tu red de agentes y transportistas. Mantén tarifas y rutas actualizadas.',
      href: '/agents',
      linkLabel: 'Ver agentes',
    },
    {
      icon: <BookOpen className="h-8 w-8" />,
      title: 'Cotizaciones Pendientes',
      description: 'Revisa las cotizaciones pendientes de precio y aprueba las tarifas antes de presentarlas al cliente.',
      href: '/historico',
      linkLabel: 'Ver cotizaciones',
    },
  ],

  Operaciones: [
    {
      icon: <Route className="h-8 w-8" />,
      title: 'Shipping Instructions',
      description: 'Gestiona las instrucciones de embarque generadas desde cotizaciones aprobadas.',
      href: '/operations/shipping-instructions',
      linkLabel: 'Ver shipping instructions',
    },
    {
      icon: <Ship className="h-8 w-8" />,
      title: 'Bookings',
      description: 'Controla los bookings con navieras y aerolíneas: BLs, contenedores y documentos.',
      href: '/operations/bookings',
      linkLabel: 'Ver bookings',
    },
    {
      icon: <ShieldAlert className="h-8 w-8" />,
      title: 'Garantías Navieras',
      description: 'Registra depósitos de garantía, monitorea vencimientos y recuperaciones por naviera.',
      href: '/operations/garantias',
      linkLabel: 'Ver garantías',
    },
    {
      icon: <Package className="h-8 w-8" />,
      title: 'Miami Bodega',
      description: 'Gestiona el inventario de paquetería en Miami: ingreso, asignación y despacho.',
      href: '/miami',
      linkLabel: 'Ver bodega Miami',
    },
  ],

  Finanzas: [
    {
      icon: <FileText className="h-8 w-8" />,
      title: 'Facturación',
      description: 'Emite facturas SAR a tus clientes. Controla el estado de cobro y los pagos recibidos.',
      href: '/invoicing',
      linkLabel: 'Ver facturación',
    },
    {
      icon: <CreditCard className="h-8 w-8" />,
      title: 'Cuentas por Pagar',
      description: 'Gestiona los pagos a proveedores y agentes de carga. Controla vencimientos.',
      href: '/accounts-payable',
      linkLabel: 'Ver cuentas por pagar',
    },
    {
      icon: <LayoutDashboard className="h-8 w-8" />,
      title: 'Dashboard Financiero',
      description: 'Visualiza el rendimiento: ingresos, márgenes, flujo de caja y cotizaciones ganadas.',
      href: '/financial-dashboard',
      linkLabel: 'Ver dashboard',
    },
  ],

  Contabilidad: [
    {
      icon: <FileText className="h-8 w-8" />,
      title: 'Facturación',
      description: 'Emite y gestiona facturas SAR. Controla el cumplimiento fiscal y los pagos recibidos.',
      href: '/invoicing',
      linkLabel: 'Ver facturación',
    },
    {
      icon: <CreditCard className="h-8 w-8" />,
      title: 'Cuentas por Pagar',
      description: 'Gestiona los pagos a proveedores y agentes de carga. Controla vencimientos.',
      href: '/accounts-payable',
      linkLabel: 'Ver cuentas por pagar',
    },
    {
      icon: <LayoutDashboard className="h-8 w-8" />,
      title: 'Dashboard Financiero',
      description: 'Visualiza ingresos, márgenes y estado de cobranza en tiempo real.',
      href: '/financial-dashboard',
      linkLabel: 'Ver dashboard',
    },
  ],

  Admin: [
    {
      icon: <LayoutDashboard className="h-8 w-8" />,
      title: 'Dashboard General',
      description: 'Vista de mando: alertas, métricas operativas y actividad reciente en todo el ERP.',
      href: '/dashboard',
      linkLabel: 'Ver dashboard',
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: 'Usuarios',
      description: 'Invita y administra usuarios por rol. Aprueba accesos y asigna permisos.',
      href: '/admin/users',
      linkLabel: 'Ver usuarios',
    },
    {
      icon: <Building2 className="h-8 w-8" />,
      title: 'Configuración',
      description: 'Configura datos legales, ISV, tipo de cambio, condiciones en documentos y plantillas.',
      href: '/settings/company',
      linkLabel: 'Ver configuración',
    },
  ],
}

export default function OnboardingTutorial() {
  const { profile } = useUser()
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (profile && profile.tutorial_completed === false) {
      setVisible(true)
    }
  }, [profile])

  const dismiss = async () => {
    if (!profile) return
    const { error } = await supabase
      .from('profiles')
      .update({ tutorial_completed: true })
      .eq('id', profile.id)
    if (error) {
      toast.error('No se pudo guardar el progreso del tutorial')
      return
    }
    setVisible(false)
  }

  if (!visible || !profile) return null

  const rol = profile.rol as UserRole
  const steps = STEPS_BY_ROLE[rol] ?? STEPS_BY_ROLE.Admin
  const current = steps[step]
  const isFirst = step === 0
  const isLast = step === steps.length - 1
  const progress = ((step + 1) / steps.length) * 100

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-[#0b1220]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">
              Bienvenido
            </p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Tutorial de inicio
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100 dark:bg-slate-800">
          <div
            className="h-1 bg-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step content */}
        <div className="px-6 py-8">
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              {current.icon}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Paso {step + 1} de {steps.length}
              </p>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {current.title}
              </h3>
            </div>
          </div>

          <p className="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            {current.description}
          </p>

          <Link
            href={current.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            {current.linkLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-700">
          <button
            type="button"
            onClick={dismiss}
            className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Saltar tutorial
          </button>

          <div className="flex gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>
            )}
            {isLast ? (
              <button
                type="button"
                onClick={dismiss}
                className="flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Finalizar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
