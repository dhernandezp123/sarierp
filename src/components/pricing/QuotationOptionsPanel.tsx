'use client'

import { useState } from 'react'
import {
  ArrowUp,
  FileText,
  Pencil,
  RefreshCw,
  Save,
  Star,
  Trash2,
  X,
} from 'lucide-react'

import type { QuotationCommercialOption } from '@/src/lib/quotation-options'
import { cn } from '@/src/lib/utils'
import { primaryButtonClass, secondaryButtonClass } from '@/src/lib/ui-classes'
import { ConfirmDialog } from '@/src/components/ui/ConfirmDialog'

const formatDate = (value?: string | null) => {
  if (!value) return 'N/A'
  const [year, month, day] = value.split('T')[0].split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

const statusClass: Record<QuotationCommercialOption['status'], string> = {
  Borrador: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
  Ofrecida: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200',
  Aceptada: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  'No seleccionada': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  Retirada: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200',
}

type Props = {
  options: QuotationCommercialOption[]
  disabled?: boolean
  saving?: boolean
  formatCurrency: (value: number) => string
  onSave: (input: {
    label: string
    isRecommended: boolean
    clientNotes: string
    optionId?: string
  }) => Promise<boolean>
  onEdit: (input: {
    optionId: string
    label: string
    isRecommended: boolean
    clientNotes: string
  }) => Promise<boolean>
  onDelete: (optionId: string) => Promise<void>
  onViewSource: (agentQuoteId: string) => void
  onPreview: () => void
}

export function QuotationOptionsPanel({
  options,
  disabled = false,
  saving = false,
  formatCurrency,
  onSave,
  onEdit,
  onDelete,
  onViewSource,
  onPreview,
}: Props) {
  const [label, setLabel] = useState('')
  const [isRecommended, setIsRecommended] = useState(false)
  const [clientNotes, setClientNotes] = useState('')
  const [editingOption, setEditingOption] = useState<{
    optionId: string
    label: string
    isRecommended: boolean
    clientNotes: string
  } | null>(null)
  const [optionToRefresh, setOptionToRefresh] =
    useState<QuotationCommercialOption | null>(null)
  const [optionToDelete, setOptionToDelete] =
    useState<QuotationCommercialOption | null>(null)

  const handleCreate = async () => {
    const saved = await onSave({ label, isRecommended, clientNotes })
    if (!saved) return
    setLabel('')
    setIsRecommended(false)
    setClientNotes('')
  }

  const beginEditing = (option: QuotationCommercialOption) => {
    setEditingOption({
      optionId: option.id,
      label: option.label,
      isRecommended: option.is_recommended,
      clientNotes: option.client_notes || '',
    })
  }

  const saveOptionDetails = async () => {
    if (!editingOption) return
    const saved = await onEdit(editingOption)
    if (saved) setEditingOption(null)
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-[#0b1220]">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Opciones comerciales para el cliente
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Ajusta la tarifa y sus cargos en el pricing actual, luego guarda una
            fotografía. Puedes cambiar de naviera y repetir el proceso sin perder
            las opciones anteriores.
          </p>
        </div>

        {options.length > 0 && (
          <button
            type="button"
            onClick={onPreview}
            className={cn(secondaryButtonClass, 'inline-flex items-center gap-2')}
          >
            <FileText className="h-4 w-4" />
            Previsualizar opciones
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end dark:border-slate-700 dark:bg-slate-900/50">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Nombre opcional
          </span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={disabled || saving}
            placeholder={`Ej: Opción ${String.fromCharCode(65 + Math.min(options.length, 25))} - salida rápida`}
            className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </label>

        <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
          <input
            type="checkbox"
            checked={isRecommended}
            onChange={(event) => setIsRecommended(event.target.checked)}
            disabled={disabled || saving}
            className="h-4 w-4 rounded border-slate-300"
          />
          Recomendada
        </label>

        <label className="block md:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Notas de esta opción para el cliente
          </span>
          <textarea
            value={clientNotes}
            onChange={(event) => setClientNotes(event.target.value)}
            disabled={disabled || saving}
            maxLength={4000}
            rows={3}
            placeholder="Ej: Sujeta a espacio; salida semanal; incluye 14 días libres."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
          <span className="mt-1 block text-right text-[11px] text-slate-400">
            {clientNotes.length}/4000
          </span>
        </label>

        <button
          type="button"
          onClick={handleCreate}
          disabled={disabled || saving}
          className={cn(
            primaryButtonClass,
            'inline-flex h-10 items-center justify-center gap-2 md:col-span-2 md:justify-self-end'
          )}
        >
          <Save className="h-4 w-4" />
          {saving ? 'Guardando...' : 'Guardar pricing actual'}
        </button>
      </div>

      {options.length === 0 ? (
        <div className="mt-5 rounded-xl border border-slate-200 p-5 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Aún no hay opciones guardadas. La cotización continuará funcionando con
          el flujo de una sola tarifa mientras esta lista esté vacía.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {options.map((option) => (
            <article
              key={option.id}
              className={cn(
                'rounded-xl border p-4',
                option.status === 'Aceptada'
                  ? 'border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20'
                  : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/50'
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white dark:bg-white dark:text-slate-900">
                      Opción {option.option_code}
                    </span>
                    <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', statusClass[option.status])}>
                      {option.status}
                    </span>
                    {option.is_recommended && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">
                        <Star className="h-3 w-3 fill-current" /> Recomendada
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-semibold text-slate-900 dark:text-white">
                    {option.label}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {option.carrier || 'Sin naviera'} · {option.transit_time || 'Tránsito N/A'} · ETD {formatDate(option.etd)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Agente/Proveedor:{' '}
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {option.agent_name || 'No especificado'}
                    </span>
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Total cliente</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {option.currency || 'USD'} {formatCurrency(Number(option.grand_total || 0))}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Costo</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    {option.currency} {formatCurrency(Number(option.cost_total || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Venta sin ISV</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    {option.currency} {formatCurrency(Number(option.sale_subtotal || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Profit</p>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {option.currency} {formatCurrency(Number(option.profit_amount || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">GP</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    {Number(option.gp_percentage || 0).toFixed(2)}%
                  </p>
                </div>
              </div>

              {editingOption?.optionId === option.id ? (
                <div className="mt-4 space-y-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900/60 dark:bg-blue-950/20">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Nombre de la opción
                    </span>
                    <input
                      value={editingOption.label}
                      onChange={(event) =>
                        setEditingOption({ ...editingOption, label: event.target.value })
                      }
                      disabled={disabled || saving}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Notas de esta opción para el cliente
                    </span>
                    <textarea
                      value={editingOption.clientNotes}
                      onChange={(event) =>
                        setEditingOption({
                          ...editingOption,
                          clientNotes: event.target.value,
                        })
                      }
                      disabled={disabled || saving}
                      maxLength={4000}
                      rows={4}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                    <span className="mt-1 block text-right text-[11px] text-slate-400">
                      {editingOption.clientNotes.length}/4000
                    </span>
                  </label>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={editingOption.isRecommended}
                        onChange={(event) =>
                          setEditingOption({
                            ...editingOption,
                            isRecommended: event.target.checked,
                          })
                        }
                        disabled={disabled || saving}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Recomendada
                    </label>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingOption(null)}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
                      >
                        <X className="h-3.5 w-3.5" /> Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={saveOptionDetails}
                        disabled={disabled || saving}
                        className={cn(primaryButtonClass, 'inline-flex items-center gap-1.5 px-3 py-2 text-xs')}
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? 'Guardando...' : 'Guardar cambios'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : option.client_notes?.trim() ? (
                <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-900">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Notas para esta opción
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                    {option.client_notes}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => onViewSource(option.agent_quote_id)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950/30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  Ver tarifa de origen
                </button>

                {option.status === 'Borrador' && editingOption?.optionId !== option.id && (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => beginEditing(option)}
                      disabled={disabled || saving}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar opción
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptionToRefresh(option)}
                      disabled={disabled || saving}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reemplazar con pricing actual
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptionToDelete(option)}
                      disabled={disabled || saving}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Eliminar
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(optionToRefresh)}
        onOpenChange={(open) => !open && setOptionToRefresh(null)}
        title="¿Reemplazar esta opción?"
        description={`Se sustituirá el snapshot de la opción ${optionToRefresh?.option_code || ''} con la tarifa y los cargos visibles actualmente.`}
        confirmLabel="Reemplazar snapshot"
        onConfirm={async () => {
          if (!optionToRefresh) return
          const saved = await onSave({
            optionId: optionToRefresh.id,
            label: optionToRefresh.label,
            isRecommended: optionToRefresh.is_recommended,
            clientNotes: optionToRefresh.client_notes || '',
          })
          if (saved) setOptionToRefresh(null)
        }}
      />

      <ConfirmDialog
        open={Boolean(optionToDelete)}
        onOpenChange={(open) => !open && setOptionToDelete(null)}
        title="¿Eliminar opción en borrador?"
        description={`Se eliminará la opción ${optionToDelete?.option_code || ''}. El pricing actual no será modificado.`}
        confirmLabel="Eliminar opción"
        danger
        onConfirm={async () => {
          if (!optionToDelete) return
          await onDelete(optionToDelete.id)
          setOptionToDelete(null)
        }}
      />
    </section>
  )
}
