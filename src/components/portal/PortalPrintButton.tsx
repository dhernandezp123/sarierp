'use client'
export function PortalPrintButton() { return <button type="button" onClick={() => window.print()} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold dark:border-slate-700 print:hidden">Imprimir / guardar PDF</button> }
