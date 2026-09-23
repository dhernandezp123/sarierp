'use client'

import { Building2 } from 'lucide-react'
import { useTenant } from '@/src/components/tenant/TenantProvider'

export function TenantBrand({
  compact = false,
  inverse = false,
}: {
  compact?: boolean
  inverse?: boolean
}) {
  const tenant = useTenant()
  if (!tenant) return null

  const logoSize = compact ? 'h-10 w-10' : 'h-20 w-40'

  return (
    <div className={`flex items-center justify-center ${compact ? 'gap-3' : 'flex-col gap-4'}`}>
      {tenant.logoUrl ? (
        // El dominio del logo es administrado por cada tenant; el RPC solo entrega HTTPS o rutas locales.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tenant.logoUrl}
          alt={tenant.tradeName}
          className={`${logoSize} object-contain`}
        />
      ) : (
        <span
          className={`${compact ? 'h-10 w-10' : 'h-16 w-16'} flex items-center justify-center rounded-2xl text-white`}
          style={{ backgroundColor: tenant.primaryColor }}
        >
          <Building2 className={compact ? 'h-5 w-5' : 'h-8 w-8'} />
        </span>
      )}
      <span className={`${compact ? 'text-base' : 'text-xl'} font-bold ${inverse ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
        {tenant.tradeName}
      </span>
    </div>
  )
}
