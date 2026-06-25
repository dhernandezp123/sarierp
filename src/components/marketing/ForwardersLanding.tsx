'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import {
  ArrowRight,
  Activity,
  BarChart3,
  Bell,
  Calculator,
  Check,
  ChevronRight,
  ClipboardCheck,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Globe2,
  Lock,
  Mail,
  Menu,
  MessageCircle,
  Package,
  Plane,
  Printer,
  Route,
  Scale,
  ShieldCheck,
  Ship,
  Smartphone,
  Sparkles,
  Tags,
  Users,
  Warehouse,
  Waypoints,
  X,
  Zap,
} from 'lucide-react'

// ─── Tokens de animación ──────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
}

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
}

// ─── Datos ────────────────────────────────────────────────────────────────────

const navigation = [
  { label: 'Beneficios', href: '#beneficios' },
  { label: 'Funcionalidades', href: '#funcionalidades' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Portal Cliente', href: '#portal' },
  { label: 'Contacto', href: '#demo' },
]

const benefits = [
  {
    title: 'Cotiza más rápido',
    text: 'LCL, FCL, aéreo, terrestre y courier desde un flujo ordenado. Sin tablas dispersas, sin correos intermedios.',
    icon: Zap,
  },
  {
    title: 'Protege tus márgenes',
    text: 'Compara costos de proveedor con la venta al cliente antes de aprobar cualquier propuesta.',
    icon: ShieldCheck,
  },
  {
    title: 'Elimina reprocesos',
    text: 'Datos de clientes, tarifas y operaciones en un sistema. Sin reescribir información entre equipos.',
    icon: Waypoints,
  },
  {
    title: 'Visibilidad operativa real',
    text: 'Cada equipo ve el estado del embarque, el historial relevante y los documentos en un mismo lugar.',
    icon: Eye,
  },
]

const operationalProblems = [
  { title: 'Excel para tarifas', icon: FileSpreadsheet },
  { title: 'Correos para aprobaciones', icon: Mail },
  { title: 'WhatsApp para seguimiento', icon: MessageCircle },
  { title: 'Carpetas para documentos', icon: FolderOpen },
]

const features = [
  {
    title: 'Comercial y clientes',
    icon: Users,
    items: [
      'Historial por cliente',
      'Contactos y empresas',
      'Tarifas negociadas',
      'Pipeline comercial',
    ],
  },
  {
    title: 'Cotizaciones y pricing',
    icon: FileText,
    items: [
      'FCL, LCL, a\u00e9reo y terrestre',
      'Comparativo multi-agente',
      'Costos contra venta',
      'Margen antes de aprobar',
    ],
  },
  {
    title: 'Documentos y PDFs',
    icon: Printer,
    items: [
      'PDF de cotizaci\u00f3n comercial',
      'Bill of Lading / HBL',
      'Aviso de llegada',
      'Routing Order',
    ],
  },
  {
    title: 'Operaci\u00f3n log\u00edstica',
    icon: Route,
    items: [
      'Shipping Instructions',
      'Control de booking',
      'Timeline operativo',
      'Seguimiento por embarque',
    ],
  },
  {
    title: 'Costos y direcci\u00f3n',
    icon: ClipboardCheck,
    items: [
      'Validaci\u00f3n financiera',
      'Rentabilidad por embarque',
      'Dashboard ejecutivo',
      'KPIs con exportaci\u00f3n CSV',
    ],
  },
]
const workflow = [
  'Cliente',
  'Cotización',
  'Pricing',
  'Aprobación',
  'Shipping Instruction',
  'Booking / BL',
  'Validación de Costos',
  'Facturación',
  'Dashboard Ejecutivo',
]

const comparison = [
  {
    item: 'Cotizaciones LCL/FCL',
    generic: 'Archivos y correos',
    product: 'Flujo comercial centralizado',
  },
  {
    item: 'Tarifas por cliente',
    generic: 'Tablas dispersas',
    product: 'Tarifas organizadas por cliente',
  },
  {
    item: 'Comparativo de agentes',
    generic: 'Hojas por proveedor separadas',
    product: 'Multi-agente integrado en el flujo',
  },
  {
    item: 'Pricing logístico',
    generic: 'Cálculos manuales',
    product: 'Comparación clara de costos y ventas',
  },
  {
    item: 'Generación de PDFs',
    generic: 'Word o Excel manual',
    product: 'PDFs automáticos por embarque',
  },
  {
    item: 'BL y HBL',
    generic: 'Documentos en papel',
    product: 'Auto-numeración y gestión integrada',
  },
  {
    item: 'Miami Consolidado',
    generic: 'Conversiones manuales',
    product: 'KG/LBS y FT3/CBM en el flujo',
  },
  {
    item: 'Roles por equipo',
    generic: 'Acceso sin control diferenciado',
    product: 'Ventas, Pricing, Ops y Finanzas',
  },
  {
    item: 'Seguimiento operativo',
    generic: 'Mensajes aislados',
    product: 'Actividad visible para el equipo',
  },
  {
    item: 'Portal del cliente',
    generic: 'Correos y llamadas de estado',
    product: 'Visibilidad self-service en tiempo real',
  },
]

const industries = [
  { label: 'Freight Forwarders', icon: Globe2 },
  { label: 'NVOCCs', icon: Ship },
  { label: 'Agencias de carga', icon: Warehouse },
  { label: 'Consolidadores', icon: Plane },
  { label: 'Courier internacional', icon: Plane },
  { label: 'Transporte terrestre', icon: Route },
  { label: 'Operadores logísticos', icon: ClipboardCheck },
  { label: 'Importadores de alto volumen', icon: BarChart3 },
]

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function SectionHeading({
  eyebrow,
  title,
  description,
  light = false,
  eyebrowTone = 'default',
  prominent = false,
}: {
  eyebrow: string
  title: ReactNode
  description?: string
  light?: boolean
  eyebrowTone?: 'default' | 'danger'
  prominent?: boolean
}) {
  const eyebrowClassName =
    eyebrowTone === 'danger'
      ? 'inline-flex rounded-full bg-red-600 px-3.5 py-1.5 text-sm font-bold uppercase tracking-[0.22em] text-white shadow-sm'
      : 'text-xs font-bold uppercase tracking-[0.25em] text-[#EF8E01]'
  const titleClassName = prominent
    ? `mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl ${
        light ? 'text-white' : 'text-[#07111F]'
      }`
    : `mt-3 text-3xl font-semibold tracking-tight sm:text-4xl ${
        light ? 'text-white' : 'text-[#07111F]'
      }`
  const descriptionClassName = prominent
    ? `mx-auto mt-6 max-w-2xl text-lg leading-8 ${
        light ? 'text-blue-100' : 'text-slate-600'
      }`
    : `mt-4 text-base leading-8 ${light ? 'text-blue-100' : 'text-slate-500'}`

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-100px' }}
      className="mx-auto max-w-3xl text-center"
    >
      <p className={eyebrowClassName}>
        {eyebrow}
      </p>
      <h2 className={titleClassName}>
        {title}
      </h2>
      {description && (
        <p className={descriptionClassName}>
          {description}
        </p>
      )}
    </motion.div>
  )
}

