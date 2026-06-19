'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, AlertTriangle, XCircle } from 'lucide-react'

const CATEGORIES = [
  {
    name: 'Completamente Prohibidos',
    icon: '🚫',
    danger: true,
    items: [
      'Armas de fuego, municiones y explosivos',
      'Drogas y narcóticos ilegales',
      'Material pornográfico',
      'Moneda falsificada o documentos falsos',
      'Artículos de fauna y flora silvestre protegida (CITES)',
      'Material nuclear o radiactivo',
      'Mercancía de contrabando',
    ],
  },
  {
    name: 'Líquidos y Sustancias',
    icon: '💧',
    danger: true,
    items: [
      'Líquidos inflamables (gasolina, aceites combustibles)',
      'Aerosoles de más de 118 ml por unidad',
      'Sustancias corrosivas o ácidos',
      'Pinturas, barnices y disolventes en grandes cantidades',
      'Alcohol en volúmenes comerciales sin permiso',
      'Perfumes en recipientes de vidrio sin protección adecuada',
    ],
  },
  {
    name: 'Alimentos y Perecederos',
    icon: '🍎',
    danger: false,
    items: [
      'Frutas y verduras frescas',
      'Carnes y productos cárnicos sin sellos USDA',
      'Lácteos sin empaque comercial cerrado',
      'Plantas vivas o con tierra',
      'Semillas sin certificado fitosanitario',
      'Alimentos no comerciales en grandes cantidades',
    ],
  },
  {
    name: 'Electrónicos y Baterías',
    icon: '🔋',
    danger: false,
    items: [
      'Baterías de litio sueltas (sin dispositivo)',
      'Powerbanks de más de 100 Wh sin autorización',
      'Dispositivos con baterías dañadas o hinchadas',
      'Drones sin registro FAA (desde EE.UU.)',
    ],
  },
  {
    name: 'Medicamentos',
    icon: '💊',
    danger: false,
    items: [
      'Medicamentos controlados sin receta médica',
      'Suplementos no aprobados por FDA',
      'Medicamentos en cantidades comerciales sin permiso',
      'Jeringas sin receta o certificado médico',
    ],
  },
  {
    name: 'Otros Artículos Restringidos',
    icon: '⚠️',
    danger: false,
    items: [
      'Artículos de cuero de reptiles sin CITES',
      'Cigarrillos y tabaco en exceso del límite personal',
      'Joyas de alto valor sin declaración',
      'Dinero en efectivo superior a USD 10,000 sin declarar',
      'Artículos con derechos de autor falsificados (replicas de marcas)',
      'Equipos de vigilancia o espionaje',
    ],
  },
]

export default function RestringidosPage() {
  const router = useRouter()

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Materiales Restringidos</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Artículos que no podemos recibir o transportar</p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900/40 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            El envío de artículos prohibidos puede resultar en confiscación, multas y acciones legales.
            Si tienes dudas sobre un artículo específico, contáctanos antes de realizar tu compra.
          </p>
        </div>
      </div>

      {CATEGORIES.map(cat => (
        <div key={cat.name} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className={`flex items-center gap-2 border-b px-5 py-3.5 ${
            cat.danger
              ? 'border-red-100 bg-red-50 dark:border-red-900/30 dark:bg-red-950/20'
              : 'border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60'
          }`}>
            <span className="text-lg">{cat.icon}</span>
            <p className={`font-semibold text-sm ${cat.danger ? 'text-red-800 dark:text-red-200' : 'text-slate-800 dark:text-slate-200'}`}>
              {cat.name}
            </p>
            {cat.danger && (
              <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                Prohibido
              </span>
            )}
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {cat.items.map(item => (
              <li key={item} className="flex items-start gap-3 px-5 py-3">
                <XCircle className={`mt-0.5 h-4 w-4 shrink-0 ${cat.danger ? 'text-red-400' : 'text-amber-400'}`} />
                <span className="text-sm text-slate-700 dark:text-slate-300">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <p className="text-center text-xs text-slate-400 dark:text-slate-600">
        Lista actualizada al 2026. Sujeta a cambios por regulaciones aduaneras.
      </p>
    </div>
  )
}
