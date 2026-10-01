import Link from 'next/link'
import { PackagePlus, Truck, MessageSquare, ChevronRight, Calculator, HelpCircle } from 'lucide-react'
import { PortalPageHeader } from '@/src/components/portal/PortalUI'

const actions = [
  { href: '/portal/pre-alertas', title: 'Prealertas', text: 'Avísanos de tus compras y consulta su llegada a Miami.', icon: PackagePlus },
  { href: '/portal/pickup', title: 'Recogidas', text: 'Solicita una recogida y consulta su estado.', icon: Truck },
  { href: '/portal/incidencias', title: 'Ayuda con un paquete', text: 'Reporta un problema y sigue su resolución.', icon: MessageSquare },
  { href: '/portal/calculadora', title: 'Calculadora de volumen', text: 'Convierte medidas y estima el volumen de tu carga.', icon: Calculator },
  { href: '/portal/contacto', title: 'Contactar al equipo', text: 'Encuentra nuestros canales de atención y oficinas.', icon: HelpCircle },
]

export default function PortalSolicitudesPage() {
  return <div className="space-y-5"><PortalPageHeader title="Solicitudes" subtitle="Crea una gestión o consulta cómo va." /><div className="grid gap-3 sm:grid-cols-2">{actions.map(item => <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-slate-800 dark:bg-slate-900"><item.icon className="h-6 w-6 shrink-0 text-blue-600" /><div className="min-w-0 flex-1"><h2 className="font-semibold">{item.title}</h2><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.text}</p></div><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /></Link>)}</div></div>
}
