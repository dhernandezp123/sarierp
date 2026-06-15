'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { Variants } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Globe2,
  LockKeyhole,
  Plane,
  Route,
  Scale,
  ShieldCheck,
  Ship,
  Sparkles,
  Users,
  Warehouse,
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
  { label: 'Contacto', href: '#demo' },
]

const dashboardModules = [
  'Clientes',
  'Nueva Cotización',
  'Pricing',
  'Operaciones',
  'Documentos',
  'Actividad',
]

const benefits = [
  {
    title: 'Cotiza más rápido',
    text: 'LCL, FCL, aéreo, terrestre y courier desde un flujo ordenado. Sin tablas dispersas, sin correos intermedios.',
  },
  {
    title: 'Protege tus márgenes',
    text: 'Compara costos de proveedor con la venta al cliente antes de aprobar cualquier propuesta.',
  },
  {
    title: 'Elimina reprocesos',
    text: 'Datos de clientes, tarifas y operaciones en un sistema. Sin reescribir información entre equipos.',
  },
  {
    title: 'Visibilidad operativa real',
    text: 'Cada equipo ve el estado del embarque, el historial relevante y los documentos en un mismo lugar.',
  },
]

const operationalProblems = [
  'Excel para tarifas',
  'Correos para aprobaciones',
  'WhatsApp para seguimiento',
  'Carpetas para documentos',
]

const features = [
  {
    title: 'Clientes y tarifas',
    icon: Users,
    items: [
      'Historial comercial',
      'Contactos por empresa',
      'Tarifas organizadas por cliente',
      'Seguro de carga',
    ],
  },
  {
    title: 'Cotizaciones',
    icon: FileText,
    items: ['Aéreo', 'Marítimo', 'Terrestre', 'Courier', 'LCL / FCL'],
  },
  {
    title: 'Pricing',
    icon: Scale,
    items: [
      'Costos vs ventas',
      'Margen estimado',
      'Cargos por categoría',
      'Comparación de opciones',
    ],
  },
  {
    title: 'Miami Consolidado',
    icon: Ship,
    items: ['Tarifas por cliente', 'KG / LBS', 'FT3 / CBM', 'CBM manual'],
  },
  {
    title: 'Operaciones',
    icon: Route,
    items: [
      'Shipping Instructions',
      'Control de booking',
      'Timeline operativo',
      'Gestión documental',
    ],
  },
  {
    title: 'Validación de costos',
    icon: ClipboardCheck,
    items: [
      'Costos de proveedor',
      'Soporte de facturas',
      'Revisión financiera',
      'Diferencias visibles',
    ],
  },
  {
    title: 'Reportes ejecutivos',
    icon: BarChart3,
    items: ['KPIs comerciales', 'Revenue', 'Pipeline', 'Actividad operativa'],
  },
  {
    title: 'Seguridad empresarial',
    icon: ShieldCheck,
    items: [
      'Permisos seguros por rol',
      'Control de acceso empresarial',
      'Auditoría de cambios',
      'Visibilidad controlada',
    ],
  },
]

const workflow = [
  'Cliente',
  'Cotización',
  'Pricing',
  'Aprobación',
  'Shipping Instruction',
  'Documentos',
  'Validación de Costos',
  'Dashboard',
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
    item: 'Pricing logístico',
    generic: 'Cálculos manuales',
    product: 'Comparación clara de costos y ventas',
  },
  {
    item: 'Miami Consolidado',
    generic: 'Conversiones manuales',
    product: 'KG/LBS y FT3/CBM en el flujo',
  },
  {
    item: 'Seguimiento operativo',
    generic: 'Mensajes aislados',
    product: 'Actividad visible para el equipo',
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
}: {
  eyebrow: string
  title: string
  description?: string
  light?: boolean
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-100px' }}
      className="mx-auto max-w-3xl text-center"
    >
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#EF8E01]">
        {eyebrow}
      </p>
      <h2
        className={`mt-3 text-3xl font-semibold tracking-tight sm:text-4xl ${
          light ? 'text-white' : 'text-[#07111F]'
        }`}
      >
        {title}
      </h2>
      {description && (
        <p
          className={`mt-4 text-base leading-8 ${
            light ? 'text-blue-100' : 'text-slate-500'
          }`}
        >
          {description}
        </p>
      )}
    </motion.div>
  )
}

