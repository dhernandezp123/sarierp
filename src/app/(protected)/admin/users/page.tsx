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

  if (loading) {
    return <div className="text-sm text-slate-500 dark:text-slate-400">Cargando usuarios...</div>
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

  return (
    <AdminGuard>
      <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Administración de usuarios
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Gestión de accesos y permisos del ERP.
        </p>

        <div className="mt-4">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            ← Regresar al dashboard
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o correo..."
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-400 md:max-w-sm"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-slate-400"
        >
          <option value="Todos">Todos</option>
          <option value="Pendiente">Pendientes</option>
          <option value="Aprobado">Aprobados</option>
          <option value="Rechazado">Rechazados</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/70">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Usuario</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Rol</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Estado</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Acceso</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 dark:text-white">
                    {user.nombre || 'Sin nombre'} {user.apellido || ''}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {user.email || 'Sin email'}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <select
                    value={user.rol}
                    onChange={(e) => {
                      setSelectedUser(user)
                      setNewRole(e.target.value)
                      setChangeReason('')
                      setRoleDialogOpen(true)
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      user.status === 'Aprobado'
                        ? 'bg-emerald-100 text-emerald-700'
                        : user.status === 'Rechazado'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {user.status}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      user.is_active
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {user.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {user.status !== 'Aprobado' && (
                      <button
                        onClick={() => approveUser(user.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        Aprobar
                      </button>
                    )}

                    <button
                      onClick={() => rejectUser(user.id)}
                      className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                    >
                      Rechazar
                    </button>

                    <button
                      onClick={() => toggleActive(user.id, user.is_active)}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
                    >
                      {user.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                  No hay usuarios registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Usuario
              </label>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                {selectedUser?.nombre || 'Sin nombre'}{' '}
                {selectedUser?.apellido || ''}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Nuevo rol
              </label>

              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                Motivo del cambio
              </label>

              <textarea
                value={changeReason}
                onChange={(e) =>
                  setChangeReason(e.target.value)
                }
                rows={4}
                placeholder="Describe el motivo del cambio..."
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRoleDialogOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm"
              >
                Cancelar
              </button>

              <button
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
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingRole
                  ? 'Guardando...'
                  : 'Confirmar cambio'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </>
    </AdminGuard>
  )
}



