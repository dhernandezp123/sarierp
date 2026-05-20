'use client'

import { useEffect, useState } from 'react'
import AppLayout from '../../../components/layout/app-layout'
import { supabase } from '../../../lib/supabase/client'
import { useUser } from '../../../hooks/useUser'

export default function CatalogsPage() {
  const { profile } = useUser()

  const [countries, setCountries] = useState<any[]>([])
  const [ports, setPorts] = useState<any[]>([])

  const [countryName, setCountryName] = useState('')
  const [portForm, setPortForm] = useState({
    name: '',
    country_id: '',
    type: 'Puerto',
  })

  useEffect(() => {
    fetchCatalogs()
  }, [])

  const fetchCatalogs = async () => {
    const { data: countriesData } = await supabase
      .from('countries')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true })

    const { data: portsData } = await supabase
      .from('ports')
      .select('*, countries(name)')
      .eq('active', true)
      .order('name', { ascending: true })

    setCountries(countriesData || [])
    setPorts(portsData || [])
  }

  const createCountry = async () => {
    if (!countryName.trim()) return alert('Nombre de país requerido')

    const { error } = await supabase.from('countries').insert({
      name: countryName.trim(),
    })

    if (error) return alert(error.message)

    setCountryName('')
    fetchCatalogs()
  }

  const createPort = async () => {
    if (!portForm.name.trim()) return alert('Nombre de puerto requerido')
    if (!portForm.country_id) return alert('Selecciona un país')

    const { error } = await supabase.from('ports').insert({
      name: portForm.name.trim(),
      country_id: portForm.country_id,
      type: portForm.type,
    })

    if (error) return alert(error.message)

    setPortForm({
      name: '',
      country_id: '',
      type: 'Puerto',
    })

    fetchCatalogs()
  }

  return (
    <AppLayout role={profile?.rol || 'Ventas'}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Catálogos
          </h1>
          <p className="text-slate-500 mt-1">
            Tablas maestras para países, puertos y datos operativos.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Países</h2>

            <div className="flex gap-3 mb-5">
              <input
                className="flex-1 border rounded-xl px-3 py-2"
                placeholder="Nuevo país"
                value={countryName}
                onChange={(e) => setCountryName(e.target.value)}
              />

              <button
                onClick={createCountry}
                className="rounded-xl bg-slate-950 text-white px-5 font-semibold"
              >
                Agregar
              </button>
            </div>

            <div className="space-y-2">
              {countries.map((country) => (
                <div
                  key={country.id}
                  className="flex items-center justify-between rounded-xl border p-3"
                >
                  <span className="font-medium">{country.name}</span>
                  <span className="text-xs text-slate-500">Activo</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Puertos / Ciudades</h2>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <input
                className="border rounded-xl px-3 py-2"
                placeholder="Puerto o ciudad"
                value={portForm.name}
                onChange={(e) =>
                  setPortForm({ ...portForm, name: e.target.value })
                }
              />

              <select
                className="border rounded-xl px-3 py-2"
                value={portForm.country_id}
                onChange={(e) =>
                  setPortForm({ ...portForm, country_id: e.target.value })
                }
              >
                <option value="">País</option>
                {countries.map((country) => (
                  <option key={country.id} value={country.id}>
                    {country.name}
                  </option>
                ))}
              </select>

              <select
                className="border rounded-xl px-3 py-2"
                value={portForm.type}
                onChange={(e) =>
                  setPortForm({ ...portForm, type: e.target.value })
                }
              >
                <option>Puerto</option>
                <option>Ciudad</option>
                <option>Aeropuerto</option>
                <option>Frontera</option>
              </select>
            </div>

            <button
              onClick={createPort}
              className="w-full rounded-xl bg-slate-950 text-white py-3 font-semibold mb-5"
            >
              Agregar Puerto / Ciudad
            </button>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-950 text-white">
                  <tr>
                    <th className="p-3 text-left">Nombre</th>
                    <th className="p-3 text-left">País</th>
                    <th className="p-3 text-left">Tipo</th>
                  </tr>
                </thead>

                <tbody>
                  {ports.map((port) => (
                    <tr key={port.id} className="border-b hover:bg-slate-50">
                      <td className="p-3 font-semibold">{port.name}</td>
                      <td className="p-3">{port.countries?.name || 'N/A'}</td>
                      <td className="p-3">{port.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}