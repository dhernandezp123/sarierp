'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

const SECTIONS = [
  {
    title: '1. Aceptación de los Términos',
    content: 'Al utilizar los servicios de esta plataforma, usted acepta quedar vinculado por estos Términos y Condiciones. Si no está de acuerdo con alguno de estos términos, no podrá hacer uso de nuestros servicios.',
  },
  {
    title: '2. Descripción del Servicio',
    content: 'Proveemos servicios de recepción, almacenamiento temporal y consolidación de paquetes en nuestra bodega de Miami, Florida, para su posterior envío a Honduras. El servicio incluye asignación de número de casillero (WH#) y notificación al cliente.',
  },
  {
    title: '3. Responsabilidad por los Paquetes',
    content: 'Nos hacemos responsables por los paquetes una vez recibidos y registrados en nuestro sistema. No somos responsables por daños ocurridos durante el transporte desde el vendedor hasta nuestra bodega, ni por el contenido declarado incorrectamente.',
  },
  {
    title: '4. Artículos Prohibidos',
    content: 'El cliente es responsable de no enviar artículos prohibidos. Cualquier envío que contenga materiales ilegales o restringidos será retenido y entregado a las autoridades correspondientes. El cliente asume toda responsabilidad legal en estos casos.',
  },
  {
    title: '5. Declaración de Valor y Aduana',
    content: 'El cliente es responsable de la declaración correcta del valor de sus mercancías para efectos aduaneros. Los impuestos, aranceles y gastos aduaneros son responsabilidad exclusiva del cliente. No nos hacemos responsables por retenciones en aduana por declaraciones incorrectas.',
  },
  {
    title: '6. Tarifas y Pagos',
    content: 'Las tarifas de servicio se calculan según el peso real o volumétrico (el que sea mayor), más los cargos por manejo y consolidación aplicables. Los precios están sujetos a cambios sin previo aviso.',
  },
  {
    title: '7. Almacenamiento Temporal',
    content: 'Los paquetes se almacenan gratuitamente por un período de 30 días desde su recepción. Transcurrido este plazo, se aplicarán cargos diarios de almacenamiento. Después de 90 días sin reclamar, nos reservamos el derecho de disponer del paquete.',
  },
  {
    title: '8. Seguros',
    content: 'Recomendamos que el cliente adquiera seguro para sus mercancías de valor. Nuestra responsabilidad en caso de pérdida o daño está limitada al valor declarado o a la tarifa mínima establecida por nuestras políticas internas.',
  },
  {
    title: '9. Privacidad',
    content: 'La información personal proporcionada es utilizada exclusivamente para la prestación de nuestros servicios de carga y logística. No compartimos datos personales con terceros sin consentimiento, excepto cuando sea requerido por la ley.',
  },
  {
    title: '10. Modificaciones',
    content: 'Nos reservamos el derecho de modificar estos términos en cualquier momento. Las modificaciones entrarán en vigor inmediatamente después de su publicación. El uso continuado del servicio constituye aceptación de los términos modificados.',
  },
]

export default function TerminosPage() {
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
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Términos y Condiciones</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Última actualización: junio 2026</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {SECTIONS.map(s => (
            <div key={s.title} className="px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">{s.title}</h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{s.content}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-slate-600">
        Para preguntas sobre estos términos, contáctenos directamente.
      </p>
    </div>
  )
}
