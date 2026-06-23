'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Mail, Search, Link2, UserPlus } from 'lucide-react'
import { supabase } from '@/src/lib/supabase/client'
import AdminGuard from '@/src/components/auth/AdminGuard'
import { createActivityLog } from '@/src/lib/activity-logger'
import { createNotification } from '@/src/lib/notifications'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/src/components/ui/dialog'
import { TableSkeleton } from '@/src/components/ui/TableSkeleton'

type Cliente = { id: string; nombre: string; codigo_cliente: string | null }

type Profile = {
  id: string
  nombre: string | null
  apellido: string | null
  email: string | null
  rol: string
  status: string
  is_active: boolean
  approved_at: string | null
  cliente_id: string | null
  registration_company: string | null
  registration_phone: string | null
  clientes: Cliente | null
}

const roles = ['Admin', 'Ventas', 'Pricing', 'Contabilidad', 'Finanzas', 'Operaciones', 'Cliente']

const getRolBadgeClass = (rol: string) => {
  switch (rol) {
    case 'Admin':
      return 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
    case 'Ventas':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
    case 'Pricing':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
    case 'Contabilidad':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    case 'Finanzas':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
    case 'Operaciones':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    case 'Cliente':
      return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300'
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  }
}

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'Aprobado':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    case 'Rechazado':
      return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    default:
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  }
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')

  // Role change dialog
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [newRole, setNewRole] = useState('')
  const [changeReason, setChangeReason] = useState('')
  const [savingRole, setSavingRole] = useState(false)

  // Invite dialog
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRol, setInviteRol] = useState('Ventas')
  const [inviteSending, setInviteSending] = useState(false)

  // Link to cliente dialog
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [linkTarget, setLinkTarget] = useState<Profile | null>(null)
  const [clienteSearch, setClienteSearch] = useState('')
  const [clienteResults, setClienteResults] = useState<Cliente[]>([])
  const [linkSaving, setLinkSaving] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('profiles')
      .select('id, nombre, apellido, email, rol, status, is_active, approved_at, cliente_id, registration_company, registration_phone, clientes!cliente_id(id, nombre, codigo_cliente)')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error(error.message)
    }

    if (data) {
      setUsers(data as unknown as Profile[])
    }

    setLoading(false)
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchUsers(), 0)
    return () => window.clearTimeout(timeout)
  }, [])

  // Debounced cliente search for link dialog
  useEffect(() => {
    if (!linkDialogOpen || clienteSearch.trim().length < 2) {
      const timeout = window.setTimeout(() => setClienteResults([]), 0)
      return () => window.clearTimeout(timeout)
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, codigo_cliente')
        .ilike('nombre', `%${clienteSearch}%`)
        .is('deleted_at', null)
        .limit(8)
      setClienteResults((data ?? []) as Cliente[])
    }, 250)
    return () => clearTimeout(t)
  }, [clienteSearch, linkDialogOpen])

  const approveUser = async (id: string) => {
    const targetUser = users.find((user) => user.id === id)
    if (targetUser?.rol === 'Cliente' && !targetUser.cliente_id) {
      toast.error('Vincula este usuario a un cliente antes de aprobarlo.')
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('profiles')
      .update({
        status: 'Aprobado',
        approved_at: new Date().toISOString(),
        approved_by: user?.id ?? null,
      })
      .eq('id', id)

    if (error) {
      toast.error(error.message)
      return
    }

    await createActivityLog({
      module: 'admin_users',
      action: 'approve_user',
      entityType: 'profile',
      entityId: id,
      description: 'Usuario aprobado por administración',
    })

    await createNotification({
      userId: id,
      title: 'Acceso aprobado',
      message: 'Tu acceso al ERP fue aprobado por administración.',
      type: 'success',
    })

    toast.success('Usuario aprobado')
    fetchUsers()
  }

  const rejectUser = async (id: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'Rechazado' })
      .eq('id', id)

    if (error) {
      toast.error(error.message)
      return
    }

    await createActivityLog({
      module: 'admin_users',
      action: 'reject_user',
      entityType: 'profile',
      entityId: id,
      description: 'Usuario rechazado por administración',
    })

    toast.success('Usuario rechazado')
    fetchUsers()
  }

  const toggleActive = async (id: string, currentValue: boolean) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !currentValue })
      .eq('id', id)

    if (error) {
      toast.error(error.message)
      return
    }

    await createActivityLog({
      module: 'admin_users',
      action: currentValue ? 'deactivate_user' : 'activate_user',
      entityType: 'profile',
      entityId: id,
      description: currentValue
        ? 'Usuario desactivado por administración'
        : 'Usuario activado por administración',
      metadata: { previousValue: currentValue, newValue: !currentValue },
    })

    toast.success(currentValue ? 'Usuario desactivado' : 'Usuario activado')
    fetchUsers()
  }

  const changeRole = async (id: string, role: string, reason: string) => {
    const targetUser = users.find((u) => u.id === id)
    if (!targetUser) { toast.error('No se encontró el usuario.'); return }

    const oldRole = targetUser.rol
    if (oldRole === role) return

    if (!reason.trim()) {
      toast.error('Debes ingresar un motivo para cambiar el rol.')
      return
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) { toast.error('No se pudo validar el usuario administrador.'); return }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ rol: role })
      .eq('id', id)

    if (updateError) { toast.error(updateError.message); return }

    const { error: logError } = await supabase
      .from('profile_role_change_logs')
      .insert([{ profile_id: id, old_role: oldRole, new_role: role, changed_by: user.id, reason: reason.trim() }])

    if (logError) {
      toast.error('El rol se cambió, pero no se pudo guardar el log: ' + logError.message)
      fetchUsers()
      return
    }

    await createActivityLog({
      module: 'admin_users',
      action: 'change_user_role',
      entityType: 'profile',
      entityId: id,
      description: `Rol actualizado de ${oldRole} a ${role}`,
      metadata: { oldRole, newRole: role, reason },
    })

    await createNotification({
      userId: id,
      title: 'Rol actualizado',
      message: `Tu nuevo rol es ${role}.`,
      type: 'info',
    })

    toast.success('Rol actualizado')
    fetchUsers()
  }

  const linkToCliente = async (profileId: string, clienteId: string) => {
    setLinkSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ cliente_id: clienteId })
      .eq('id', profileId)

    if (error) {
      toast.error(error.message)
      setLinkSaving(false)
      return
    }

    await createActivityLog({
      module: 'admin_users',
      action: 'link_client',
      entityType: 'profile',
      entityId: profileId,
      description: `Cuenta portal vinculada a cliente ${clienteId}`,
    })

    toast.success('Cuenta vinculada al cliente')
    setLinkSaving(false)
    setLinkDialogOpen(false)
    setClienteSearch('')
    setClienteResults([])
    fetchUsers()
  }

  const sendInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Ingresa un correo electrónico')
      return
    }
    setInviteSending(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error('Tu sesion expiro. Vuelve a iniciar sesion.')
        return
      }

      const res = await fetch('/api/admin/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), rol: inviteRol }),
      })
      const body = await res.json() as { error?: string; userId?: string }
      if (!res.ok) {
        toast.error(body.error || 'No se pudo enviar la invitación')
        return
      }
      toast.success(`Invitación enviada a ${inviteEmail}`)
      setInviteDialogOpen(false)
      setInviteEmail('')
      setInviteRol('Ventas')
      fetchUsers()
    } finally {
      setInviteSending(false)
    }
  }

  const openRoleDialog = (user: Profile) => {
    setSelectedUser(user)
    setNewRole(user.rol)
    setChangeReason('')
    setRoleDialogOpen(true)
  }

  const openLinkDialog = (user: Profile) => {
    setLinkTarget(user)
    setClienteSearch('')
    setClienteResults([])
    setLinkDialogOpen(true)
  }

  const filteredUsers = users.filter((user) => {
    const fullName = `${user.nombre || ''} ${user.apellido || ''}`.toLowerCase()
    const email = user.email?.toLowerCase() || ''
    const query = search.toLowerCase()
    const matchesSearch = fullName.includes(query) || email.includes(query)
    const matchesStatus = statusFilter === 'Todos' || user.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const metrics = {
    total: users.length,
    pending: users.filter((u) => u.status === 'Pendiente').length,
    active: users.filter((u) => u.is_active).length,
  }

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Administración de usuarios
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Gestión de accesos y permisos del ERP.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setInviteDialogOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            >
              <UserPlus className="h-4 w-4" />
              Invitar usuario
            </button>
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ← Dashboard
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
            <p className="text-sm text-slate-500 dark:text-slate-400">Total usuarios</p>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{metrics.total}</p>
          </div>

          <div
            className={`rounded-2xl border p-5 shadow-sm ${
              metrics.pending > 0
                ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20'
                : 'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]'
            }`}
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">Pendientes</p>
            <p
              className={`mt-2 text-3xl font-bold ${
                metrics.pending > 0
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {metrics.pending}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
            <p className="text-sm text-slate-500 dark:text-slate-400">Activos</p>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{metrics.active}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o correo..."
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-400/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-400/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="Todos">Todos</option>
            <option value="Pendiente">Pendientes</option>
            <option value="Aprobado">Aprobados</option>
            <option value="Rechazado">Rechazados</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
          {loading ? (
            <div className="p-6">
              <TableSkeleton rows={5} cols={5} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-900 dark:bg-[#081120]">
                    {['Usuario', 'Rol', 'Estado', 'Acceso', 'Acciones'].map((heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-300"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500"
                      >
                        No hay usuarios registrados.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-slate-100 transition hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                              {(user.nombre?.[0] || '?').toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 dark:text-white">
                                {user.nombre || 'Sin nombre'} {user.apellido || ''}
                              </p>
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                {user.email || 'Sin email'}
                              </p>
                              {user.registration_company && (
                                <p className="text-[11px] text-blue-600 dark:text-blue-400">
                                  {user.registration_company}
                                  {user.registration_phone ? ` · ${user.registration_phone}` : ''}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getRolBadgeClass(user.rol)}`}>
                                {user.rol}
                              </span>
                              <button
                                type="button"
                                onClick={() => openRoleDialog(user)}
                                className="text-xs text-slate-400 underline underline-offset-2 transition hover:text-slate-700 dark:hover:text-slate-200"
                              >
                                Cambiar
                              </button>
                            </div>

                            {user.rol === 'Cliente' && (
                              <div className="flex items-center gap-1.5">
                                {user.clientes ? (
                                  <span className="truncate max-w-[120px] text-[11px] text-slate-500 dark:text-slate-400">
                                    {user.clientes.nombre}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-amber-600 dark:text-amber-400">Sin vincular</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openLinkDialog(user)}
                                  className="flex items-center gap-0.5 text-[11px] text-cyan-600 underline underline-offset-2 hover:text-cyan-700 dark:text-cyan-400"
                                >
                                  <Link2 className="h-2.5 w-2.5" />
                                  {user.clientes ? 'Cambiar' : 'Vincular'}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getStatusBadgeClass(user.status)}`}>
                            {user.status || 'Pendiente'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                              user.is_active
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {user.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {user.status !== 'Aprobado' && (
                              <button
                                type="button"
                                onClick={() => approveUser(user.id)}
                                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-emerald-900/50 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400"
                              >
                                Aprobar
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => rejectUser(user.id)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:border-red-200 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-900/50 dark:hover:text-red-400"
                            >
                              Rechazar
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleActive(user.id, user.is_active)}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                            >
                              {user.is_active ? 'Desactivar' : 'Activar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>

              <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {filteredUsers.length} de {users.length} usuarios
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={(open) => { setInviteDialogOpen(open); if (!open) { setInviteEmail(''); setInviteRol('Ventas') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invitar nuevo usuario</DialogTitle>
            <DialogDescription>
              Se enviará un correo con un enlace de activación. El usuario completará su nombre al aceptar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Correo electrónico <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Rol asignado <span className="text-red-400">*</span>
              </label>
              <select
                value={inviteRol}
                onChange={(e) => setInviteRol(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-400">
                {inviteRol === 'Cliente'
                  ? 'El cliente deberá vincularse a su empresa antes de aprobar el acceso.'
                  : 'El usuario interno quedará activo al aceptar la invitación.'}
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
              <div className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Supabase enviará el email de invitación. Asegúrate de que <strong>SUPABASE_SERVICE_ROLE_KEY</strong> esté configurada en <code>.env.local</code>.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setInviteDialogOpen(false); setInviteEmail(''); setInviteRol('Ventas') }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={inviteSending || !inviteEmail.trim()}
                onClick={sendInvite}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                <Mail className="h-4 w-4" />
                {inviteSending ? 'Enviando...' : 'Enviar invitación'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Role change dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar rol de usuario</DialogTitle>
            <DialogDescription>Esta acción quedará registrada en auditoría.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Usuario</label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {selectedUser?.nombre || 'Sin nombre'} {selectedUser?.apellido || ''}
                {selectedUser?.email && (
                  <span className="ml-2 text-xs text-slate-400">({selectedUser.email})</span>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Nuevo rol</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
              {newRole === 'Cliente' && (
                <p className="mt-1.5 text-xs text-cyan-600 dark:text-cyan-400">
                  Después de guardar, vincula este usuario a un cliente desde la tabla (columna Rol → Vincular).
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Motivo del cambio <span className="text-red-400">*</span>
              </label>
              <textarea
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                rows={3}
                placeholder="Describe el motivo del cambio..."
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRoleDialogOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={savingRole || !changeReason.trim() || !selectedUser}
                onClick={async () => {
                  if (!selectedUser) return
                  setSavingRole(true)
                  await changeRole(selectedUser.id, newRole, changeReason)
                  setSavingRole(false)
                  setRoleDialogOpen(false)
                }}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {savingRole ? 'Guardando...' : 'Confirmar cambio'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link to cliente dialog */}
      <Dialog
        open={linkDialogOpen}
        onOpenChange={(open) => {
          setLinkDialogOpen(open)
          if (!open) { setClienteSearch(''); setClienteResults([]) }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular a cliente</DialogTitle>
            <DialogDescription>
              Asocia esta cuenta portal con un cliente del sistema para que pueda ver sus paquetes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Usuario</label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {linkTarget?.nombre || 'Sin nombre'} {linkTarget?.apellido || ''}
              </div>
            </div>

            {linkTarget?.clientes && (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2.5 dark:border-cyan-900/40 dark:bg-cyan-950/20">
                <p className="text-xs text-cyan-600 dark:text-cyan-400">Vinculado actualmente a:</p>
                <p className="mt-0.5 font-semibold text-cyan-800 dark:text-cyan-200">{linkTarget.clientes.nombre}</p>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Buscar cliente <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={clienteSearch}
                  onChange={(e) => setClienteSearch(e.target.value)}
                  placeholder="Escribe el nombre del cliente..."
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-4 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>

              {clienteResults.length > 0 && (
                <div className="mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900">
                  {clienteResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={linkSaving}
                      onClick={() => {
                        if (!linkTarget) return
                        linkToCliente(linkTarget.id, c.id)
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:opacity-60 dark:hover:bg-slate-800"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{c.nombre}</p>
                        {c.codigo_cliente && (
                          <p className="text-xs text-slate-400">{c.codigo_cliente}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {clienteSearch.length >= 2 && clienteResults.length === 0 && (
                <p className="mt-1.5 text-xs text-slate-400">No se encontraron clientes con ese nombre.</p>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { setLinkDialogOpen(false); setClienteSearch(''); setClienteResults([]) }}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminGuard>
  )
}