function DashboardMockup() {
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
        {/* Barra superior */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#EF8E01]/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            <span className="ml-3 hidden rounded-md border border-slate-200 bg-white px-3 py-1 font-mono text-[11px] text-slate-400 sm:block">
              app.forwarders-erp.dher.com/dashboard
            </span>
          </div>
          <span className="rounded-full border border-[#0038BD]/20 bg-[#0038BD]/6 px-3 py-1 text-[11px] font-semibold text-[#0038BD]">
            Operación centralizada
          </span>
        </div>

        <div className="grid lg:grid-cols-[200px_1fr]">
          {/* Sidebar */}
          <aside className="hidden border-r border-slate-100 bg-slate-50/60 p-5 lg:block">
            <div className="mb-6 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0038BD] text-white">
                <Globe2 size={17} />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#07111F]">Forwarders ERP</p>
                <p className="text-[10px] text-slate-400">by DHer</p>
              </div>
            </div>
            <div className="space-y-1">
              {dashboardModules.map((module, i) => (
                <div
                  key={module}
                  className={`rounded-lg px-3 py-2 text-xs ${
                    i === 2
                      ? 'bg-white font-semibold text-[#07111F] shadow-sm ring-1 ring-slate-200'
                      : 'text-slate-400'
                  }`}
                >
                  {module}
                </div>
              ))}
            </div>
          </aside>

          {/* Contenido principal */}
          <div className="bg-white p-5">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ['Cotizaciones activas', '87', '+12%'],
                ['Clientes atendidos', '42', 'Este mes'],
                ['Opciones comparadas', '126', 'Pricing'],
                ['Operaciones visibles', '34', 'Equipo'],
              ].map(([label, value, badge]) => (
                <div
                  key={label}
                  className="rounded-xl border border-slate-100 bg-slate-50 p-3.5"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {label}
                  </p>
                  <div className="mt-2.5 flex items-end justify-between">
                    <p className="text-lg font-bold text-[#07111F]">{value}</p>
                    <span className="rounded-full bg-[#EF8E01]/10 px-2 py-0.5 text-[10px] font-semibold text-[#B86900]">
                      {badge}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[#07111F]">
                    Comparativo de pricing
                  </p>
                  <span className="rounded-full bg-[#0038BD]/8 px-2.5 py-1 text-[11px] font-semibold text-[#0038BD]">
                    3 opciones
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {[
                    ['MIA → SPS LCL', 'Cliente A', 'Lista'],
                    ['SHA → PCR FCL', 'Cliente B', 'En revisión'],
                    ['MAD → TGU AIR', 'Cliente C', 'Lista'],
                  ].map(([lane, customer, status]) => (
                    <div
                      key={lane}
                      className="grid grid-cols-[1fr_80px_68px] items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-[#07111F]">{lane}</span>
                      <span className="text-slate-400">{customer}</span>
                      <span className="font-semibold text-[#EF8E01]">{status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[#0038BD]/15 bg-[#0038BD]/5 p-4">
                <p className="text-xs font-semibold text-[#07111F]">Actividad reciente</p>
                <div className="mt-3 space-y-3">
                  {[
                    'Nueva cotización LCL ingresada',
                    'Pricing enviado a revisión',
                    'Booking actualizado',
                    'Factura de proveedor adjuntada',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                        <Check size={12} className="text-[#EF8E01]" />
                      </span>
                      <span className="text-xs text-slate-600">{item}</span>
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

// ─── Landing principal ────────────────────────────────────────────────────────

export function ForwardersLanding() {
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
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EF8E01] text-white shadow-sm">
              <Globe2 size={18} />
            </span>
            <span>
              <span className="block text-sm font-bold text-[#07111F]">Forwarders ERP</span>
              <span className="block text-[10px] text-slate-400">by DHer</span>
            </span>
          </Link>

          <div className="hidden items-center gap-7 lg:flex">
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-slate-500 transition hover:text-[#0038BD]"
              >
                {item.label}
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
          </div>
        </nav>

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
              Freight Forwarding Management Platform
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
              Diseñado para freight forwarders en Honduras y Centroamérica · Operativo en producción
            </motion.p>
          </motion.div>

          <DashboardMockup />
        </div>
      </section>

      {/* ── Beneficios ───────────────────────────────────────────────────── */}
      <section className="bg-white px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
            >
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#EF8E01]">
                OPERACI&Oacute;N TRADICIONAL
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#07111F] sm:text-4xl">
                El problema no es vender m&aacute;s. Es operar sin perder control.
              </h2>
              <p className="mt-4 text-base leading-8 text-slate-500">
                La mayor&iacute;a de freight forwarders todav&iacute;a dependen de
                Excel, correos, WhatsApp y carpetas compartidas para cotizar,
                aprobar tarifas, coordinar operaciones y validar costos.
                Forwarders ERP centraliza ese flujo en una sola plataforma.
              </p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
              className="group"
            >
              <img
                src="/excel-desktop-image.png"
                alt="Escritorio operativo con procesos log&iacute;sticos gestionados en Excel"
                className="h-auto w-full rounded-3xl border border-slate-200/70 bg-white object-contain shadow-2xl shadow-[#0038BD]/15 ring-1 ring-slate-900/5 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[#0038BD]/20"
              />
            </motion.div>
          </div>
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4"
          >
            {operationalProblems.map((item) => (
              <motion.div
                variants={fadeUp}
                key={item}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#0038BD]/20 hover:shadow-lg"
              >
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#EF8E01]/10 text-[#EF8E01] transition group-hover:bg-[#EF8E01]/15">
                  <Check size={18} />
                </div>
                <h3 className="font-semibold text-[#07111F]">{item}</h3>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section id="beneficios" className="bg-white px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="El problema"
            title="Tu operación no debería depender de Excel."
            description="Cuando ventas, pricing y operaciones trabajan en archivos separados, el margen se vuelve invisible y los errores llegan tarde."
          />
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4"
          >
            {benefits.map((benefit) => (
              <motion.div
                variants={fadeUp}
                key={benefit.title}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#0038BD]/20 hover:shadow-lg"
              >
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-[#EF8E01]/10 text-[#EF8E01] transition group-hover:bg-[#EF8E01]/15">
                  <Check size={18} />
                </div>
                <h3 className="font-semibold text-[#07111F]">{benefit.title}</h3>
                <p className="mt-2.5 text-sm leading-6 text-slate-500">{benefit.text}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Propuesta de valor ───────────────────────────────────────────── */}
      <section className="bg-[#F0F2F5] px-5 py-20 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={stagger}
          >
            <motion.p
              variants={fadeUp}
              className="text-xs font-bold uppercase tracking-[0.25em] text-[#EF8E01]"
            >
              Solución
            </motion.p>
            <motion.h2
              variants={fadeUp}
              className="mt-3 text-3xl font-semibold tracking-tight text-[#07111F] sm:text-4xl"
            >
              Un ERP diseñado para equipos de carga internacional.
            </motion.h2>
            <motion.p
              variants={fadeUp}
              className="mt-5 text-base leading-8 text-slate-500"
            >
              Forwarders ERP by DHer conecta el flujo comercial con la
              operación: clientes, tarifas, cotizaciones, pricing, documentos y
              actividad del equipo en una experiencia clara para el día a día.
            </motion.p>
            <motion.a
              variants={fadeUp}
              href="#funcionalidades"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0038BD] transition hover:gap-2.5"
            >
              Ver todas las funcionalidades
              <ArrowRight size={15} />
            </motion.a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="grid gap-3 sm:grid-cols-2"
          >
            {[
              { title: 'Clientes y contactos', desc: 'Perfil comercial con historial y tarifas propias' },
              { title: 'Tarifas organizadas', desc: 'Por cliente, por servicio y por destino' },
              { title: 'Cotizaciones guiadas', desc: 'FCL, LCL, aéreo, terrestre y Miami consolidado' },
              { title: 'Seguimiento operativo', desc: 'Booking, SI, timeline y documentos en un mismo expediente' },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <Check className="mb-3 text-[#EF8E01]" size={18} />
                <p className="font-semibold text-[#07111F]">{item.title}</p>
                <p className="mt-1.5 text-xs text-slate-500">{item.desc}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Funcionalidades ──────────────────────────────────────────────── */}
      <section id="funcionalidades" className="bg-white px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Funcionalidades"
            title="Todo el ciclo operativo en un solo sistema."
            description="Módulos diseñados para controlar cotizaciones, pricing, documentación, finanzas y actividad operativa sin perder contexto entre equipos."
          />
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <motion.div
                  key={feature.title}
                  variants={fadeUp}
                  className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#0038BD]/20 hover:shadow-lg"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0038BD]/7 text-[#0038BD] transition group-hover:bg-[#0038BD]/12">
                    <Icon size={20} />
                  </div>
                  <h3 className="mt-4 font-semibold text-[#07111F]">{feature.title}</h3>
                  <ul className="mt-3 space-y-1.5">
                    {feature.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-slate-500">
                        <Check size={13} className="mt-0.5 shrink-0 text-[#EF8E01]" />
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
      <section id="workflow" className="bg-[#07111F] px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Workflow"
            title="Del cliente a la operación cerrada."
            description="Una línea de trabajo conectada para que cada equipo vea qué pasó antes, qué falta ahora y qué margen queda al final."
            light
          />
          <div className="mt-12 overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {workflow.map((step, index) => (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.04, duration: 0.4 }}
                  className="relative rounded-xl bg-white/8 p-4"
                >
                  <p className="text-[10px] font-bold text-[#EF8E01]">
                    {String(index + 1).padStart(2, '0')}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">{step}</p>
                  {index < workflow.length - 1 && (
                    <ChevronRight
                      className="absolute right-2 top-1/2 hidden -translate-y-1/2 text-white/20 lg:block"
                      size={16}
                    />
                  )}
                </motion.div>
              ))}
            </div>
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

      {/* ── Industrias ───────────────────────────────────────────────────── */}
      <section className="bg-[#F0F2F5] px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Industrias"
            title="Pensado para operadores logísticos de alto movimiento."
            description="Especializado para compañías que viven de cotizar rápido, operar con orden y proteger margen por embarque."
          />
          <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {industries.map(({ label, icon: Icon }) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#0038BD]/20 hover:shadow-md"
              >
                <Icon className="mb-4 text-[#0038BD]" size={20} />
                <p className="text-sm font-semibold text-[#07111F]">{label}</p>
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

          <div className="relative z-10 grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#EF8E01]">
                Contacto
              </p>
              <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
                Moderniza tu operación logística.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-8 text-slate-400">
                Deja atrás Excel y correos interminables. Centraliza tu operación
                en una plataforma diseñada para freight forwarders que quieren
                vender más, operar mejor y controlar sus márgenes.
              </p>
              <p className="mt-4 text-sm text-slate-500">
                Escríbenos a{' '}
                <a
                  href="mailto:contacto@dher.dev"
                  className="font-semibold text-[#EF8E01] hover:underline"
                >
                  contacto@dher.dev
                </a>
              </p>
            </div>

            <div className="flex flex-col gap-3 lg:min-w-[220px]">
              <a
                href="mailto:contacto@dher.dev?subject=Solicitar%20Demo%20Forwarders%20ERP"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-[#EF8E01] px-6 text-sm font-bold text-white shadow-lg shadow-[#EF8E01]/20 transition hover:bg-[#db8000]"
              >
                Solicitar Demo
                <ArrowRight className="ml-2" size={16} />
              </a>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/15 bg-white/8 px-6 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
              >
                Ingresar al ERP
                <LockKeyhole className="ml-2" size={14} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EF8E01] text-white">
                <Globe2 size={16} />
              </span>
              <span className="text-sm font-bold text-[#07111F]">Forwarders ERP by DHer</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              Freight Forwarding Management Platform · Honduras & Centroamérica
            </p>
          </div>

          <div className="flex flex-wrap gap-5 text-sm text-slate-400">
            {['Beneficios', 'Funcionalidades', 'Workflow', 'Contacto'].map((link) => (
              <a
                key={link}
                href={`#${link.toLowerCase()}`}
                className="transition hover:text-[#0038BD]"
              >
                {link}
              </a>
            ))}
            <a
              href="mailto:contacto@dher.dev"
              className="transition hover:text-[#0038BD]"
            >
              contacto@dher.dev
            </a>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-slate-400">
          © 2026 Forwarders ERP by DHer. Todos los derechos reservados.
        </p>
      </footer>
    </main>
  )
}