function DashboardMockup() {
  const barHeights = [52, 68, 61, 78, 85, 94]
  const barMonths = ['E', 'F', 'M', 'A', 'M', 'J']

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
      className="relative mx-auto mt-14 max-w-5xl"
      aria-label="Forwarders ERP dashboard preview"
    >
      {/* Glow ambiental */}
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-[#0038BD]/10 blur-2xl" />

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-[#0038BD]/12 ring-1 ring-slate-900/5">
        {/* Chrome del navegador */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#EF8E01]/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            <span className="ml-3 hidden rounded-md border border-slate-200 bg-white px-3 py-1 font-mono text-[11px] text-slate-400 sm:block">
              app.forwarderserp.com/dashboard
            </span>
          </div>
          <span className="rounded-full border border-[#0038BD]/20 bg-[#0038BD]/6 px-3 py-1 text-[11px] font-semibold text-[#0038BD]">
            Operación centralizada
          </span>
        </div>

        <div className="grid lg:grid-cols-[196px_1fr]">
          {/* Sidebar */}
          <aside className="hidden border-r border-slate-100 bg-slate-50/60 lg:flex lg:flex-col lg:p-4">
            <div className="mb-5 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0038BD] text-white">
                <Globe2 size={15} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-[#07111F]">Forwarders ERP</p>
                <p className="text-[9px] text-slate-400">by DHer</p>
              </div>
            </div>

            <div className="space-y-0.5 flex-1">
              {[
                { label: 'Dashboard', active: true },
                { label: 'Clientes' },
                { label: 'Cotizaciones' },
                { label: 'Pricing' },
                { label: 'Operaciones' },
                { label: 'Miami Bodega' },
                { label: 'Facturación' },
                { label: 'Proveedores' },
                { label: 'Reportes' },
                { label: 'Configuración' },
              ].map(({ label, active }) => (
                <div
                  key={label}
                  className={`rounded-lg px-3 py-1.5 text-[11px] ${
                    active
                      ? 'bg-white font-semibold text-[#07111F] shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-400'
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0038BD]/10">
                <span className="text-[9px] font-bold text-[#0038BD]">AL</span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-semibold text-[#07111F]">Ana López</p>
                <p className="text-[9px] text-slate-400">Ventas · Admin</p>
              </div>
            </div>
          </aside>

          {/* Contenido principal */}
          <div className="bg-white">
            {/* Header interno */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div>
                <p className="text-[10px] text-slate-400">Bienvenido de vuelta, Ana</p>
                <p className="text-sm font-semibold text-[#07111F]">Dashboard</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100">
                  <span className="text-[9px] font-bold text-slate-500">3</span>
                </div>
                <div className="h-7 w-7 rounded-full bg-[#0038BD]/10 flex items-center justify-center">
                  <span className="text-[9px] font-bold text-[#0038BD]">AL</span>
                </div>
              </div>
            </div>

            <div className="p-4">
              {/* KPI cards */}
              <div className="grid gap-2.5 sm:grid-cols-4">
                {[
                  { label: 'Cotizaciones activas', value: '87', badge: '+12%', accent: true },
                  { label: 'Clientes atendidos', value: '42', badge: 'Este mes', accent: false },
                  { label: 'Opciones comparadas', value: '126', badge: 'Pricing', accent: false },
                  { label: 'Operaciones visibles', value: '34', badge: 'Equipo', accent: false },
                ].map(({ label, value, badge, accent }) => (
                  <div
                    key={label}
                    className={`rounded-xl border p-3 ${accent ? 'border-[#0038BD]/20 bg-[#0038BD]/4' : 'border-slate-100 bg-slate-50'}`}
                  >
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                      {label}
                    </p>
                    <div className="mt-2 flex items-end justify-between">
                      <p className={`text-xl font-bold ${accent ? 'text-[#0038BD]' : 'text-[#07111F]'}`}>{value}</p>
                      <span className="rounded-full bg-[#EF8E01]/10 px-1.5 py-0.5 text-[9px] font-semibold text-[#B86900]">
                        {badge}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Fila media: gráfica + pricing */}
              <div className="mt-3 grid gap-3 xl:grid-cols-[1.3fr_0.7fr]">
                {/* Gráfica de barras */}
                <div className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-[#07111F]">Cotizaciones por mes</p>
                    <span className="text-[9px] text-slate-400">Últimos 6 meses</span>
                  </div>
                  <div className="mt-3 flex items-end gap-1.5" style={{ height: 64 }}>
                    {barHeights.map((h, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className={`w-full rounded-t ${i === 5 ? 'bg-[#0038BD]' : 'bg-[#0038BD]/25'}`}
                          style={{ height: h }}
                        />
                        <span className="text-[8px] text-slate-300">{barMonths[i]}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actividad reciente */}
                <div className="rounded-xl border border-[#0038BD]/15 bg-[#0038BD]/5 p-4">
                  <p className="text-[11px] font-semibold text-[#07111F]">Actividad reciente</p>
                  <div className="mt-2.5 space-y-2.5">
                    {[
                      'Nueva cotización LCL ingresada',
                      'Pricing enviado a revisión',
                      'Booking actualizado',
                      'Factura de proveedor adjuntada',
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                          <Check size={10} className="text-[#EF8E01]" />
                        </span>
                        <span className="text-[10px] text-slate-600">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tabla de embarques activos */}
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-100">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
                  <p className="text-[11px] font-semibold text-[#07111F]">Embarques activos</p>
                  <span className="text-[10px] font-semibold text-[#0038BD]">Ver todos →</span>
                </div>
                <div className="divide-y divide-slate-50/80">
                  {[
                    { id: 'SPS-00241', route: 'MIA → SPS LCL', client: 'Importadora Caribe', status: 'En tránsito', color: '#EF8E01' },
                    { id: 'SPS-00239', route: 'SHA → PCR FCL', client: 'Grupo Exporta', status: 'Booking', color: '#0038BD' },
                    { id: 'SPS-00238', route: 'MAD → TGU AIR', client: 'Logística Central', status: 'Facturado', color: '#16a34a' },
                    { id: 'SPS-00235', route: 'MIA → SPS LCL', client: 'Distribuidora Norte', status: 'Entregado', color: '#64748b' },
                  ].map(({ id, route, client, status, color }) => (
                    <div
                      key={id}
                      className="grid grid-cols-[72px_1fr_1fr_80px] items-center gap-2 px-4 py-2 hover:bg-slate-50"
                    >
                      <span className="font-mono text-[10px] text-slate-400">{id}</span>
                      <span className="text-[11px] font-medium text-[#07111F]">{route}</span>
                      <span className="text-[10px] text-slate-400">{client}</span>
                      <span className="text-[10px] font-semibold" style={{ color }}>{status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function ClientPortalMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
      className="relative mx-auto max-w-sm"
    >
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-[#0038BD]/10 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-[#0038BD]/10 ring-1 ring-slate-900/5">
        {/* Header del portal */}
        <div className="flex items-center justify-between bg-[#07111F] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#EF8E01]">
              <Globe2 size={12} className="text-white" />
            </span>
            <span className="text-xs font-semibold text-white">Mi Portal</span>
          </div>
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            Activo
          </span>
        </div>

        {/* Saludo */}
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <p className="text-[10px] text-slate-400">Bienvenido,</p>
          <p className="text-sm font-bold text-[#07111F]">Importadora Caribe S.A.</p>
        </div>

        {/* Embarques */}
        <div className="p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Mis embarques
          </p>
          <div className="space-y-2.5">
            {[
              { id: 'MIA-0241', desc: 'Miami → San Pedro Sula', status: 'En tránsito', dotColor: 'bg-[#EF8E01]', textColor: 'text-[#B86900]', bg: 'border-[#EF8E01]/15 bg-[#EF8E01]/5' },
              { id: 'SHA-0239', desc: 'Shanghai → Puerto Cortés', status: 'Booking', dotColor: 'bg-blue-500', textColor: 'text-blue-600', bg: 'border-blue-100 bg-blue-50/50' },
              { id: 'MIA-0235', desc: 'Miami → San Pedro Sula', status: 'Entregado', dotColor: 'bg-emerald-500', textColor: 'text-emerald-600', bg: 'border-emerald-100 bg-emerald-50/50' },
            ].map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between rounded-xl border p-3 ${s.bg}`}
              >
                <div>
                  <p className="font-mono text-[10px] text-slate-400">{s.id}</p>
                  <p className="text-xs font-semibold text-[#07111F]">{s.desc}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dotColor}`} />
                  <span className={`text-[11px] font-semibold ${s.textColor}`}>{s.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notificación */}
        <div className="mx-4 mb-4 rounded-xl border border-[#0038BD]/15 bg-[#0038BD]/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <Bell size={13} className="mt-0.5 shrink-0 text-[#0038BD]" />
            <div>
              <p className="text-xs font-semibold text-[#07111F]">Nuevo documento disponible</p>
              <p className="text-[11px] text-slate-500">Bill of Lading MIA-0241 listo para descargar</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Landing principal ────────────────────────────────────────────────────────

export function ForwardersLanding() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [form, setForm] = useState({ nombre: '', empresa: '', email: '', telefono: '' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const { error } = await supabase.from('leads').insert([form])
    setSubmitting(false)
    if (error) {
      toast.error('Error al enviar. Intenta de nuevo.')
      return
    }
    setSubmitted(true)
    toast.success('¡Mensaje recibido! Te contactaremos pronto.')
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#F7F8FA] text-[#07111F]">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden bg-white">
        {/* Gradiente ambiental */}
        <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[700px] w-[900px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,rgba(0,56,189,0.07),transparent_68%)]" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(rgba(0,56,189,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(0,56,189,0.025)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,white,transparent_75%)]" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-slate-200" />

        {/* Nav */}
        <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/brand/isotipo-color.png"
              alt="Forwarders ERP"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
            <span>
              <span className="block text-sm font-bold text-[#07111F]">Forwarders ERP</span>
              <span className="block text-[10px] text-slate-400">by DHer</span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 rounded-full border border-white/70 bg-white/55 px-2 py-2 shadow-lg shadow-[#0038BD]/5 ring-1 ring-slate-900/5 backdrop-blur-xl lg:flex">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="group relative overflow-hidden rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/75 hover:text-[#0038BD] hover:shadow-lg hover:shadow-[#0038BD]/10"
              >
                <span className="absolute inset-x-3 top-0 h-px scale-x-0 bg-gradient-to-r from-[#0038BD] to-[#EF8E01] transition-transform duration-300 group-hover:scale-x-100" />
                <span className="relative z-10">{item.label}</span>
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href="#demo"
              className="hidden rounded-full bg-[#EF8E01] px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#db8000] sm:inline-flex"
            >
              Solicitar Demo
            </a>
            <Link
              href="/login"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#07111F] shadow-sm transition hover:border-[#0038BD]/30 hover:text-[#0038BD]"
            >
              Ingresar
            </Link>
            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              aria-label="Menú"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:text-[#0038BD] lg:hidden"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="relative z-10 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur-xl lg:hidden">
            <div className="mx-auto flex max-w-7xl flex-col gap-1">
              {navigation.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-lg px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-[#0038BD]"
                >
                  {item.label}
                </a>
              ))}
              <a
                href="#demo"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 rounded-full bg-[#EF8E01] px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-[#db8000]"
              >
                Solicitar Demo
              </a>
            </div>
          </div>
        )}

        {/* Hero copy */}
        <div className="relative z-10 mx-auto max-w-7xl px-5 pb-20 pt-12 text-center sm:px-8 lg:pb-24">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="mx-auto max-w-4xl"
          >
            <motion.div
              variants={fadeUp}
              className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#0038BD]/12 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm"
            >
              <Sparkles size={14} className="text-[#EF8E01]" />
              Plataforma de Gestión Logística
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="mt-7 text-4xl font-bold leading-[1.1] tracking-tight text-[#07111F] sm:text-5xl lg:text-[64px]"
            >
              Deja de gestionar tu freight forwarding en{' '}
              <span className="relative inline-block">
                <span className="relative z-10 text-[#0038BD]">Excel.</span>
                <span className="absolute -bottom-1 left-0 right-0 h-[3px] rounded-full bg-[#EF8E01]/60" />
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-500"
            >
              Cotizaciones, pricing, clientes, operaciones y control de m&aacute;rgenes
              en una sola plataforma dise&ntilde;ada para freight forwarders.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <a
                href="#demo"
                className="inline-flex h-12 items-center justify-center rounded-full bg-[#0038BD] px-7 text-sm font-bold text-white shadow-lg shadow-[#0038BD]/25 transition hover:bg-[#002fa8]"
              >
                Solicitar Demo
                <ArrowRight className="ml-2" size={16} />
              </a>
              <a
                href="#funcionalidades"
                className="inline-flex h-12 items-center justify-center rounded-full border border-slate-200 bg-white px-7 text-sm font-semibold text-[#07111F] shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                Ver funcionalidades
              </a>
            </motion.div>

            {/* Credibilidad mínima */}
            <motion.p
              variants={fadeUp}
              className="mt-6 text-xs text-slate-400"
            >
              +70 cotizaciones procesadas · Operativo en producción · Honduras y Centroamérica
            </motion.p>
          </motion.div>

          <DashboardMockup />
        </div>
      </section>

      {/* ── Beneficios ───────────────────────────────────────────────────── */}
      <section id="beneficios" className="relative overflow-hidden bg-slate-50 px-5 py-16 sm:px-8 lg:py-20">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.02)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,white,transparent_85%)]" />

        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              className="pr-4"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-red-600">
                <span className="flex h-1.5 w-1.5 rounded-full bg-red-500" />
                Operaci&oacute;n Tradicional
              </div>

              <h2 className="mt-5 text-3xl font-extrabold leading-[1.15] tracking-tight text-[#07111F] sm:text-4xl">
                El problema no es vender m&aacute;s.{' '}
                <span className="text-red-600">Es operar sin perder control.</span>
              </h2>

              <p className="mt-5 text-lg leading-relaxed text-slate-500">
                La mayor&iacute;a de freight forwarders todav&iacute;a dependen de
                Excel, correos, WhatsApp y carpetas compartidas para cotizar,
                aprobar tarifas, coordinar operaciones y validar costos.{' '}
                <span className="font-semibold text-[#0038BD]">Forwarders ERP</span>{' '}
                centraliza ese flujo en una sola plataforma.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {operationalProblems.map((item) => {
                  const Icon = item.icon

                  return (
                    <div
                      key={item.title}
                      className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-red-200 hover:bg-red-50/30 hover:shadow-xl hover:shadow-red-900/5"
                    >
                      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-400 to-[#EF8E01] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                      <div className="flex items-center gap-3.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 transition-all duration-300 group-hover:scale-110 group-hover:bg-red-100 group-hover:text-red-500">
                          <Icon size={18} strokeWidth={2.5} />
                        </div>

                        <h3 className="text-sm font-semibold leading-tight text-slate-700 transition-colors duration-300 group-hover:text-[#07111F]">
                          {item.title}
                        </h3>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              className="group relative"
            >
              <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 p-2 shadow-2xl shadow-slate-300/50 ring-1 ring-slate-900/5 transition-transform duration-500 group-hover:-translate-y-2">
                <div className="flex items-center gap-1.5 pb-2 pl-2 pt-1 opacity-60">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                </div>

                <img
                  src="/excel-desktop-image.png"
                  alt="Escritorio operativo con procesos log&iacute;sticos gestionados en Excel"
                  className="h-auto w-full rounded-xl border border-slate-200/50 bg-white object-contain"
                />
              </div>
            </motion.div>
          </div>

          <div
            className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4"
          >
            {benefits.map((benefit) => {
              const Icon = benefit.icon

              return (
                <div
                  key={benefit.title}
                  className="group relative flex flex-col items-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#0038BD]/30 hover:shadow-xl hover:shadow-[#0038BD]/5"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0038BD] to-[#EF8E01] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0038BD]/5 text-[#0038BD] transition-all duration-300 group-hover:scale-110 group-hover:bg-[#0038BD] group-hover:text-white group-hover:shadow-md">
                    <Icon size={26} strokeWidth={2} />
                  </div>

                  <h3 className="font-bold tracking-tight text-[#07111F]">
                    {benefit.title}
                  </h3>

                  <p className="mt-2.5 text-sm leading-relaxed text-slate-500">
                    {benefit.text}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Propuesta de valor / Solución ───────────────────────────────────── */}
      <section className="relative overflow-hidden bg-[#F0F2F5] px-5 py-24 sm:px-8">
        <div className="relative z-10 mx-auto grid max-w-7xl gap-16 lg:grid-cols-2 lg:items-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={stagger}
            className="max-w-xl"
          >
            <motion.div
              variants={fadeUp}
              className="mb-4 inline-flex rounded-full bg-[#EF8E01]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-[#EF8E01]"
            >
              Soluci&oacute;n Integral
            </motion.div>
            <motion.h2
              variants={fadeUp}
              className="mt-2 text-4xl font-extrabold leading-[1.15] tracking-tight text-[#07111F] sm:text-5xl"
            >
              Un ERP diseñado para equipos de carga internacional.
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="mt-6 text-xl leading-relaxed text-slate-500"
            >
              Forwarders ERP by DHer conecta el flujo comercial con la
              operación: clientes, tarifas, cotizaciones, pricing, documentos y
              actividad del equipo en una experiencia clara para el día a día.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-8 flex items-center gap-5">
              <a
                href="#funcionalidades"
                className="group flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-[#07111F] shadow-sm ring-1 ring-slate-200 transition-all hover:bg-slate-50 hover:ring-[#0038BD]/30"
              >
                Explorar el sistema
                <ArrowRight
                  size={16}
                  className="text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-[#0038BD]"
                />
              </a>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="grid gap-4 sm:grid-cols-2"
          >
            {[
              {
                title: 'Clientes y contactos',
                desc: 'Perfil comercial con historial y tarifas propias',
                icon: Users,
                color: 'text-blue-600',
                bg: 'bg-blue-50',
                hover: 'group-hover:border-blue-300',
              },
              {
                title: 'Tarifas organizadas',
                desc: 'Por cliente, por servicio y por destino',
                icon: Tags,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50',
                hover: 'group-hover:border-emerald-300',
              },
              {
                title: 'Cotizaciones guiadas',
                desc: 'FCL, LCL, aéreo, terrestre y consolidado',
                icon: Calculator,
                color: 'text-purple-600',
                bg: 'bg-purple-50',
                hover: 'group-hover:border-purple-300',
              },
              {
                title: 'Seguimiento operativo',
                desc: 'Booking, SI, timeline y documentos en un lugar',
                icon: Activity,
                color: 'text-[#EF8E01]',
                bg: 'bg-[#EF8E01]/10',
                hover: 'group-hover:border-[#EF8E01]/40',
              },
            ].map((item, index) => {
              const Icon = item.icon

              return (
                <div
                  key={item.title}
                  className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg shadow-slate-200/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${item.hover} ${
                    index === 1 || index === 3 ? 'sm:mt-8' : ''
                  }`}
                >
                  <div
                    className={`absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 ${item.bg}`}
                  />

                  <div className="relative z-10">
                    <div
                      className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${item.bg} ${item.color} transition-transform duration-300 group-hover:scale-110`}
                    >
                      <Icon size={24} strokeWidth={2.5} />
                    </div>

                    <p className="mb-2 text-lg font-bold leading-tight tracking-tight text-[#07111F]">
                      {item.title}
                    </p>
                    <p className="text-sm leading-relaxed text-slate-500">{item.desc}</p>
                  </div>
                </div>
              )
            })}
          </motion.div>
        </div>
      </section>

      {/* ── Funcionalidades ──────────────────────────────────────────────── */}
      <section className="bg-white px-5 py-14 sm:px-8 lg:py-16">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
          >
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#EF8E01]">
              Industrias
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#07111F] sm:text-4xl">
              Pensado para operadores log&iacute;sticos de alto movimiento.
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-500">
              Especializado para compa&ntilde;&iacute;as que viven de cotizar
              r&aacute;pido, operar con orden y proteger margen por embarque.
            </p>
          </motion.div>

          <div
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            {industries.map(({ label, icon: Icon }) => (
              <div
                key={label}
                className="group flex min-h-24 items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:-translate-y-1 hover:border-[#0038BD]/25 hover:bg-white hover:shadow-lg hover:shadow-[#0038BD]/5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-[#0038BD] shadow-sm ring-1 ring-slate-200 transition group-hover:bg-[#0038BD] group-hover:text-white">
                  <Icon size={20} />
                </span>
                <span className="text-sm font-semibold leading-tight text-[#07111F]">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="funcionalidades" className="bg-white px-5 py-16 sm:px-8 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="M&oacute;dulos"
            title="Herramientas concretas para cada equipo."
            description="Cada &aacute;rea trabaja con funciones espec&iacute;ficas: clientes, tarifas, pricing, documentos, costos y reportes sin salir del mismo sistema."
            prominent
          />
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          >
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <motion.div
                  key={feature.title}
                  variants={fadeUp}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#0038BD]/30 hover:shadow-xl hover:shadow-[#0038BD]/5"
                >
                  <div className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-[#0038BD] to-[#EF8E01] transition-transform duration-300 group-hover:scale-x-100" />

                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition-all duration-300 group-hover:bg-[#0038BD] group-hover:text-white group-hover:shadow-md">
                    <Icon size={20} />
                  </div>
                  <h3 className="mt-4 font-semibold text-[#07111F]">{feature.title}</h3>
                  <ul className="mt-3 space-y-1.5">
                    {feature.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-slate-500">
                        <Check
                          size={13}
                          className="mt-0.5 shrink-0 text-[#EF8E01]/35 transition-colors duration-300 group-hover:text-[#EF8E01]"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )
            })}
          </motion.div>
        </div>
      </section>

      {/* ── Workflow ─────────────────────────────────────────────────────── */}
      <section id="workflow" className="bg-[#07111F] px-5 py-24 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Workflow"
            title="De la cotización al margen final, sin perder el control."
            description="Ventas, pricing, operaciones y finanzas trabajan sobre el mismo flujo: cada cotización, cargo, documento y validación queda conectado desde el primer contacto hasta el cierre del embarque."
            light
          />

          <div className="mt-16 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl backdrop-blur-sm">
            <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-9 xl:gap-4">
              {workflow.map((step, index) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05, duration: 0.5 }}
                  className="group relative flex min-h-[92px] items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4 transition-all duration-300 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-lg xl:min-h-[152px] xl:flex-col xl:items-stretch xl:justify-between xl:p-5"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#07111F] text-[10px] font-bold text-[#EF8E01] ring-1 ring-white/10">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>

                  <p className="text-sm font-semibold leading-snug tracking-tight text-white xl:mt-6">
                    {step}
                  </p>

                  {index < workflow.length - 1 && (
                    <ChevronRight
                      className="absolute -right-3 top-[45%] hidden rounded-full bg-[#07111F] text-white/30 ring-1 ring-white/10 transition-colors group-hover:text-[#EF8E01] xl:block"
                      size={20}
                    />
                  )}
                </motion.div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-white">
                Todo conectado en una sola plataforma.
              </p>

              <div className="flex flex-wrap gap-2">
                {['Cotizaciones', 'Pricing', 'Documentos', 'Operaciones', 'Costos', 'Facturación'].map(
                  (item) => (
                    <span
                      key={item}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-blue-100"
                    >
                      {item}
                    </span>
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Equipos ──────────────────────────────────────────────────────── */}
      <section className="bg-white px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Equipos"
            title="Diseñado para cada equipo de tu operación."
            description="Forwarders ERP conecta a los equipos que normalmente trabajan separados. Cada rol tiene su propia vista y permisos: cada equipo ve exactamente lo que necesita."
          />

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-5"
          >
            {[
              {
                title: 'Director General',
                icon: BarChart3,
                items: [
                  'Visibilidad del negocio',
                  'Control de márgenes',
                  'Decisiones con datos',
                ],
              },
              {
                title: 'Jefe Comercial',
                icon: Users,
                items: [
                  'Pipeline de cotizaciones',
                  'Clientes y vendedores',
                  'Seguimiento de oportunidades',
                ],
              },
              {
                title: 'Pricing Analyst',
                icon: Scale,
                items: [
                  'Costos vs ventas',
                  'Tarifas por cliente',
                  'Márgenes automáticos',
                ],
              },
              {
                title: 'Operaciones',
                icon: Route,
                items: [
                  'Shipping Instructions',
                  'Booking / BL',
                  'Documentos por embarque',
                ],
              },
              {
                title: 'Finanzas',
                icon: ClipboardCheck,
                items: [
                  'Validación de costos',
                  'Rentabilidad por operación',
                  'Control de facturación',
                ],
              },
            ].map((role) => {
              const Icon = role.icon

              return (
                <motion.div
                  key={role.title}
                  variants={fadeUp}
                  className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#0038BD]/30 hover:shadow-xl hover:shadow-[#0038BD]/5"
                >
                  <div className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-gradient-to-r from-[#0038BD] to-[#EF8E01] transition-transform duration-300 group-hover:scale-x-100" />

                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition-all duration-300 group-hover:bg-[#0038BD] group-hover:text-white group-hover:shadow-md">
                    <Icon size={20} />
                  </div>

                  <h3 className="mt-4 font-semibold text-[#07111F]">{role.title}</h3>
                  <ul className="mt-3 space-y-1.5">
                    {role.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-slate-500">
                        <Check
                          size={13}
                          className="mt-0.5 shrink-0 text-[#EF8E01]/40 transition-colors duration-300 group-hover:text-[#EF8E01]"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )
            })}
          </motion.div>
        </div>
      </section>

      {/* ── Portal del Cliente ───────────────────────────────────────────── */}
      <section id="portal" className="relative overflow-hidden bg-[#F0F2F5] px-5 py-20 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,56,189,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,56,189,0.03)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,white,transparent_80%)]" />
        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-100px' }}
              variants={stagger}
            >
              <motion.div
                variants={fadeUp}
                className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#0038BD]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.25em] text-[#0038BD]"
              >
                <Smartphone size={13} />
                Portal del Cliente
              </motion.div>

              <motion.h2
                variants={fadeUp}
                className="mt-2 text-4xl font-extrabold leading-[1.15] tracking-tight text-[#07111F] sm:text-5xl"
              >
                Tus clientes con visibilidad propia.
              </motion.h2>

              <motion.p
                variants={fadeUp}
                className="mt-6 text-lg leading-relaxed text-slate-500"
              >
                Cada importador accede a su propio portal para rastrear embarques,
                descargar documentos y recibir alertas — sin necesidad de llamar
                o escribirte por WhatsApp.
              </motion.p>

              <motion.ul variants={stagger} className="mt-8 space-y-4">
                {[
                  { icon: Package, title: 'Tracking en tiempo real', desc: 'Tus clientes ven el estado de cada embarque desde su portal privado.' },
                  { icon: Bell, title: 'Alertas y notificaciones', desc: 'Documentos nuevos, actualizaciones de estado y avisos automáticos.' },
                  { icon: Lock, title: 'Acceso seguro por invitación', desc: 'Registro controlado con onboarding propio y recuperación de contraseña.' },
                  { icon: Eye, title: 'Sin intermediarios', desc: 'El cliente no necesita llamar para saber dónde está su carga.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <motion.li key={title} variants={fadeUp} className="flex items-start gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0038BD] shadow-sm ring-1 ring-slate-200">
                      <Icon size={18} strokeWidth={2} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#07111F]">{title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{desc}</p>
                    </div>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>

            <ClientPortalMockup />
          </div>
        </div>
      </section>

      {/* ── Comparativa ──────────────────────────────────────────────────── */}
      <section className="bg-white px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <SectionHeading
            eyebrow="Comparativa"
            title="Por qué un ERP genérico no es suficiente."
            description="Forwarders ERP by DHer resuelve procesos comerciales y operativos que los ERP tradicionales no modelan de forma nativa."
          />
          <div className="mt-12 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
            <div className="grid grid-cols-[1fr_0.8fr_1.1fr] bg-[#07111F] px-5 py-4 text-xs font-bold uppercase tracking-wider text-white sm:px-6">
              <span>Necesidad</span>
              <span>Proceso tradicional</span>
              <span>Forwarders ERP by DHer</span>
            </div>
            {comparison.map((row, i) => (
              <div
                key={row.item}
                className={`grid grid-cols-[1fr_0.8fr_1.1fr] items-center border-t border-slate-100 px-5 py-4 text-sm sm:px-6 ${
                  i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                }`}
              >
                <span className="font-medium text-[#07111F]">{row.item}</span>
                <span className="text-slate-400">{row.generic}</span>
                <span className="flex items-center gap-2 font-semibold text-[#0038BD]">
                  <Check size={14} className="shrink-0 text-[#EF8E01]" />
                  {row.product}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA / Demo ───────────────────────────────────────────────────── */}
      <section id="demo" className="bg-white px-5 py-24 sm:px-8">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-[#07111F] p-8 shadow-2xl shadow-[#07111F]/30 sm:p-12 lg:p-16">
          {/* Acento visual */}
          <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-[#EF8E01]/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-[#0038BD]/20 blur-3xl" />

          <div className="relative z-10 grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#EF8E01]">
                Contacto
              </p>
              <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
                Moderniza tu operaci&oacute;n log&iacute;stica.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-8 text-slate-400">
                Deja atr&aacute;s Excel y correos interminables. Centraliza tu operaci&oacute;n
                en una plataforma dise&ntilde;ada para freight forwarders que quieren
                vender m&aacute;s, operar mejor y controlar sus m&aacute;rgenes.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 transition hover:text-white"
              >
                ¿Ya tienes acceso?{' '}
                <span className="text-[#EF8E01]">Ingresar al ERP →</span>
              </Link>
            </div>

            {submitted ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] p-10 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EF8E01]/20 text-[#EF8E01]">
                  <Check size={28} />
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">¡Mensaje recibido!</h3>
                <p className="mt-2 text-sm text-slate-400">Te contactaremos a la brevedad.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="text"
                    placeholder="Tu nombre"
                    required
                    value={form.nombre}
                    onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                    className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-[#EF8E01]/50 focus:ring-1 focus:ring-[#EF8E01]/30"
                  />
                  <input
                    type="text"
                    placeholder="Empresa"
                    required
                    value={form.empresa}
                    onChange={(e) => setForm((f) => ({ ...f, empresa: e.target.value }))}
                    className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-[#EF8E01]/50 focus:ring-1 focus:ring-[#EF8E01]/30"
                  />
                </div>
                <input
                  type="email"
                  placeholder="Correo electrónico"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-[#EF8E01]/50 focus:ring-1 focus:ring-[#EF8E01]/30"
                />
                <input
                  type="tel"
                  placeholder="Teléfono (opcional)"
                  value={form.telefono}
                  onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                  className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-[#EF8E01]/50 focus:ring-1 focus:ring-[#EF8E01]/30"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-1 inline-flex h-12 items-center justify-center rounded-xl bg-[#EF8E01] px-6 text-sm font-bold text-white shadow-lg shadow-[#EF8E01]/20 transition hover:bg-[#db8000] disabled:opacity-60"
                >
                  {submitting ? 'Enviando...' : 'Solicitar Demo'}
                  {!submitting && <ArrowRight className="ml-2" size={16} />}
                </button>
                <p className="text-center text-xs text-slate-500">
                  O escríbenos a{' '}
                  <a href="mailto:contacto@dher.dev" className="text-[#EF8E01] hover:underline">
                    contacto@dher.dev
                  </a>
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative overflow-hidden border-t border-white/10 bg-[#07111F] px-5 py-12 text-white sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,56,189,0.22),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(239,142,1,0.16),transparent_34%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] opacity-50 [mask-image:radial-gradient(ellipse_at_center,white,transparent_78%)]" />

        <div className="relative mx-auto flex max-w-7xl flex-col gap-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-md">
              <div className="flex items-center gap-3">
                <Image
                  src="/brand/lockup-h-blanco.png"
                  alt="Forwarders ERP"
                  width={200}
                  height={48}
                  className="h-12 w-auto object-contain"
                />
              </div>

              <p className="mt-4 text-sm leading-7 text-slate-400">
                ERP log&iacute;stico para freight forwarders que necesitan cotizar,
                operar y proteger margen con mayor visibilidad.
              </p>
              <p className="mt-3 text-sm">
                <span className="font-semibold text-white">Creado por Forwarders, para Forwarders.</span>{' '}
                <span className="text-slate-500">No por quien nunca vio un BL.</span>
              </p>
            </div>

            <div className="flex flex-col gap-4 md:items-end">
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Beneficios', href: '#beneficios' },
                  { label: 'Funcionalidades', href: '#funcionalidades' },
                  { label: 'Workflow', href: '#workflow' },
                  { label: 'Portal Cliente', href: '#portal' },
                  { label: 'Contacto', href: '#demo' },
                ].map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-300 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.08] hover:text-white hover:shadow-lg hover:shadow-[#0038BD]/10"
                  >
                    {link.label}
                  </a>
                ))}
              </div>

              <a
                href="mailto:contacto@dher.dev"
                className="inline-flex items-center gap-2 rounded-full border border-[#EF8E01]/20 bg-[#EF8E01]/10 px-4 py-2 text-sm font-semibold text-[#EF8E01] transition hover:bg-[#EF8E01]/15"
              >
                <Mail size={15} />
                contacto@dher.dev
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>
              &copy; 2026 Forwarders ERP by DHer. Todos los derechos reservados.
            </p>
            <div className="flex items-center gap-4">
              <Link
                href="/politicas"
                className="transition hover:text-slate-300"
              >
                Términos y Privacidad
              </Link>
              <span className="text-slate-600">·</span>
              <span>Honduras &amp; Centroam&eacute;rica</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  )
}
