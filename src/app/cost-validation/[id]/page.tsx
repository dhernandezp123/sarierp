'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { supabase } from '../../../lib/supabase/client'
import AppLayout from '../../../components/layout/app-layout'
import { useUser } from '../../../hooks/useUser'

export default function CostValidationDetailPage() {
  const { profile } = useUser()
  const params = useParams()
  const router = useRouter()

  const [quotation, setQuotation] = useState<any>(null)
  const [pricingItems, setPricingItems] = useState<any[]>([])
  const [invoiceItems, setInvoiceItems] = useState<any[]>([])
  const [taxRates, setTaxRates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [invoiceForm, setInvoiceForm] = useState({
    supplier: '',
    invoice_number: '',
    description: '',
    quantity: '1',
    unit_cost: '',
    currency: 'USD',
    tax_rate_id: '',
    invoice_date: '',
    is_taxable: false,
    notes: '',
  })

  useEffect(() => {
    if (params.id) {
      fetchData()
      fetchTaxRates()
    }
  }, [params.id])

  const fetchData = async () => {
    const quotationId = params.id as string

    const { data: quotationData, error: quotationError } = await supabase
      .from('quotations')
      .select(`
        *,
        clientes (
          nombre,
          codigo_cliente
        )
      `)
      .eq('id', quotationId)
      .single()

    if (quotationError) {
      alert(quotationError.message)
      return
    }

    const { data: pricingData, error: pricingError } = await supabase
      .from('pricing_items')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true })

    if (pricingError) {
      alert(pricingError.message)
      return
    }

    const { data: invoiceData, error: invoiceError } = await supabase
      .from('provider_invoice_items')
      .select('*')
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true })

    if (invoiceError) {
      alert(invoiceError.message)
      return
    }

    setQuotation(quotationData)
    setPricingItems(pricingData || [])
    setInvoiceItems(invoiceData || [])
    setLoading(false)
  }

  const fetchTaxRates = async () => {
    const { data, error } = await supabase
      .from('tax_rates')
      .select('*')
      .eq('is_active', true)
      .order('country', { ascending: true })

    if (error) {
      alert(error.message)
      return
    }

    setTaxRates(data || [])
  }

  const quotedCost = pricingItems.reduce(
    (sum, item) =>
      sum + Number(item.cost_amount || 0) * Number(item.quantity || 1),
    0
  )

  const quotedSale = pricingItems.reduce(
    (sum, item) =>
      sum + Number(item.sale_amount || 0) * Number(item.quantity || 1),
    0
  )

  const realCost = invoiceItems.reduce((sum, item) => {
    return (
      sum +
      Number(item.total_cost || 0) +
      Number(item.tax_amount || 0)
    )
  }, 0)

  const expectedProfit = quotedSale - quotedCost
  const realProfit = quotedSale - realCost
  const costDifference = realCost - quotedCost
  const variancePercentage =
    quotedCost > 0 ? (costDifference / quotedCost) * 100 : 0

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })

  const financialStatus =
    realProfit < 0
      ? {
          label: 'Pérdida detectada',
          className: 'bg-red-100 text-red-700 border-red-200',
        }
      : variancePercentage > 15
      ? {
          label: 'Variación alta',
          className: 'bg-red-100 text-red-700 border-red-200',
        }
      : variancePercentage > 5
      ? {
          label: 'Variación moderada',
          className: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        }
      : {
          label: 'Dentro de margen',
          className: 'bg-green-100 text-green-700 border-green-200',
        }

  const normalizeDescription = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')

  const pricingByDescription = pricingItems.reduce((acc: any, item) => {
    const key = normalizeDescription(item.description || 'Sin descripción')

    const total =
      Number(item.cost_amount || 0) * Number(item.quantity || 1)

    acc[key] = {
      description: item.description || 'Sin descripción',
      quoted: (acc[key]?.quoted || 0) + total,
      real: acc[key]?.real || 0,
    }

    return acc
  }, {})

  invoiceItems.forEach((item) => {
    const key = normalizeDescription(item.description || 'Sin descripción')

    const total =
      Number(item.total_cost || 0) + Number(item.tax_amount || 0)

    if (!pricingByDescription[key]) {
      pricingByDescription[key] = {
        description: item.description || 'Sin descripción',
        quoted: 0,
        real: 0,
      }
    }

    pricingByDescription[key].real += total
  })

  const varianceRows = Object.values(pricingByDescription).map((row: any) => {
    const variance = row.real - row.quoted

    const variancePercentage =
      row.quoted > 0 ? (variance / row.quoted) * 100 : 0

    return {
      ...row,
      variance,
      variancePercentage,
    }
  })

  const handleInvoiceChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target

    setInvoiceForm({
      ...invoiceForm,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : value,
    })
  }

  const saveInvoiceItem = async () => {
    if (!invoiceForm.description.trim()) {
      alert('Debes ingresar una descripción del costo real.')
      return
    }

    const quantity = Number(invoiceForm.quantity || 1)
    const unitCost = Number(invoiceForm.unit_cost || 0)
    const totalCost = quantity * unitCost
    const selectedTaxRate = taxRates.find(
      (tax) => tax.id === invoiceForm.tax_rate_id
    )

    const taxPercentage = selectedTaxRate
      ? Number(selectedTaxRate.percentage || 0)
      : 0

    const taxAmount =
      totalCost * (taxPercentage / 100)

    const { error } = await supabase.from('provider_invoice_items').insert([
      {
        quotation_id: params.id as string,
        supplier: invoiceForm.supplier || null,
        invoice_number: invoiceForm.invoice_number || null,
        description: invoiceForm.description.trim(),
        quantity,
        unit_cost: unitCost,
        total_cost: totalCost,
        currency: invoiceForm.currency || 'USD',
        tax_rate_id: invoiceForm.tax_rate_id || null,
        tax_percentage_snapshot: taxPercentage,
        tax_amount: taxAmount,
        invoice_date: invoiceForm.invoice_date || null,
        is_taxable: invoiceForm.is_taxable,
        notes: invoiceForm.notes || null,
        created_by: profile?.id,
      },
    ])

    if (error) {
      alert(error.message)
      return
    }

    setInvoiceForm({
      supplier: '',
      invoice_number: '',
      description: '',
      quantity: '1',
      unit_cost: '',
      currency: 'USD',
      tax_rate_id: '',
      invoice_date: '',
      is_taxable: false,
      notes: '',
    })

    await fetchData()
  }

  const deleteInvoiceItem = async (id: string) => {
    const confirmed = confirm(
      '¿Eliminar este costo real proveedor?'
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('provider_invoice_items')
      .delete()
      .eq('id', id)

    if (error) {
      alert(error.message)
      return
    }

    await fetchData()
  }

  const markAsFinanciallyValidated = async () => {
    const confirmed = confirm(
      '¿Marcar esta cotización como financieramente validada?'
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('quotations')
      .update({
        financial_validation_status: 'Validado',
      })
      .eq('id', params.id as string)

    if (error) {
      alert(error.message)
      return
    }

    alert('Validación financiera completada')
    await fetchData()
  }

  if (loading) {
    return <div className="p-8">Cargando validación...</div>
  }

  return (
    <AppLayout role={profile?.rol || 'Contabilidad'}>
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => router.push('/cost-validation')}
          className="rounded-xl border px-4 py-2 font-semibold"
        >
          Volver a Validación
        </button>

        <div>
          <h1 className="text-4xl font-bold">
            Validación de Costos
          </h1>

          <p className="text-gray-500 mt-2">
            {quotation?.quotation_number} —{' '}
            {quotation?.clientes?.nombre || 'Sin cliente'}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div
              className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold ${financialStatus.className}`}
            >
              {financialStatus.label}
            </div>

            <button
              type="button"
              onClick={markAsFinanciallyValidated}
              className="rounded-xl bg-black px-5 py-3 text-white font-semibold"
            >
              Marcar como Validado
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">Costo Cotizado</p>
            <p className="text-2xl font-bold">
              USD {formatCurrency(quotedCost)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">Costo Real</p>
            <p className="text-2xl font-bold">
              USD {formatCurrency(realCost)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">Diferencia</p>
            <p
              className={`text-2xl font-bold ${
                costDifference > 0 ? 'text-red-600' : 'text-green-600'
              }`}
            >
              USD {formatCurrency(costDifference)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">Variación %</p>
            <p
              className={`text-2xl font-bold ${
                variancePercentage > 0 ? 'text-red-600' : 'text-green-600'
              }`}
            >
              {variancePercentage.toFixed(2)}%
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">Profit Esperado</p>
            <p className="text-2xl font-bold text-green-600">
              USD {formatCurrency(expectedProfit)}
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <p className="text-sm text-gray-500">Profit Real</p>
            <p
              className={`text-2xl font-bold ${
                realProfit >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              USD {formatCurrency(realProfit)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold mb-4">
              Costos Cotizados
            </h2>

            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-white">
                <tr>
                  <th className="p-3 text-left">Concepto</th>
                  <th className="p-3 text-right">QTY</th>
                  <th className="p-3 text-right">Costo Unit.</th>
                  <th className="p-3 text-right">Total</th>
                </tr>
              </thead>

              <tbody>
                {pricingItems.map((item) => {
                  const qty = Number(item.quantity || 1)
                  const cost = Number(item.cost_amount || 0)
                  const total = qty * cost

                  return (
                    <tr key={item.id} className="border-b">
                      <td className="p-3">{item.description}</td>
                      <td className="p-3 text-right">{qty}</td>
                      <td className="p-3 text-right">
                        USD {formatCurrency(cost)}
                      </td>
                      <td className="p-3 text-right font-semibold">
                        USD {formatCurrency(total)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold mb-4">
              Costos Reales Proveedor
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
              <input
                name="supplier"
                placeholder="Proveedor"
                value={invoiceForm.supplier}
                onChange={handleInvoiceChange}
                className="border rounded-xl px-3 py-2"
              />

              <input
                name="invoice_number"
                placeholder="No. factura"
                value={invoiceForm.invoice_number}
                onChange={handleInvoiceChange}
                className="border rounded-xl px-3 py-2"
              />

              <input
                name="description"
                placeholder="Descripción del cargo"
                value={invoiceForm.description}
                onChange={handleInvoiceChange}
                className="border rounded-xl px-3 py-2 md:col-span-2"
              />

              <input
                name="quantity"
                type="number"
                placeholder="Cantidad"
                value={invoiceForm.quantity}
                onChange={handleInvoiceChange}
                className="border rounded-xl px-3 py-2"
              />

              <input
                name="unit_cost"
                type="number"
                placeholder="Costo unitario"
                value={invoiceForm.unit_cost}
                onChange={handleInvoiceChange}
                className="border rounded-xl px-3 py-2"
              />

              <select
                name="currency"
                value={invoiceForm.currency}
                onChange={handleInvoiceChange}
                className="border rounded-xl px-3 py-2"
              >
                <option value="USD">USD</option>
                <option value="HNL">HNL</option>
              </select>

              <select
                name="tax_rate_id"
                value={invoiceForm.tax_rate_id}
                onChange={handleInvoiceChange}
                className="border rounded-xl px-3 py-2"
              >
                <option value="">
                  Sin impuesto
                </option>

                {taxRates.map((tax) => (
                  <option key={tax.id} value={tax.id}>
                    {tax.country} — {tax.tax_name}
                  </option>
                ))}
              </select>

              <input
                name="invoice_date"
                type="date"
                value={invoiceForm.invoice_date}
                onChange={handleInvoiceChange}
                className="border rounded-xl px-3 py-2"
              />

              <label className="flex items-center gap-2 border rounded-xl px-3 py-2">
                <input
                  type="checkbox"
                  name="is_taxable"
                  checked={invoiceForm.is_taxable}
                  onChange={handleInvoiceChange}
                />

                Gravable ISV 15%
              </label>

              <textarea
                name="notes"
                placeholder="Notas"
                value={invoiceForm.notes}
                onChange={handleInvoiceChange}
                className="border rounded-xl px-3 py-2 md:col-span-2"
              />

              <button
                type="button"
                onClick={saveInvoiceItem}
                className="rounded-xl bg-black px-5 py-3 text-white font-semibold md:col-span-2"
              >
                Agregar Costo Real
              </button>
            </div>

            {invoiceItems.length === 0 ? (
              <p className="text-gray-500">
                No hay costos reales registrados todavía.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="p-3 text-left">Factura</th>
                    <th className="p-3 text-left">Concepto</th>
                    <th className="p-3 text-right">QTY</th>
                    <th className="p-3 text-right">Costo Unit.</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Impuesto</th>
                    <th className="p-3 text-right">Total + Imp.</th>
                    <th className="p-3 text-right">Acción</th>
                  </tr>
                </thead>

                <tbody>
                  {invoiceItems.map((item) => {
                    const baseTotal = Number(item.total_cost || 0)
                    const taxAmount = Number(item.tax_amount || 0)
                    const totalWithTax = baseTotal + taxAmount

                    return (
                      <tr key={item.id} className="border-b">
                        <td className="p-3">
                          {item.invoice_number || 'N/A'}
                        </td>
                        <td className="p-3">{item.description}</td>
                        <td className="p-3 text-right">
                          {item.quantity}
                        </td>
                        <td className="p-3 text-right">
                          USD {formatCurrency(Number(item.unit_cost || 0))}
                        </td>
                        <td className="p-3 text-right font-semibold">
                          USD {formatCurrency(baseTotal)}
                        </td>
                        <td className="p-3 text-right">
                          {item.tax_percentage_snapshot
                            ? `${Number(item.tax_percentage_snapshot).toFixed(2)}%`
                            : '0.00%'}
                        </td>
                        <td className="p-3 text-right font-semibold">
                          USD {formatCurrency(totalWithTax)}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => deleteInvoiceItem(item.id)}
                            className="rounded-lg border border-red-200 px-3 py-2 text-red-600 hover:bg-red-50"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6">
          <h2 className="text-xl font-bold mb-4">
            Análisis de Variación
          </h2>

          {varianceRows.length === 0 ? (
            <p className="text-gray-500">
              No hay datos suficientes para analizar variaciones.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-slate-900 text-white">
                  <tr>
                    <th className="p-3 text-left">Concepto</th>
                    <th className="p-3 text-right">Cotizado</th>
                    <th className="p-3 text-right">Real</th>
                    <th className="p-3 text-right">Variación</th>
                    <th className="p-3 text-right">%</th>
                  </tr>
                </thead>

                <tbody>
                  {varianceRows.map((row: any, index: number) => (
                    <tr
                      key={index}
                      className={`border-b ${
                        row.variance > 0
                          ? 'bg-red-50'
                          : row.variance < 0
                          ? 'bg-green-50'
                          : ''
                      }`}
                    >
                      <td className="p-3 font-medium">
                        {row.description}
                      </td>

                      <td className="p-3 text-right">
                        USD {formatCurrency(row.quoted)}
                      </td>

                      <td className="p-3 text-right">
                        USD {formatCurrency(row.real)}
                      </td>

                      <td
                        className={`p-3 text-right font-semibold ${
                          row.variance > 0
                            ? 'text-red-600'
                            : row.variance < 0
                            ? 'text-green-600'
                            : 'text-slate-700'
                        }`}
                      >
                        USD {formatCurrency(row.variance)}
                      </td>

                      <td
                        className={`p-3 text-right font-semibold ${
                          row.variance > 0
                            ? 'text-red-600'
                            : row.variance < 0
                            ? 'text-green-600'
                            : 'text-slate-700'
                        }`}
                      >
                        {row.variancePercentage.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
