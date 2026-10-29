'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/src/lib/supabase/client'
import { cardClass, primaryButtonClass } from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { EmptyState } from '@/src/components/ui/EmptyState'
import { Pagination } from '@/src/components/ui/Pagination'
import { readAllReportRows } from '@/src/lib/report-query'
import { useSupplierTypes } from '@/src/hooks/useSupplierTypes'
import { SupplierTypeSelect } from '@/src/components/suppliers/SupplierTypeSelect'
import { FormField } from '@/src/components/ui/form-field'
import { NewSupplierDialog } from '@/src/components/suppliers/NewSupplierDialog'


type Proveedor = {
  id: string
  nombre: string
  tipo: string
  contacto: string | null
  email: string | null
  moneda: string
  terminos_pago: number
  is_active: boolean
  pais: string | null
  agents: { name: string } | null
}


export default function SuppliersPage() {
  const catalog = useSupplierTypes()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [newSupplierOpen, setNewSupplierOpen] = useState(false)
  const newSupplierTrigger = useRef<HTMLElement|null>(null)
  function openNewSupplier(event?:React.MouseEvent<HTMLButtonElement>){
    if(event?.currentTarget)newSupplierTrigger.current=event.currentTarget
    else if(typeof document!=='undefined')newSupplierTrigger.current=document.activeElement instanceof HTMLElement?document.activeElement:null
    setNewSupplierOpen(true)
  }

  const fetchProveedores = async () => {
    setLoading(true)
    try {
      const data = await readAllReportRows((from, to) => supabase
        .from('proveedores')
        .select('id, nombre, tipo, contacto, email, moneda, terminos_pago, is_active, pais, agents(name)')
        .order('nombre', { ascending: true }).order('id').range(from, to), { label: 'proveedores' })
      setProveedores(data as unknown as Proveedor[])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'No se pudieron cargar los proveedores.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProveedores() }, [])

  const filtered = proveedores.filter((p) => {
    const q = search.toLowerCase()
    const matchSearch = p.nombre.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q) || p.contacto?.toLowerCase().includes(q)
    const matchTipo = tipoFilter === '' || p.tipo === tipoFilter
    const matchActive = showInactive ? true : p.is_active
    return matchSearch && matchTipo && matchActive
  })

  const typeMetrics = catalog.types.map(t=>({...t,count:proveedores.filter(p=>p.is_active&&p.tipo===t.code).length})).filter(t=>t.active||t.count).sort((a,b)=>b.count-a.count||a.sort_order-b.sort_order).slice(0,3)
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)))
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Proveedores</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Agentes, carriers, aduanales y otros proveedores de servicio.
          </p>
        </div>
        <div className="flex flex-wrap gap-2"><Link href="/suppliers/types" className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium">Tipos de proveedores</Link><button type="button" onClick={openNewSupplier} className={primaryButtonClass}>
          <Plus className="h-4 w-4" />
          Nuevo proveedor
        </button></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total activos', value: proveedores.filter(p=>p.is_active).length, color: 'text-slate-900 dark:text-white' },
          ...typeMetrics.map(t=>({label:t.label,value:t.count,color:'text-[#B3282D] dark:text-rose-300'})),
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
            <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
            <p className={`mt-1 text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por nombre, email..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </div>
        <FormField as="div" label="Tipo de proveedor" className="w-full max-w-md"><SupplierTypeSelect types={catalog.types} value={tipoFilter} onChange={value=>{setTipoFilter(value);setPage(1)}} loading={catalog.loading} error={catalog.error} filter/></FormField>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => { setShowInactive(e.target.checked); setPage(1) }}
            className="rounded"
          />
          Mostrar inactivos
        </label>
      </div>

      <div className={cardClass}>
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title="No hay proveedores"
            description="Agrega un agente, carrier u otro proveedor para registrar cuentas por pagar."
            action={{ label: 'Nuevo proveedor', onClick: openNewSupplier }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  {['Proveedor', 'Tipo', 'Contacto', 'Credito', 'Moneda', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">{p.nombre}</div>
                      {p.pais && <div className="text-xs text-slate-400">{p.pais}</div>}
                      {p.agents && <div className="text-xs text-blue-500">Agente ERP: {(p.agents as any).name}</div>}
                      {!p.is_active && <span className="text-xs italic text-slate-400">Inactivo</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300`}>
                        {catalog.label(p.tipo)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700 dark:text-slate-300">{p.contacto || '-'}</div>
                      <div className="text-xs text-slate-400">{p.email || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      {p.terminos_pago} dias
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.moneda}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/suppliers/${p.id}`}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Ver detalle
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && <Pagination page={currentPage} pageSize={pageSize} total={filtered.length}
          pageSizeOptions={[25, 50, 75, 100]} onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} />}
      </div>
      <NewSupplierDialog open={newSupplierOpen} onOpenChange={setNewSupplierOpen} returnFocusRef={newSupplierTrigger} onCreated={()=>{setPage(1);void fetchProveedores()}}/>
    </div>
  )
}
