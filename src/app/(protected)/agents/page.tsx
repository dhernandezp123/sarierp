'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase/client'

export default function AgentsPage() {
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [form, setForm] = useState({
    name: '',
    type: 'Agente',
    country: '',
    city: '',
    contact_name: '',
    email: '',
    phone: '',
    profit_per_container: '',
    mbl_fee: '',
    currency: 'USD',
    notes: '',
  })

  useEffect(() => {
    fetchAgents()
  }, [])

  const fetchAgents = async () => {
    const { data } = await supabase
      .from('agents')
      .select('*')
      .order('created_at', { ascending: false })

    setAgents(data || [])
    setLoading(false)
  }

  const handleCreateAgent = async () => {
    if (!form.name.trim()) {
      alert('El nombre del agente/proveedor es obligatorio')
      return
    }

    const { error } = await supabase.from('agents').insert({
      ...form,
      profit_per_container: Number(form.profit_per_container || 0),
      mbl_fee: Number(form.mbl_fee || 0),
    })

    if (error) {
      alert(error.message)
      return
    }

    setForm({
      name: '',
      type: 'Agente',
      country: '',
      city: '',
      contact_name: '',
      email: '',
      phone: '',
      profit_per_container: '',
      mbl_fee: '',
      currency: 'USD',
      notes: '',
    })

    fetchAgents()
  }

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Agentes / Proveedores
          </h1>
          <p className="text-slate-500 mt-1">
            Catálogo base para pricing, márgenes y tarifas por proveedor.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-1 rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">
              Nuevo Agente
            </h2>

            <div className="space-y-3">
              <input
                className="w-full border rounded-xl px-3 py-2"
                placeholder="Nombre agente/proveedor"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />

              <select
                className="w-full border rounded-xl px-3 py-2"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option>Agente</option>
                <option>Naviera</option>
                <option>Transportista</option>
                <option>Aduana</option>
                <option>Almacén</option>
                <option>Otro</option>
              </select>

              <div className="grid grid-cols-2 gap-3">
                <input
                  className="border rounded-xl px-3 py-2"
                  placeholder="País"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                />

                <input
                  className="border rounded-xl px-3 py-2"
                  placeholder="Ciudad"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </div>

              <input
                className="w-full border rounded-xl px-3 py-2"
                placeholder="Contacto"
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              />

              <input
                className="w-full border rounded-xl px-3 py-2"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />

              <input
                className="w-full border rounded-xl px-3 py-2"
                placeholder="Teléfono"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />

              <div className="grid grid-cols-3 gap-3">
                <input
                  className="border rounded-xl px-3 py-2"
                  placeholder="Profit/Cont."
                  value={form.profit_per_container}
                  onChange={(e) =>
                    setForm({ ...form, profit_per_container: e.target.value })
                  }
                />

                <input
                  className="border rounded-xl px-3 py-2"
                  placeholder="MBL Fee"
                  value={form.mbl_fee}
                  onChange={(e) => setForm({ ...form, mbl_fee: e.target.value })}
                />

                <select
                  className="border rounded-xl px-3 py-2"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                >
                  <option>USD</option>
                  <option>HNL</option>
                  <option>MXN</option>
                </select>
              </div>

              <textarea
                className="w-full border rounded-xl px-3 py-2"
                placeholder="Notas"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />

              <button
                onClick={handleCreateAgent}
                className="w-full rounded-xl bg-slate-950 text-white py-3 font-semibold hover:bg-slate-800 transition"
              >
                Guardar Agente
              </button>
            </div>
          </div>

          <div className="col-span-2 rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">
              Agentes Registrados
            </h2>

            {loading ? (
              <p className="text-slate-500">Cargando...</p>
            ) : agents.length === 0 ? (
              <p className="text-slate-500">No hay agentes registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950 text-white">
                    <tr>
                      <th className="p-3 text-left">Nombre</th>
                      <th className="p-3 text-left">Tipo</th>
                      <th className="p-3 text-left">País</th>
                      <th className="p-3 text-right">Profit/Cont.</th>
                      <th className="p-3 text-right">MBL</th>
                      <th className="p-3 text-left">Moneda</th>
                    </tr>
                  </thead>

                  <tbody>
                    {agents.map((agent) => (
                      <tr key={agent.id} className="border-b hover:bg-slate-50">
                        <td className="p-3 font-semibold">{agent.name}</td>
                        <td className="p-3">{agent.type}</td>
                        <td className="p-3">{agent.country || 'N/A'}</td>
                        <td className="p-3 text-right">
                          {Number(agent.profit_per_container || 0).toFixed(2)}
                        </td>
                        <td className="p-3 text-right">
                          {Number(agent.mbl_fee || 0).toFixed(2)}
                        </td>
                        <td className="p-3">{agent.currency || 'USD'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
