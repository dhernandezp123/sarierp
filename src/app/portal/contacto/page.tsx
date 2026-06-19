'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, MapPin, Clock, Phone, Mail, ExternalLink } from 'lucide-react'

const OFFICES = [
  {
    city: 'Miami, Florida',
    flag: '🇺🇸',
    type: 'Bodega de recepción',
    address: '8350 NW 52nd Terrace, Suite 201\nDoral, FL 33166\nEstados Unidos',
    mapsUrl: 'https://maps.google.com/?q=8350+NW+52nd+Terrace+Doral+FL+33166',
    wazeUrl: 'https://waze.com/ul?q=8350+NW+52nd+Terrace+Doral+FL',
    hours: [
      { day: 'Lunes – Viernes', time: '8:00 AM – 5:00 PM EST' },
      { day: 'Sábado', time: '9:00 AM – 1:00 PM EST' },
      { day: 'Domingo', time: 'Cerrado' },
    ],
    phone: '+1 (305) 000-0000',
    email: 'miami@example.com',
  },
  {
    city: 'Tegucigalpa, Honduras',
    flag: '🇭🇳',
    type: 'Oficina principal',
    address: 'Col. Palmira, Blvd. Juan Pablo II\nEdificio XYZ, Piso 3\nTegucigalpa, MDC',
    mapsUrl: 'https://maps.google.com/?q=Tegucigalpa+Honduras',
    wazeUrl: 'https://waze.com/ul?q=Tegucigalpa+Honduras',
    hours: [
      { day: 'Lunes – Viernes', time: '8:00 AM – 5:00 PM HN' },
      { day: 'Sábado', time: '9:00 AM – 12:00 PM HN' },
      { day: 'Domingo', time: 'Cerrado' },
    ],
    phone: '+504 2000-0000',
    email: 'info@example.com',
  },
]

export default function ContactoPage() {
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
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Contáctanos</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Nuestras oficinas y horarios de atención</p>
        </div>
      </div>

      {OFFICES.map(office => (
        <div key={office.city} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {/* Header */}
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/60">
            <div className="flex items-center gap-2">
              <span className="text-xl">{office.flag}</span>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{office.city}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{office.type}</p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {/* Address + map buttons */}
            <div className="px-5 py-4">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex-1">
                  <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">{office.address}</p>
                  <div className="mt-3 flex gap-2">
                    <a
                      href={office.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Google Maps
                    </a>
                    <a
                      href={office.wazeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Waze
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Hours */}
            <div className="px-5 py-4">
              <div className="flex items-start gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="flex-1">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Horario de atención</p>
                  <div className="space-y-1">
                    {office.hours.map(h => (
                      <div key={h.day} className="flex justify-between text-sm">
                        <span className="text-slate-600 dark:text-slate-400">{h.day}</span>
                        <span className={`font-medium ${h.time === 'Cerrado' ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                          {h.time}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="px-5 py-4">
              <div className="space-y-2">
                <a
                  href={`tel:${office.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  <Phone className="h-4 w-4 text-slate-400" />
                  {office.phone}
                </a>
                <a
                  href={`mailto:${office.email}`}
                  className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  <Mail className="h-4 w-4 text-slate-400" />
                  {office.email}
                </a>
              </div>
            </div>
          </div>
        </div>
      ))}

      <p className="text-center text-xs text-slate-400 dark:text-slate-600">
        Los horarios están sujetos a cambios en días feriados.
      </p>
    </div>
  )
}
