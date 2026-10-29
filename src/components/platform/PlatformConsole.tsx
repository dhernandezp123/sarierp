'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Building2, Users, LifeBuoy, ShieldCheck, Plus, RefreshCw, Search, ExternalLink, Copy, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { useUser } from '@/src/hooks/useUser'
import { canManagePlatform, COMPANY_STATUSES, ACCESS_STATUSES, type PlatformSection, type PlatformData, type PlatformCompany, type PlatformUser, type PlatformEvent } from '@/src/lib/platform-admin'
import { formatDateTime } from '@/src/lib/format'
import { cardClass, fieldClassSm, primaryButtonClass, secondaryButtonClass, fieldLabelClass } from '@/src/lib/ui-classes'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'
import { PlatformCompanyDialog, PlatformUserDialog } from './PlatformDialogs'

const headings: Record<PlatformSection, [string, string]> = {
  overview: ['Administración de plataforma', 'Empresas, accesos y atención de Forwarders ERP.'],
  companies: ['Empresas y accesos', 'Administra las empresas registradas y la disponibilidad de su acceso.'],
  users: ['Usuarios', 'Revisa solicitudes y administra los permisos de cada empresa.'],
  activity: ['Actividad administrativa', 'Consulta quién realizó cada cambio, cuándo y por qué.'],
}
const actionNames: Record<string, string> = { company_created: 'Empresa registrada', company_updated: 'Empresa actualizada', user_access_updated: 'Acceso actualizado' }

function Status({ value }: { value: string }) {
  const active = ['Activo', 'Aprobado', 'Habilitado'].includes(value)
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'}`}>{value}</span>
}

function Activity({ rows }: { rows: PlatformEvent[] }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-slate-500">Aún no hay cambios administrativos registrados.</p>
  return <ul className="divide-y divide-slate-200 dark:divide-slate-700">{rows.map(row => <li key={row.id} className="py-4 first:pt-0 last:pb-0">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{actionNames[row.action] || row.action}</p><time className="text-xs text-slate-500">{formatDateTime(row.created_at)}</time></div>
    <p className="mt-1 break-words text-sm">{row.entity_name}{row.company_name && ` · ${row.company_name}`}</p>
    <p className="mt-2 break-words text-sm text-slate-600 dark:text-slate-300">{row.reason}</p>
    <p className="mt-1 break-words text-xs text-slate-500">Por {row.actor_name}</p>
  </li>)}</ul>
}

