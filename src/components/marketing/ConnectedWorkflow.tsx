import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  FileText,
  Receipt,
  Ship,
} from 'lucide-react'
import { operationLifecycle } from './landing-content'
import styles from './landing.module.css'

const lifecycleIcons = [FileText, CircleDollarSign, CheckCircle2, Ship, FileCheck2, Receipt, BarChart3]

const handoffs = [
  {
    number: '01',
    label: 'Decidir',
    title: 'Cotiza con el margen a la vista.',
    detail:
      'Ventas registra cliente, ruta y carga. Pricing compara tarifas de agentes y deja una opción seleccionada con sus condiciones comerciales.',
    result: 'Cotización + pricing + opción comercial',
  },
  {
    number: '02',
    label: 'Ejecutar',
    title: 'La operación recibe el contexto.',
    detail:
      'Cuando la cotización avanza, el shipment, la Shipping Instruction, el booking y los BL forman parte del mismo recorrido operativo.',
    result: 'Shipment + SI + booking + documentos',
  },
  {
    number: '03',
    label: 'Cerrar',
    title: 'Compara lo cotizado con lo registrado.',
    detail:
      'La validación de costos, la facturación y el dashboard financiero permiten revisar el resultado disponible sin mezclar monedas ni asumir costos faltantes.',
    result: 'Costos + facturación + resultado financiero',
  },
]

export function ConnectedWorkflow() {
  return (
    <section id="workflow" className="overflow-hidden bg-white px-5 py-16 sm:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr] lg:items-end lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0038BD]">El ciclo de una operación</p>
            <h2 className="mt-4 max-w-xl font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#07111F] sm:text-4xl lg:text-5xl">
              El expediente avanza. El contexto no vuelve a empezar.
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-8 text-slate-600 lg:pb-1">
            Cada equipo trabaja en su momento, pero sobre la misma historia: qué se ofreció, qué se coordinó y qué resultado quedó registrado. Sin reconstruir el embarque desde correos y archivos separados.
          </p>
        </div>

        <div className="mt-10 overflow-x-auto pb-3" aria-label="Ciclo conectado de la operación">
          <ol className={`${styles.lifecycleTrack} grid min-w-[71rem] grid-cols-7 lg:min-w-0`}>
            {operationLifecycle.map((stage, index) => {
              const Icon = lifecycleIcons[index]
              return (
                <li key={stage.id} className="relative px-2 first:pl-0 last:pr-0">
                  <div className="relative z-10 h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#0038BD]">
                        <Icon size={17} aria-hidden="true" />
                      </span>
                      <span className="font-mono text-[10px] font-bold text-slate-400">{stage.shortLabel}</span>
                    </div>
                    <h3 className="mt-5 text-sm font-bold text-[#07111F]">{stage.label}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{stage.detail}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {handoffs.map((handoff, index) => (
            <article key={handoff.number} className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-[#F7F9FC] p-6 sm:p-7">
              <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-[#0038BD] transition-colors group-hover:bg-[#EF8E01]" />
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#0038BD]">{handoff.label}</span>
                <span className="font-mono text-xs font-bold text-slate-400">{handoff.number}</span>
              </div>
              <h3 className="mt-5 text-xl font-semibold leading-7 tracking-tight text-[#07111F]">{handoff.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">{handoff.detail}</p>
              <div className="mt-6 flex items-start gap-3 border-t border-slate-200 pt-5 text-xs font-semibold leading-5 text-slate-600">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#16A36A]" aria-hidden="true" />
                {handoff.result}
              </div>
              {index < handoffs.length - 1 ? (
                <span aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0038BD] shadow-sm lg:flex">
                  <ArrowRight size={14} />
                </span>
              ) : null}
            </article>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-5 rounded-2xl border border-blue-100 bg-blue-50/60 px-5 py-5 sm:flex-row sm:items-center sm:px-7">
          <p className="max-w-3xl text-sm leading-6 text-slate-700">
            <strong className="font-semibold text-[#07111F]">El flujo se adapta a la modalidad.</strong>{' '}
            FCL, LCL, aéreo, terrestre y courier conservan sus datos y documentos correspondientes.
          </p>
          <a href="#producto" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-bold text-[#0038BD] underline-offset-4 hover:underline">
            Ver las pantallas reales <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  )
}
