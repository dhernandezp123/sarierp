'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
} from 'lucide-react'

import { supabase } from '@/src/lib/supabase/client'
import {
  COMPANY_BRANDING_SELECT,
  type CompanyBranding,
  getCompanyAddressLines,
  normalizeCompanyBranding,
} from '@/src/lib/company-branding'

type Office = {
  city: string
  countryCode: string
  type: string
  address: string
  mapsUrl: string
  wazeUrl: string
  hours: Array<{ day: string; time: string }>
  phone: string | null
  email: string | null
}

const buildMapUrl = (address: string) =>
  `https://maps.google.com/?q=${encodeURIComponent(address.replace(/\n/g, ' '))}`

const buildWazeUrl = (address: string) =>
  `https://waze.com/ul?q=${encodeURIComponent(address.replace(/\n/g, ' '))}`

const buildOffices = (company: CompanyBranding): Office[] => {
  const offices: Office[] = []
  const miamiAddressLines = [
    company.miami_consignee,
    company.miami_address_line,
    [company.miami_city, company.miami_state, company.miami_zip]
      .filter(Boolean)
      .join(', '),
    company.miami_country,
  ].filter((line): line is string => Boolean(line))
  const miamiAddress = miamiAddressLines.join('\n')

  if (company.miami_address_line) {
    offices.push({
      city: `${company.miami_city || 'Miami'}, ${company.miami_state || 'FL'}`,
      countryCode: 'US',
      type: 'Bodega de recepcion',
      address: miamiAddress,
      mapsUrl: buildMapUrl(miamiAddress),
      wazeUrl: buildWazeUrl(miamiAddress),
      hours: [
        { day: 'Lunes - Viernes', time: '8:00 AM - 5:00 PM EST' },
        { day: 'Sabado', time: '9:00 AM - 1:00 PM EST' },
        { day: 'Domingo', time: 'Cerrado' },
      ],
      phone: company.miami_phone,
      email: company.email,
    })
  }

  const hondurasAddress = getCompanyAddressLines(company).join('\n')

  if (company.address) {
    offices.push({
      city: [company.city, company.country].filter(Boolean).join(', '),
      countryCode: 'HN',
      type: 'Oficina principal',
      address: hondurasAddress,
      mapsUrl: buildMapUrl(hondurasAddress),
      wazeUrl: buildWazeUrl(hondurasAddress),
      hours: [
        { day: 'Lunes - Viernes', time: '8:00 AM - 5:00 PM HN' },
        { day: 'Sabado', time: '9:00 AM - 12:00 PM HN' },
        { day: 'Domingo', time: 'Cerrado' },
      ],
      phone: company.phone,
      email: company.email,
    })
  }

  return offices
}

export default function ContactoPage() {
  const router = useRouter()
  const [offices, setOffices] = useState<Office[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadCompanySettings()
  }, [])

  const loadCompanySettings = async () => {
    const { data } = await supabase
      .from('company_settings')
      .select(COMPANY_BRANDING_SELECT)
      .limit(1)
      .maybeSingle()

    setOffices(buildOffices(normalizeCompanyBranding(data)))
    setLoading(false)
  }

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
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            Contactanos
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nuestras oficinas y horarios de atencion
          </p>
        </div>
      </div>

      {loading && (
        <div className="space-y-4">
          {[...Array(2)].map((_, index) => (
            <div
              key={index}
              className="h-48 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800"
            />
          ))}
        </div>
      )}

      {!loading && offices.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          La informacion de contacto aun no esta configurada.
        </div>
      )}

      {!loading &&
        offices.map((office) => (
          <div
            key={`${office.countryCode}-${office.city}`}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  {office.countryCode}
                </span>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {office.city}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {office.type}
                  </p>
                </div>
              </div>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <div className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="flex-1">
                    <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
                      {office.address}
                    </p>
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

              <div className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="flex-1">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      Horario de atencion
                    </p>
                    <div className="space-y-1">
                      {office.hours.map((hour) => (
                        <div
                          key={hour.day}
                          className="flex justify-between text-sm"
                        >
                          <span className="text-slate-600 dark:text-slate-400">
                            {hour.day}
                          </span>
                          <span
                            className={`font-medium ${
                              hour.time === 'Cerrado'
                                ? 'text-slate-400 dark:text-slate-500'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {hour.time}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 py-4">
                <div className="space-y-2">
                  {office.phone && (
                    <a
                      href={`tel:${office.phone.replace(/\s/g, '')}`}
                      className="flex items-center gap-3 text-sm text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
                    >
                      <Phone className="h-4 w-4 text-slate-400" />
                      {office.phone}
                    </a>
                  )}
                  {office.email && (
                    <a
                      href={`mailto:${office.email}`}
                      className="flex items-center gap-3 text-sm text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400"
                    >
                      <Mail className="h-4 w-4 text-slate-400" />
                      {office.email}
                    </a>
                  )}
                  {!office.phone && !office.email && (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Contacto pendiente de configurar.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

      <p className="text-center text-xs text-slate-400 dark:text-slate-600">
        Los horarios estan sujetos a cambios en dias feriados.
      </p>
    </div>
  )
}