export function PlatformConsole({ section }: { section: PlatformSection }) {
  const { user, profile, loading: userLoading } = useUser()
  const allowed = !userLoading && !!user && profile?.id === user.id && canManagePlatform(profile)
  const identity = `${user?.id}:${profile?.tenant_id}:${profile?.rol}:${profile?.status}:${profile?.is_active}:${profile?.is_platform_admin}`
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; data: PlatformData | null; error: string }>({ key: '', data: null, error: '' })
  const [companyEditor, setCompanyEditor] = useState<{ identity: string; company: PlatformCompany | null } | null>(null)
  const [userEditor, setUserEditor] = useState<{ identity: string; user: PlatformUser } | null>(null)
  const requestKey = JSON.stringify([identity, section, query, status, page, revision])
  const current = result.key === requestKey && allowed
  const data = current ? result.data : null
  const error = current ? result.error : ''
  const loading = allowed && !current

  useEffect(() => {
    if (!allowed) return
    const controller = new AbortController()
    let active = true
    const params = new URLSearchParams({ section, search: query, status, page: String(page) })
    fetch('/api/platform?' + params, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => null)
        if (!response.ok || !body) throw new Error(body?.error || 'No se pudo cargar la administración. Intenta nuevamente.')
        if (active) setResult({ key: requestKey, data: body, error: '' })
      }).catch(cause => {
        if (active) setResult({ key: requestKey, data: null, error: cause instanceof Error ? cause.message : 'No se pudo cargar la administración.' })
      })
    return () => { active = false; controller.abort() }
  }, [allowed, requestKey, section, query, status, page])

  const refresh = () => setRevision(value => value + 1)
  const saved = () => { setCompanyEditor(null); setUserEditor(null); refresh() }
  async function copyAccess(hostname: string) {
    try { await navigator.clipboard.writeText(`https://${hostname}/login`); toast.success('Enlace copiado.') }
    catch { toast.error('No se pudo copiar. Puedes abrir el enlace y copiarlo desde el navegador.') }
  }
  if (!allowed) return null
  const [title, description] = headings[section]
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1
  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400">Hernova Systems</p><h1 className="text-2xl font-bold sm:text-3xl">{title}</h1><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={refresh} disabled={loading} className={`${secondaryButtonClass} inline-flex items-center gap-2`}><RefreshCw size={16} />Actualizar</button>
        {section === 'companies' && <button type="button" onClick={() => setCompanyEditor({ identity, company: null })} className={`${primaryButtonClass} inline-flex items-center gap-2`}><Plus size={16} />Registrar empresa</button>}
      </div>
    </header>

    {section !== 'overview' && <form onSubmit={event => { event.preventDefault(); setQuery(search.trim()); setPage(1) }} className="flex flex-wrap items-end gap-3">
      <label className="flex w-full min-w-0 flex-col gap-1.5 text-sm sm:w-auto sm:flex-1"><span className={fieldLabelClass}>Buscar</span>
        <input value={search} maxLength={100} onChange={event => setSearch(event.target.value)} className={fieldClassSm} placeholder={section === 'users' ? 'Nombre, correo o empresa' : section === 'companies' ? 'Nombre o subdominio' : 'Empresa, motivo o administrador'} />
      </label>
      {(section === 'companies' || section === 'users') && <label className="flex min-w-0 flex-col gap-1.5 text-sm"><span className={fieldLabelClass}>Estado</span>
        <select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }} className={fieldClassSm}><option value="">Todos</option>{(section === 'companies' ? COMPANY_STATUSES : ACCESS_STATUSES).map(value => <option key={value}>{value}</option>)}</select>
      </label>}
      <button type="submit" className={`${secondaryButtonClass} inline-flex items-center gap-2`}><Search size={16} />Buscar</button>
    </form>}

    {loading && <div aria-label="Cargando administración" role="status"><TableSkeleton rows={5} cols={4} /></div>}
    {error && <div role="alert" className={`${cardClass} border-red-200`}><p className="font-semibold">No se pudo cargar esta sección</p><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{error}</p><button type="button" onClick={refresh} className={`${secondaryButtonClass} mt-4`}>Reintentar</button></div>}

    {section === 'overview' && data?.summary && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Empresas', value: data.summary.companies, detail: `${data.summary.active_companies} activas · ${data.summary.suspended_companies} suspendidas`, icon: Building2, href: '/platform/companies' },
          { label: 'Usuarios de empresas', value: data.summary.users, detail: 'Directorio de accesos', icon: Users, href: '/platform/users' },
          { label: 'Solicitudes pendientes', value: data.summary.pending_users, detail: 'Usuarios por aprobar', icon: ShieldCheck, href: '/platform/users' },
          { label: 'Tickets abiertos', value: data.summary.open_tickets, detail: 'Seguimiento en mesa de ayuda', icon: LifeBuoy, href: '/support' },
        ].map(item => <Link key={item.label} href={item.href} className={`${cardClass} transition hover:border-blue-400`}>
          <div className="flex items-center justify-between gap-2"><p className="text-sm text-slate-500 dark:text-slate-400">{item.label}</p><item.icon size={20} className="text-blue-600" /></div>
          <p className="mt-4 text-3xl font-bold">{item.value}</p><p className="mt-2 text-xs text-slate-500">{item.detail}</p>
        </Link>)}
      </div>
      <section className="rounded-2xl bg-[#07111F] p-6 text-white sm:p-8"><p className="text-xs font-semibold uppercase tracking-widest text-orange-400">Gestión central</p><h2 className="mt-3 text-xl font-bold">Cada empresa, con su propio acceso</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Registra empresas, revisa sus administradores y da seguimiento a las solicitudes de acceso desde un solo lugar.</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/platform/companies" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900">Administrar empresas<ArrowRight size={16} /></Link><Link href="/support" className="rounded-xl border border-white/30 px-4 py-3 text-sm font-semibold">Abrir mesa de ayuda</Link></div></section>
      <section className={cardClass}><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Actividad reciente</h2><Link href="/platform/activity" className="text-sm font-semibold text-blue-600 dark:text-blue-400">Ver toda la actividad</Link></div><Activity rows={(data.activity || []).slice(0, 5)} /></section>
    </>}

    {section === 'companies' && data && <div className="grid gap-4 lg:grid-cols-2">
      {!data.companies?.length && <p className={`${cardClass} col-span-full py-10 text-center text-sm text-slate-500`}>No hay empresas para estos filtros.</p>}
      {data.companies?.map(company => <section key={company.id} className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-bold">{company.name}</h2><p className="mt-1 text-xs text-slate-500">{company.users_count} usuarios · {company.admins_count} administradores activos</p></div><Status value={company.status} /></div>
        <ul className="mt-4 space-y-2">{company.domains.map(domain => <li key={domain.hostname} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
          <p className="break-all text-sm font-medium">{domain.hostname}</p><div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>{domain.is_primary ? 'Principal' : 'Adicional'} · {domain.is_active ? 'Registrado' : 'Inactivo'}</span>
            {domain.is_active && <><a href={`https://${domain.hostname}/login`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">Abrir acceso<ExternalLink size={13} /></a><button type="button" onClick={() => void copyAccess(domain.hostname)} className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400"><Copy size={13} />Copiar enlace</button></>}
          </div>
        </li>)}</ul>
        {company.admins_count === 0 && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Sin administrador activo. Revisa sus solicitudes de acceso en Usuarios.</p>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Registrada: {formatDateTime(company.created_at)}</p><button type="button" onClick={() => setCompanyEditor({ identity, company })} className={secondaryButtonClass}>Administrar empresa</button></div>
      </section>)}
    </div>}

    {section === 'users' && data && <div className={`${cardClass} overflow-x-auto p-0`}>
      <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900"><tr>{['Usuario', 'Empresa / rol', 'Acceso', 'Último ingreso', 'Acciones'].map(label => <th key={label} scope="col" className="px-4 py-3">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">{data.users?.map(person => <tr key={person.id}>
          <td className="px-4 py-4"><p className="font-semibold">{[person.nombre, person.apellido].filter(Boolean).join(' ') || 'Sin nombre'}</p><p className="mt-1 break-all text-xs text-slate-500">{person.email || 'Sin correo'}</p></td>
          <td className="px-4 py-4"><p>{person.is_platform_admin ? 'Plataforma' : person.company_name || 'Sin empresa'}</p><p className="mt-1 text-xs text-slate-500">{person.rol}</p></td>
          <td className="px-4 py-4"><Status value={person.status} /><p className="mt-1 text-xs text-slate-500">{person.is_active ? 'Habilitado' : 'Deshabilitado'}</p></td>
          <td className="whitespace-nowrap px-4 py-4 text-xs text-slate-500">{formatDateTime(person.last_sign_in_at, 'Sin ingresos')}</td>
          <td className="px-4 py-4">{!person.is_platform_admin && person.tenant_id
            ? <button type="button" onClick={() => setUserEditor({ identity, user: person })} className={secondaryButtonClass}>Administrar acceso</button>
            : <span className="text-xs text-slate-500">{person.is_platform_admin ? 'Cuenta de plataforma protegida' : 'Requiere revisión de asignación'}</span>}</td>
        </tr>)}{!data.users?.length && <tr><td colSpan={5} className="p-10 text-center text-slate-500">No hay usuarios para estos filtros.</td></tr>}</tbody>
      </table>
    </div>}
    {section === 'activity' && data && <section className={cardClass}><Activity rows={data.activity || []} /></section>}
    {section !== 'overview' && data && <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-slate-500">{data.total} registros · Página {page} de {totalPages}</p><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} className={secondaryButtonClass}>Anterior</button><button type="button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)} className={secondaryButtonClass}>Siguiente</button></div></div>}
    {companyEditor?.identity === identity && <PlatformCompanyDialog company={companyEditor.company} onCancel={() => setCompanyEditor(null)} onSaved={saved} />}
    {userEditor?.identity === identity && <PlatformUserDialog user={userEditor.user} onCancel={() => setUserEditor(null)} onSaved={saved} />}
  </div>
}
