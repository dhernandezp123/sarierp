'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
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

type Profile = {
  id: string
  nombre: string | null
  apellido: string | null
  email: string | null
  rol: string
  status: string
  is_active: boolean
  approved_at: string | null
}

const roles = ['Admin', 'Ventas', 'Pricing', 'Contabilidad', 'Operaciones']

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
    case 'Operaciones':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
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
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null)
  const [newRole, setNewRole] = useState('')
  const [changeReason, setChangeReason] = useState('')
  const [savingRole, setSavingRole] = useState(false)

  const fetchUsers = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error cargando usuarios:', error)
      toast.error(error.message)
    }

    if (data) {
      setUsers(data)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const approveUser = async (id: string) => {
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
      .update({
        status: 'Rechazado',
      })
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
      .update({
        is_active: !currentValue,
      })
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
      metadata: {
        previousValue: currentValue,
        newValue: !currentValue,
      },
    })

    toast.success(currentValue ? 'Usuario desactivado' : 'Usuario activado')
    fetchUsers()
  }

  const changeRole = async (
    id: string,
    newRole: string,
    reason: string
  ) => {
    const targetUser = users.find((user) => user.id === id)

    if (!targetUser) {
      toast.error('No se encontró el usuario.')
      return
    }

    const oldRole = targetUser.rol

    if (oldRole === newRole) return

    if (!reason || !reason.trim()) {
      toast.error('Debes ingresar un motivo para cambiar el rol.')
      return
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      toast.error('No se pudo validar el usuario administrador.')
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ rol: newRole })
      .eq('id', id)

    if (updateError) {
      toast.error(updateError.message)
      return
    }

    const { error: logError } = await supabase
      .from('profile_role_change_logs')
      .insert([
        {
          profile_id: id,
          old_role: oldRole,
          new_role: newRole,
          changed_by: user.id,
          reason: reason.trim(),
        },
      ])

    if (logError) {
      toast.error(
        'El rol se cambió, pero no se pudo guardar el log: ' +
          logError.message
      )
      fetchUsers()
      return
    }

    await createActivityLog({
      module: 'admin_users',
      action: 'change_user_role',
      entityType: 'profile',
      entityId: id,
      description: `Rol actualizado de ${oldRole} a ${newRole}`,
      metadata: {
        oldRole,
        newRole,
        reason,
      },
    })

    await createNotification({
      userId: id,
      title: 'Rol actualizado',
      message: `Tu nuevo rol es ${newRole}.`,
      type: 'info',
    })

    toast.success('Rol actualizado')
    fetchUsers()
  }

  const openRoleDialog = (user: Profile) => {
    setSelectedUser(user)
    setNewRole(user.rol)
    setChangeReason('')
    setRoleDialogOpen(true)
  }

  const filteredUsers = users.filter((user) => {
    const fullName = `${user.nombre || ''} ${user.apellido || ''}`.toLowerCase()
    const email = user.email?.toLowerCase() || ''
    const query = search.toLowerCase()

    const matchesSearch =
      fullName.includes(query) || email.includes(query)

    const matchesStatus =
      statusFilter === 'Todos' || user.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const metrics = {
    total: users.length,
    pending: users.filter((user) => user.status === 'Pendiente').length,
    active: users.filter((user) => user.is_active).length,
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

          <Link
            href="/dashboard"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ← Dashboard
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-[#0b1220]">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Total usuarios
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
              {metrics.total}
            </p>
          </div>

          <div
            className={`rounded-2xl border p-5 shadow-sm ${
              metrics.pending > 0
                ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20'
                : 'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#0b1220]'
            }`}
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Pendientes
            </p>
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
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Activos
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
              {metrics.active}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o correo..."
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-400/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
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
                    {['Usuario', 'Rol', 'Estado', 'Acceso', 'Acciones'].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-300"
                        >
                          {heading}
                        </th>
                      )
                    )}
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
                                {user.nombre || 'Sin nombre'}{' '}
                                {user.apellido || ''}
                              </p>
                              <p className="text-xs text-slate-400 dark:text-slate-500">
                                {user.email || 'Sin email'}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getRolBadgeClass(
                                user.rol
                              )}`}
                            >
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
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${getStatusBadgeClass(
                              user.status
                            )}`}
                          >
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
                              onClick={() =>
                                toggleActive(user.id, user.is_active)
                              }
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

      <Dialog
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Cambiar rol de usuario
            </DialogTitle>

            <DialogDescription>
              Esta acción quedará registrada en auditoría.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Usuario
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                {selectedUser?.nombre || 'Sin nombre'}{' '}
                {selectedUser?.apellido || ''}
                {selectedUser?.email && (
                  <span className="ml-2 text-xs text-slate-400">
                    ({selectedUser.email})
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Nuevo rol
              </label>

              <select
                value={newRole}
                onChange={(event) => setNewRole(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Motivo del cambio <span className="text-red-400">*</span>
              </label>

              <textarea
                value={changeReason}
                onChange={(event) =>
                  setChangeReason(event.target.value)
                }
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
                disabled={
                  savingRole ||
                  !changeReason.trim() ||
                  !selectedUser
                }
                onClick={async () => {
                  if (!selectedUser) return

                  setSavingRole(true)

                  await changeRole(
                    selectedUser.id,
                    newRole,
                    changeReason
                  )

                  setSavingRole(false)

                  setRoleDialogOpen(false)
                }}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {savingRole
                  ? 'Guardando...'
                  : 'Confirmar cambio'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminGuard>
  )
}
